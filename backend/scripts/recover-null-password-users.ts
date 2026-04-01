import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { AuthService } from '../src/auth/auth.service';
import { CpfUtil } from '../src/common/utils/cpf.util';
import {
  ensureDir,
  getStringArg,
  hasFlag,
  parseCliArgs,
  withNestAppContext,
  writeJsonFile,
} from './disaster-recovery/common';

type NullPasswordUserRow = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  status: boolean;
  ai_processing_consent: boolean;
};

type EmailMappingInput = {
  cpf: string;
  email: string;
};

type Report = {
  version: 1;
  type: 'recover_null_password_users';
  mode: 'dry_run' | 'apply';
  status: 'dry_run' | 'success' | 'failed';
  startedAt: string;
  completedAt: string | null;
  reportFile: string;
  mappingFile: string | null;
  summary: {
    candidates: number;
    mappingsProvided: number;
    mappingsValid: number;
    usersUpdated: number;
    resetRequested: number;
    resetFailed: number;
  };
  candidates: Array<{
    id: string;
    nome: string;
    cpfMasked: string | null;
    emailMasked: string | null;
    status: boolean;
    ai_processing_consent: boolean;
  }>;
  updates: Array<{
    userId: string;
    cpfMasked: string;
    emailMasked: string;
    updateStatus: 'updated' | 'skipped';
    resetStatus: 'requested' | 'failed' | 'skipped';
    details?: string;
  }>;
  warnings: string[];
  errors: string[];
};

const TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'scripts',
  'recovery',
  'templates',
  'null-password-users-email-map.template.json',
);

function createTimestampLabel(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function maskCpf(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/\d(?=\d{2})/g, '*');
}

function maskEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/(^.).+(@.*$)/, '$1***$2');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function loadMappings(filePath: string): EmailMappingInput[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Arquivo de mapeamento deve ser um array JSON.');
  }
  return parsed as EmailMappingInput[];
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const apply = hasFlag(args, 'apply');
  const dryRun = !apply;
  const timestamp = createTimestampLabel(new Date());
  const outputDir = path.resolve(
    process.cwd(),
    getStringArg(args, 'output-dir') ||
      path.join('output', 'recovery', 'null-password-users'),
  );
  const reportFile = path.resolve(
    outputDir,
    getStringArg(args, 'report-file') || `null-password-users-${timestamp}.json`,
  );
  const mappingFile = getStringArg(args, 'map-file')
    ? path.resolve(process.cwd(), getStringArg(args, 'map-file') as string)
    : null;

  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

  await ensureDir(outputDir);
  await ensureDir(path.dirname(TEMPLATE_PATH));

  if (!fs.existsSync(TEMPLATE_PATH)) {
    fs.writeFileSync(
      TEMPLATE_PATH,
      `${JSON.stringify(
        [
          { cpf: '00000000000', email: 'usuario1@empresa.com.br' },
          { cpf: '11111111111', email: 'usuario2@empresa.com.br' },
        ],
        null,
        2,
      )}\n`,
      'utf8',
    );
  }

  const report: Report = {
    version: 1,
    type: 'recover_null_password_users',
    mode: dryRun ? 'dry_run' : 'apply',
    status: dryRun ? 'dry_run' : 'failed',
    startedAt: new Date().toISOString(),
    completedAt: null,
    reportFile,
    mappingFile,
    summary: {
      candidates: 0,
      mappingsProvided: 0,
      mappingsValid: 0,
      usersUpdated: 0,
      resetRequested: 0,
      resetFailed: 0,
    },
    candidates: [],
    updates: [],
    warnings: [],
    errors: [],
  };

  const contextOverrides: Record<string, string> = {
    NODE_ENV: 'production',
    REDIS_DISABLED: 'true',
    API_CRONS_DISABLED: 'true',
    REDIS_ALLOW_IN_MEMORY_FALLBACK_IN_PROD: 'true',
  };

  try {
    await withNestAppContext(contextOverrides, async (app) => {
      const dataSource = app.get(DataSource);
      const authService = app.get(AuthService);

      const candidates = (await dataSource.query(
        `
        SELECT id, nome, cpf, email, status, ai_processing_consent
        FROM public.users
        WHERE status = true
          AND (password IS NULL OR btrim(password) = '')
        ORDER BY created_at ASC NULLS LAST, id ASC
        `,
      )) as NullPasswordUserRow[];

      report.summary.candidates = candidates.length;
      report.candidates = candidates.map((row) => ({
        id: row.id,
        nome: row.nome,
        cpfMasked: maskCpf(row.cpf),
        emailMasked: maskEmail(row.email),
        status: row.status,
        ai_processing_consent: row.ai_processing_consent,
      }));

      if (dryRun) {
        report.warnings.push(
          'Dry-run: nenhuma alteração aplicada. Informe --apply com --map-file para executar atualização de e-mails e reset.',
        );
        report.warnings.push(`Template disponível em: ${TEMPLATE_PATH}`);
        report.status = 'dry_run';
        return;
      }

      if (!mappingFile) {
        throw new Error(
          'Para --apply é obrigatório informar --map-file com CPF/e-mail dos usuários alvo.',
        );
      }
      if (!fs.existsSync(mappingFile)) {
        throw new Error(`Arquivo de mapeamento não encontrado: ${mappingFile}`);
      }

      const mappings = loadMappings(mappingFile);
      report.summary.mappingsProvided = mappings.length;

      const byCpf = new Map<string, string>();
      for (const item of mappings) {
        const cpf = CpfUtil.normalize(String(item.cpf || ''));
        const email = String(item.email || '').trim().toLowerCase();
        if (!CpfUtil.validate(cpf)) {
          report.errors.push(`CPF inválido no map-file: ${item.cpf}`);
          continue;
        }
        if (!isValidEmail(email)) {
          report.errors.push(`Email inválido no map-file para CPF ${cpf}: ${email}`);
          continue;
        }
        byCpf.set(cpf, email);
      }

      report.summary.mappingsValid = byCpf.size;
      if (report.errors.length > 0) {
        throw new Error('Arquivo de mapeamento possui erros de validação.');
      }

      const candidatesByCpf = new Map(
        candidates
          .filter((row) => row.cpf)
          .map((row) => [CpfUtil.normalize(row.cpf as string), row]),
      );

      for (const cpf of byCpf.keys()) {
        if (!candidatesByCpf.has(cpf)) {
          report.warnings.push(
            `CPF ${maskCpf(cpf)} informado no map-file não está na lista atual de usuários sem senha ativa.`,
          );
        }
      }

      await dataSource.transaction('SERIALIZABLE', async (manager) => {
        await manager.query(`SET LOCAL app.is_super_admin = 'true'`);

        for (const candidate of candidates) {
          const normalizedCpf = candidate.cpf
            ? CpfUtil.normalize(candidate.cpf)
            : null;
          if (!normalizedCpf || !byCpf.has(normalizedCpf)) {
            report.updates.push({
              userId: candidate.id,
              cpfMasked: maskCpf(normalizedCpf) || '***',
              emailMasked: maskEmail(candidate.email) || 'null',
              updateStatus: 'skipped',
              resetStatus: 'skipped',
              details: 'CPF sem mapeamento de e-mail no map-file.',
            });
            continue;
          }

          const nextEmail = byCpf.get(normalizedCpf) as string;
          await manager.query(
            `
            UPDATE public.users
            SET email = $2,
                updated_at = NOW()
            WHERE id = $1
            `,
            [candidate.id, nextEmail],
          );

          report.summary.usersUpdated += 1;
          report.updates.push({
            userId: candidate.id,
            cpfMasked: maskCpf(normalizedCpf) || '***',
            emailMasked: maskEmail(nextEmail) || '***',
            updateStatus: 'updated',
            resetStatus: 'skipped',
          });
        }
      });

      for (const update of report.updates) {
        if (update.updateStatus !== 'updated') {
          continue;
        }

        const user = candidates.find((item) => item.id === update.userId);
        const cpf = user?.cpf ? CpfUtil.normalize(user.cpf) : null;
        if (!cpf) {
          update.resetStatus = 'failed';
          update.details = 'CPF ausente após atualização.';
          report.summary.resetFailed += 1;
          continue;
        }

        try {
          await authService.forgotPassword(cpf);
          update.resetStatus = 'requested';
          report.summary.resetRequested += 1;
        } catch (error) {
          update.resetStatus = 'failed';
          update.details =
            error instanceof Error ? error.message : String(error);
          report.summary.resetFailed += 1;
        }
      }

      report.status = 'success';
    });
  } catch (error) {
    report.status = 'failed';
    report.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    report.completedAt = new Date().toISOString();
    await writeJsonFile(reportFile, report);
    console.log(JSON.stringify(report, null, 2));
    console.log(`REPORT_FILE=${reportFile}`);
    const exitCode = report.status === 'failed' ? 1 : 0;
    if (process.env.RECOVER_NULL_PASSWORD_NO_EXIT === 'true') {
      process.exitCode = exitCode;
      return;
    }
    process.exit(exitCode);
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    `Falha em recover-null-password-users: ${
      error instanceof Error ? error.stack || error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
