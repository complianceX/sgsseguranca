import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource, QueryRunner } from 'typeorm';
import type { INestApplicationContext } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';
import { CnpjUtil } from '../src/common/utils/cnpj.util';
import { CpfUtil } from '../src/common/utils/cpf.util';
import {
  ensureDir,
  getStringArg,
  hasFlag,
  parseCliArgs,
  writeJsonFile,
} from './disaster-recovery/common';

type CsvInputRow = {
  rowNumber: number;
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  responsavel: string;
  emailContatoEmpresa?: string | null;
  nome: string;
  email: string;
  cpf: string;
  funcao: string;
  perfil?: string | null;
};

type ValidationIssue = {
  rowNumber: number;
  code: string;
  message: string;
};

type ExistingCompanyRow = {
  id: string;
  cnpj: string;
  razao_social: string;
};

type ExistingUserRow = {
  id: string;
  cpf: string | null;
  email: string | null;
};

type ProfileRow = {
  id: string;
  nome: string;
};

type InsertedCompanyRecord = {
  rowNumber: number;
  id: string;
  cnpj: string;
  razaoSocial: string;
};

type InsertedUserRecord = {
  rowNumber: number;
  id: string;
  cpf: string;
  email: string;
  nome: string;
  companyId: string;
  profileId: string;
};

type SkippedRecord = {
  rowNumber: number;
  entity: 'company' | 'user';
  reason:
    | 'company_cnpj_exists'
    | 'user_cpf_exists'
    | 'user_email_exists'
    | 'invalid_profile';
  identifier: string;
  details?: string;
};

type PasswordResetRecord = {
  userId: string;
  cpf: string;
  status: 'requested' | 'failed';
  details?: string;
};

type RecoveryReport = {
  version: 1;
  type: 'ajn_quality_csv_recovery';
  mode: 'dry_run' | 'apply';
  status: 'dry_run' | 'success' | 'validation_failed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  inputFile: string;
  reportFile: string;
  rollbackFile: string;
  defaults: {
    defaultProfileName: string;
  };
  summary: {
    totalRows: number;
    validRows: number;
    validationErrors: number;
    companiesInserted: number;
    companiesSkippedExisting: number;
    usersInserted: number;
    usersSkippedCpfConflict: number;
    usersSkippedEmailConflict: number;
    passwordResetRequested: number;
    passwordResetFailed: number;
  };
  inserted: {
    companies: InsertedCompanyRecord[];
    users: InsertedUserRecord[];
  };
  skipped: SkippedRecord[];
  passwordResets: PasswordResetRecord[];
  errors: ValidationIssue[];
  notes: string[];
};

const DEFAULT_PROFILE_NAME = 'Operador / Colaborador';
const REQUIRED_HEADERS = [
  'razao_social',
  'cnpj',
  'endereco',
  'responsavel',
  'nome',
  'email',
  'cpf',
  'funcao',
];
const OPTIONAL_HEADERS = ['email_contato_empresa', 'perfil'];

function createTimestampLabel(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function normalizeHeader(value: string): string {
  return removeDiacritics(value)
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_');
}

function removeDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeProfileKey(value: string): string {
  return removeDiacritics(value).trim().toLowerCase();
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function isEmailValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseCsvInput(filePath: string): {
  rows: CsvInputRow[];
  errors: ValidationIssue[];
} {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: [
        {
          rowNumber: 1,
          code: 'CSV_EMPTY',
          message: 'CSV sem dados. Inclua cabeçalho e pelo menos uma linha.',
        },
      ],
    };
  }

  const headerColumns = parseCsvLine(lines[0]).map(normalizeHeader);
  const headerIndex = new Map<string, number>();
  headerColumns.forEach((name, idx) => {
    headerIndex.set(name, idx);
  });

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headerIndex.has(header));
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      errors: [
        {
          rowNumber: 1,
          code: 'CSV_HEADER_INVALID',
          message: `Cabeçalhos obrigatórios ausentes: ${missingHeaders.join(', ')}`,
        },
      ],
    };
  }

  const rows: CsvInputRow[] = [];
  const errors: ValidationIssue[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const columns = parseCsvLine(lines[lineIndex]);
    const rowNumber = lineIndex + 1;
    const read = (header: string): string =>
      (columns[headerIndex.get(header) ?? -1] || '').trim();

    const razaoSocial = read('razao_social');
    const cnpjRaw = read('cnpj');
    const endereco = read('endereco');
    const responsavel = read('responsavel');
    const nome = read('nome');
    const emailRaw = read('email').toLowerCase();
    const cpfRaw = read('cpf');
    const funcao = read('funcao');
    const emailContatoEmpresaRaw = headerIndex.has('email_contato_empresa')
      ? read('email_contato_empresa').toLowerCase()
      : '';
    const perfilRaw = headerIndex.has('perfil') ? read('perfil') : '';

    const cnpj = CnpjUtil.normalize(cnpjRaw);
    const cpf = CpfUtil.normalize(cpfRaw);

    if (!razaoSocial) {
      errors.push({
        rowNumber,
        code: 'REQUIRED_FIELD',
        message: 'Campo obrigatório ausente: razao_social',
      });
    }
    if (!cnpjRaw) {
      errors.push({
        rowNumber,
        code: 'REQUIRED_FIELD',
        message: 'Campo obrigatório ausente: cnpj',
      });
    } else if (!CnpjUtil.validate(cnpj)) {
      errors.push({
        rowNumber,
        code: 'INVALID_CNPJ',
        message: `CNPJ inválido: ${cnpjRaw}`,
      });
    }
    if (!endereco) {
      errors.push({
        rowNumber,
        code: 'REQUIRED_FIELD',
        message: 'Campo obrigatório ausente: endereco',
      });
    }
    if (!responsavel) {
      errors.push({
        rowNumber,
        code: 'REQUIRED_FIELD',
        message: 'Campo obrigatório ausente: responsavel',
      });
    }
    if (!nome) {
      errors.push({
        rowNumber,
        code: 'REQUIRED_FIELD',
        message: 'Campo obrigatório ausente: nome',
      });
    }
    if (!emailRaw) {
      errors.push({
        rowNumber,
        code: 'REQUIRED_FIELD',
        message: 'Campo obrigatório ausente: email',
      });
    } else if (!isEmailValid(emailRaw)) {
      errors.push({
        rowNumber,
        code: 'INVALID_EMAIL',
        message: `Email inválido: ${emailRaw}`,
      });
    }
    if (!cpfRaw) {
      errors.push({
        rowNumber,
        code: 'REQUIRED_FIELD',
        message: 'Campo obrigatório ausente: cpf',
      });
    } else if (!CpfUtil.validate(cpf)) {
      errors.push({
        rowNumber,
        code: 'INVALID_CPF',
        message: `CPF inválido: ${cpfRaw}`,
      });
    }
    if (!funcao) {
      errors.push({
        rowNumber,
        code: 'REQUIRED_FIELD',
        message: 'Campo obrigatório ausente: funcao',
      });
    }
    if (emailContatoEmpresaRaw && !isEmailValid(emailContatoEmpresaRaw)) {
      errors.push({
        rowNumber,
        code: 'INVALID_EMAIL',
        message: `email_contato_empresa inválido: ${emailContatoEmpresaRaw}`,
      });
    }

    rows.push({
      rowNumber,
      razaoSocial,
      cnpj,
      endereco,
      responsavel,
      emailContatoEmpresa: emailContatoEmpresaRaw || null,
      nome,
      email: emailRaw,
      cpf,
      funcao,
      perfil: perfilRaw || null,
    });
  }

  return { rows, errors };
}

function validateRowConsistency(rows: CsvInputRow[]): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const seenCpf = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  const companyByCnpj = new Map<
    string,
    {
      rowNumber: number;
      razaoSocial: string;
      endereco: string;
      responsavel: string;
      emailContatoEmpresa?: string | null;
    }
  >();

  for (const row of rows) {
    if (seenCpf.has(row.cpf)) {
      errors.push({
        rowNumber: row.rowNumber,
        code: 'DUPLICATED_CPF_CSV',
        message: `CPF duplicado no CSV (${row.cpf}), primeira ocorrência na linha ${seenCpf.get(row.cpf)}.`,
      });
    } else {
      seenCpf.set(row.cpf, row.rowNumber);
    }

    if (seenEmail.has(row.email)) {
      errors.push({
        rowNumber: row.rowNumber,
        code: 'DUPLICATED_EMAIL_CSV',
        message: `Email duplicado no CSV (${row.email}), primeira ocorrência na linha ${seenEmail.get(row.email)}.`,
      });
    } else {
      seenEmail.set(row.email, row.rowNumber);
    }

    const existingCompany = companyByCnpj.get(row.cnpj);
    if (!existingCompany) {
      companyByCnpj.set(row.cnpj, {
        rowNumber: row.rowNumber,
        razaoSocial: row.razaoSocial,
        endereco: row.endereco,
        responsavel: row.responsavel,
        emailContatoEmpresa: row.emailContatoEmpresa || null,
      });
      continue;
    }

    const sameDefinition =
      existingCompany.razaoSocial === row.razaoSocial &&
      existingCompany.endereco === row.endereco &&
      existingCompany.responsavel === row.responsavel &&
      (existingCompany.emailContatoEmpresa || null) ===
        (row.emailContatoEmpresa || null);
    if (!sameDefinition) {
      errors.push({
        rowNumber: row.rowNumber,
        code: 'COMPANY_DATA_CONFLICT_CSV',
        message: `CNPJ ${row.cnpj} aparece com dados diferentes (primeira ocorrência linha ${existingCompany.rowNumber}).`,
      });
    }
  }

  return errors;
}

function buildRollbackSql(input: {
  insertedUserIds: string[];
  insertedCompanyIds: string[];
  generatedAt: string;
}): string {
  const userIds = Array.from(new Set(input.insertedUserIds));
  const companyIds = Array.from(new Set(input.insertedCompanyIds));

  const lines: string[] = [];
  lines.push('-- Rollback SQL gerado automaticamente');
  lines.push(`-- generated_at: ${input.generatedAt}`);
  lines.push('BEGIN;');

  if (userIds.length > 0) {
    lines.push('-- Remove usuários criados na execução de recuperação');
    lines.push(
      `DELETE FROM public.users WHERE id IN (${userIds.map((id) => `'${id}'`).join(', ')});`,
    );
  } else {
    lines.push('-- Nenhum usuário inserido nesta execução.');
  }

  if (companyIds.length > 0) {
    lines.push('-- Remove empresas criadas na execução, apenas se não houver usuários vinculados');
    lines.push(
      `DELETE FROM public.companies c
WHERE c.id IN (${companyIds.map((id) => `'${id}'`).join(', ')})
  AND NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.company_id = c.id
  );`,
    );
  } else {
    lines.push('-- Nenhuma empresa inserida nesta execução.');
  }

  lines.push('COMMIT;');
  lines.push('');
  return lines.join('\n');
}

async function fetchExistingCompanies(
  queryRunner: QueryRunner,
  cnpjs: string[],
): Promise<Map<string, ExistingCompanyRow>> {
  if (cnpjs.length === 0) {
    return new Map();
  }

  const rows = (await queryRunner.query(
    `SELECT id, cnpj, razao_social
     FROM public.companies
     WHERE cnpj = ANY($1::varchar[])`,
    [cnpjs],
  )) as ExistingCompanyRow[];

  return new Map(rows.map((row) => [row.cnpj, row]));
}

async function fetchExistingUsers(
  queryRunner: QueryRunner,
  cpfs: string[],
  emails: string[],
): Promise<{
  byCpf: Map<string, ExistingUserRow>;
  byEmail: Map<string, ExistingUserRow>;
}> {
  const byCpf = new Map<string, ExistingUserRow>();
  const byEmail = new Map<string, ExistingUserRow>();

  if (cpfs.length === 0 && emails.length === 0) {
    return { byCpf, byEmail };
  }

  const rows = (await queryRunner.query(
    `SELECT id, cpf, email
     FROM public.users
     WHERE cpf = ANY($1::varchar[]) OR email = ANY($2::varchar[])`,
    [cpfs, emails],
  )) as ExistingUserRow[];

  rows.forEach((row) => {
    if (row.cpf) {
      byCpf.set(row.cpf, row);
    }
    if (row.email) {
      byEmail.set(row.email.toLowerCase(), row);
    }
  });

  return { byCpf, byEmail };
}

async function fetchActiveProfiles(
  queryRunner: QueryRunner,
): Promise<Map<string, ProfileRow>> {
  const rows = (await queryRunner.query(
    `SELECT id, nome
     FROM public.profiles
     WHERE status = true
     ORDER BY created_at ASC NULLS LAST, id ASC`,
  )) as ProfileRow[];

  const profileMap = new Map<string, ProfileRow>();
  rows.forEach((row) => {
    const key = normalizeProfileKey(row.nome);
    if (!profileMap.has(key)) {
      profileMap.set(key, row);
    }
  });
  return profileMap;
}

async function withRecoveryAppContext<T>(
  overrides: Record<string, string | undefined>,
  fn: (app: INestApplicationContext) => Promise<T>,
): Promise<T> {
  const previousValues = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previousValues.set(key, process.env[key]);
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    const [{ NestFactory }, { AppModule }] = await Promise.all([
      import('@nestjs/core'),
      import('../src/app.module'),
    ]);

    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
      abortOnError: false,
    });

    try {
      return await fn(app);
    } finally {
      await app.close();
    }
  } finally {
    for (const [key, value] of previousValues.entries()) {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const apply = hasFlag(args, 'apply');
  const dryRun = !apply;
  const timestamp = createTimestampLabel(new Date());
  const defaultInputPath = path.resolve(
    process.cwd(),
    'scripts',
    'recovery',
    'templates',
    'ajn-quality-recovery.template.csv',
  );
  const outputDir = path.resolve(
    process.cwd(),
    getStringArg(args, 'output-dir') ||
      path.join('output', 'recovery', 'ajn-quality'),
  );
  const inputFile = path.resolve(
    process.cwd(),
    getStringArg(args, 'file') || defaultInputPath,
  );
  const reportFile = path.resolve(
    outputDir,
    getStringArg(args, 'report-file') || `recovery-${timestamp}.report.json`,
  );
  const rollbackFile = path.resolve(
    outputDir,
    getStringArg(args, 'rollback-file') || `recovery-${timestamp}.rollback.sql`,
  );

  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

  const report: RecoveryReport = {
    version: 1,
    type: 'ajn_quality_csv_recovery',
    mode: dryRun ? 'dry_run' : 'apply',
    status: dryRun ? 'dry_run' : 'failed',
    startedAt: new Date().toISOString(),
    completedAt: null,
    inputFile,
    reportFile,
    rollbackFile,
    defaults: {
      defaultProfileName: DEFAULT_PROFILE_NAME,
    },
    summary: {
      totalRows: 0,
      validRows: 0,
      validationErrors: 0,
      companiesInserted: 0,
      companiesSkippedExisting: 0,
      usersInserted: 0,
      usersSkippedCpfConflict: 0,
      usersSkippedEmailConflict: 0,
      passwordResetRequested: 0,
      passwordResetFailed: 0,
    },
    inserted: {
      companies: [],
      users: [],
    },
    skipped: [],
    passwordResets: [],
    errors: [],
    notes: [],
  };

  await ensureDir(outputDir);

  if (!fs.existsSync(inputFile)) {
    report.status = 'validation_failed';
    report.errors.push({
      rowNumber: 0,
      code: 'CSV_FILE_NOT_FOUND',
      message: `Arquivo CSV não encontrado: ${inputFile}`,
    });
    report.summary.validationErrors = report.errors.length;
    report.completedAt = new Date().toISOString();
    await writeJsonFile(reportFile, report);
    await fs.promises.writeFile(
      rollbackFile,
      buildRollbackSql({
        insertedUserIds: [],
        insertedCompanyIds: [],
        generatedAt: report.completedAt,
      }),
      'utf8',
    );
    throw new Error(`Arquivo CSV não encontrado: ${inputFile}`);
  }

  const parsed = parseCsvInput(inputFile);
  const consistencyErrors = validateRowConsistency(parsed.rows);
  report.errors.push(...parsed.errors, ...consistencyErrors);
  report.summary.totalRows = parsed.rows.length;
  if (hasFlag(args, 'dry-run') && apply) {
    report.notes.push(
      'Flag --dry-run ignorada porque --apply foi informado (execucao real).',
    );
  }

  if (report.errors.length > 0) {
    report.status = 'validation_failed';
    report.completedAt = new Date().toISOString();
    const validationIssues = report.errors.filter(
      (issue) => issue.code !== 'EXECUTION_ERROR',
    );
    const rowsWithValidationError = new Set(
      validationIssues
        .filter((issue) => issue.rowNumber > 0)
        .map((issue) => issue.rowNumber),
    );
    report.summary.validRows = Math.max(
      report.summary.totalRows - rowsWithValidationError.size,
      0,
    );
    report.summary.validationErrors = validationIssues.length;
    await writeJsonFile(reportFile, report);
    await fs.promises.writeFile(
      rollbackFile,
      buildRollbackSql({
        insertedUserIds: [],
        insertedCompanyIds: [],
        generatedAt: report.completedAt,
      }),
      'utf8',
    );
    console.log(JSON.stringify(report, null, 2));
    console.log(`REPORT_FILE=${reportFile}`);
    console.log(`ROLLBACK_FILE=${rollbackFile}`);
    process.exitCode = 1;
    return;
  }

  const contextOverrides: Record<string, string> = {
    NODE_ENV: 'production',
    REDIS_DISABLED: 'true',
    API_CRONS_DISABLED: 'true',
    REDIS_ALLOW_IN_MEMORY_FALLBACK_IN_PROD: 'true',
  };

  let insertedUserIdsForRollback: string[] = [];
  let insertedCompanyIdsForRollback: string[] = [];

  try {
    await withRecoveryAppContext(contextOverrides, async (app) => {
      const dataSource = app.get(DataSource);
      const authService = app.get(AuthService);
      const queryRunner = dataSource.createQueryRunner();

      try {
        await queryRunner.connect();
        await queryRunner.query(`SET app.is_super_admin = 'true'`);

        const profilesByName = await fetchActiveProfiles(queryRunner);
        const defaultProfile = profilesByName.get(
          normalizeProfileKey(DEFAULT_PROFILE_NAME),
        );
        if (!defaultProfile) {
          report.errors.push({
            rowNumber: 0,
            code: 'DEFAULT_PROFILE_NOT_FOUND',
            message: `Perfil padrão não encontrado: ${DEFAULT_PROFILE_NAME}`,
          });
        }

        for (const row of parsed.rows) {
          if (!row.perfil) {
            continue;
          }
          const profile = profilesByName.get(normalizeProfileKey(row.perfil));
          if (!profile) {
            report.errors.push({
              rowNumber: row.rowNumber,
              code: 'PROFILE_NOT_FOUND',
              message: `Perfil não encontrado para linha ${row.rowNumber}: ${row.perfil}`,
            });
          }
        }

        if (report.errors.length > 0) {
          report.status = 'validation_failed';
          report.completedAt = new Date().toISOString();
          return;
        }

        const companyCnpjs = Array.from(new Set(parsed.rows.map((row) => row.cnpj)));
        const userCpfs = Array.from(new Set(parsed.rows.map((row) => row.cpf)));
        const userEmails = Array.from(
          new Set(parsed.rows.map((row) => row.email.toLowerCase())),
        );

        const existingCompanies = await fetchExistingCompanies(
          queryRunner,
          companyCnpjs,
        );
        const existingUsers = await fetchExistingUsers(
          queryRunner,
          userCpfs,
          userEmails,
        );

        const localCompanyMap = new Map(existingCompanies);
        const localUsersByCpf = new Map(existingUsers.byCpf);
        const localUsersByEmail = new Map(existingUsers.byEmail);
        const reportedExistingCompanyCnpjs = new Set<string>();
        const usersForPasswordReset: InsertedUserRecord[] = [];

        if (!dryRun) {
          await queryRunner.startTransaction('SERIALIZABLE');
          await queryRunner.query(`SET LOCAL app.is_super_admin = 'true'`);
        }

        try {
          for (const row of parsed.rows) {
            let companyId: string;
            const existingCompany = localCompanyMap.get(row.cnpj);
            if (existingCompany) {
              companyId = existingCompany.id;
              if (!reportedExistingCompanyCnpjs.has(row.cnpj)) {
                report.skipped.push({
                  rowNumber: row.rowNumber,
                  entity: 'company',
                  reason: 'company_cnpj_exists',
                  identifier: row.cnpj,
                  details: `Empresa existente: ${existingCompany.razao_social}`,
                });
                report.summary.companiesSkippedExisting += 1;
                reportedExistingCompanyCnpjs.add(row.cnpj);
              }
            } else if (dryRun) {
              companyId = `dry-run-company-${row.cnpj}`;
              const previewCompany: ExistingCompanyRow = {
                id: companyId,
                cnpj: row.cnpj,
                razao_social: row.razaoSocial,
              };
              localCompanyMap.set(row.cnpj, previewCompany);
              report.inserted.companies.push({
                rowNumber: row.rowNumber,
                id: companyId,
                cnpj: row.cnpj,
                razaoSocial: row.razaoSocial,
              });
            } else {
              const insertedCompanyRows = (await queryRunner.query(
                `INSERT INTO public.companies (
                   razao_social,
                   cnpj,
                   endereco,
                   responsavel,
                   email_contato,
                   status,
                   created_at,
                   updated_at
                 ) VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
                 RETURNING id, cnpj, razao_social`,
                [
                  row.razaoSocial,
                  row.cnpj,
                  row.endereco,
                  row.responsavel,
                  row.emailContatoEmpresa || null,
                ],
              )) as ExistingCompanyRow[];
              const insertedCompany = insertedCompanyRows[0];
              companyId = insertedCompany.id;
              localCompanyMap.set(row.cnpj, insertedCompany);
              report.inserted.companies.push({
                rowNumber: row.rowNumber,
                id: insertedCompany.id,
                cnpj: insertedCompany.cnpj,
                razaoSocial: insertedCompany.razao_social,
              });
              insertedCompanyIdsForRollback.push(insertedCompany.id);
            }

            const userByCpf = localUsersByCpf.get(row.cpf);
            if (userByCpf) {
              report.skipped.push({
                rowNumber: row.rowNumber,
                entity: 'user',
                reason: 'user_cpf_exists',
                identifier: row.cpf,
                details: `Usuário existente com ID ${userByCpf.id}`,
              });
              report.summary.usersSkippedCpfConflict += 1;
              continue;
            }

            const userByEmail = localUsersByEmail.get(row.email.toLowerCase());
            if (userByEmail) {
              report.skipped.push({
                rowNumber: row.rowNumber,
                entity: 'user',
                reason: 'user_email_exists',
                identifier: row.email.toLowerCase(),
                details: `Usuário existente com ID ${userByEmail.id}`,
              });
              report.summary.usersSkippedEmailConflict += 1;
              continue;
            }

            const profileName = row.perfil || DEFAULT_PROFILE_NAME;
            const profile = profilesByName.get(normalizeProfileKey(profileName));
            if (!profile) {
              report.skipped.push({
                rowNumber: row.rowNumber,
                entity: 'user',
                reason: 'invalid_profile',
                identifier: profileName,
                details: 'Perfil não encontrado no banco',
              });
              continue;
            }

            if (dryRun) {
              const dryRunUser: ExistingUserRow = {
                id: `dry-run-user-${row.cpf}`,
                cpf: row.cpf,
                email: row.email.toLowerCase(),
              };
              localUsersByCpf.set(row.cpf, dryRunUser);
              localUsersByEmail.set(row.email.toLowerCase(), dryRunUser);
              report.inserted.users.push({
                rowNumber: row.rowNumber,
                id: dryRunUser.id,
                cpf: row.cpf,
                email: row.email.toLowerCase(),
                nome: row.nome,
                companyId,
                profileId: profile.id,
              });
              continue;
            }

            const insertedUserRows = (await queryRunner.query(
              `INSERT INTO public.users (
                 nome,
                 cpf,
                 email,
                 funcao,
                 password,
                 company_id,
                 profile_id,
                 status,
                 created_at,
                 updated_at
               ) VALUES ($1, $2, $3, $4, NULL, $5, $6, true, NOW(), NOW())
               RETURNING id`,
              [
                row.nome,
                row.cpf,
                row.email.toLowerCase(),
                row.funcao,
                companyId,
                profile.id,
              ],
            )) as Array<{ id: string }>;

            const insertedUser: InsertedUserRecord = {
              rowNumber: row.rowNumber,
              id: insertedUserRows[0].id,
              cpf: row.cpf,
              email: row.email.toLowerCase(),
              nome: row.nome,
              companyId,
              profileId: profile.id,
            };

            report.inserted.users.push(insertedUser);
            usersForPasswordReset.push(insertedUser);
            insertedUserIdsForRollback.push(insertedUser.id);
            localUsersByCpf.set(row.cpf, {
              id: insertedUser.id,
              cpf: row.cpf,
              email: row.email.toLowerCase(),
            });
            localUsersByEmail.set(row.email.toLowerCase(), {
              id: insertedUser.id,
              cpf: row.cpf,
              email: row.email.toLowerCase(),
            });
          }

          if (!dryRun) {
            await queryRunner.commitTransaction();
          }
          report.status = dryRun ? 'dry_run' : 'success';

          if (!dryRun) {
            for (const user of usersForPasswordReset) {
              try {
                await authService.forgotPassword(user.cpf);
                report.passwordResets.push({
                  userId: user.id,
                  cpf: user.cpf,
                  status: 'requested',
                });
                report.summary.passwordResetRequested += 1;
              } catch (error) {
                report.passwordResets.push({
                  userId: user.id,
                  cpf: user.cpf,
                  status: 'failed',
                  details:
                    error instanceof Error ? error.message : String(error),
                });
                report.summary.passwordResetFailed += 1;
              }
            }
          } else {
            report.notes.push(
              'Dry-run: nenhum reset de senha foi disparado (apenas simulação de inserção).',
            );
          }
        } catch (error) {
          if (!dryRun) {
            await queryRunner.rollbackTransaction();
            insertedUserIdsForRollback = [];
            insertedCompanyIdsForRollback = [];
            report.inserted.companies = [];
            report.inserted.users = [];
            report.passwordResets = [];
          }
          report.status = 'failed';
          report.errors.push({
            rowNumber: 0,
            code: 'EXECUTION_ERROR',
            message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        } finally {
          await queryRunner.release();
        }
      } catch (error) {
        report.status = report.status === 'validation_failed' ? report.status : 'failed';
        if (
          !report.errors.some((issue) => issue.code === 'EXECUTION_ERROR') &&
          report.status === 'failed'
        ) {
          report.errors.push({
            rowNumber: 0,
            code: 'EXECUTION_ERROR',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });
  } catch (error) {
    if (report.status !== 'validation_failed') {
      report.status = 'failed';
    }
    if (!report.errors.some((issue) => issue.code === 'EXECUTION_ERROR')) {
      report.errors.push({
        rowNumber: 0,
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    report.notes.push(
      `Execução encerrada com erro: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const validationIssues = report.errors.filter(
    (issue) => issue.code !== 'EXECUTION_ERROR',
  );
  const rowsWithValidationError = new Set(
    validationIssues
      .filter((issue) => issue.rowNumber > 0)
      .map((issue) => issue.rowNumber),
  );
  report.summary.validRows = Math.max(
    report.summary.totalRows - rowsWithValidationError.size,
    0,
  );
  report.summary.validationErrors = validationIssues.length;
  report.summary.companiesInserted = report.inserted.companies.length;
  report.summary.usersInserted = report.inserted.users.length;
  report.completedAt = new Date().toISOString();

  await writeJsonFile(reportFile, report);
  await fs.promises.writeFile(
    rollbackFile,
    buildRollbackSql({
      insertedUserIds: insertedUserIdsForRollback,
      insertedCompanyIds: insertedCompanyIdsForRollback,
      generatedAt: report.completedAt,
    }),
    'utf8',
  );

  console.log(JSON.stringify(report, null, 2));
  console.log(`REPORT_FILE=${reportFile}`);
  console.log(`ROLLBACK_FILE=${rollbackFile}`);

  if (report.status === 'validation_failed' || report.status === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `Falha ao executar recuperação AJN/QUALITY: ${error instanceof Error ? error.stack || error.message : String(error)}`,
  );
  process.exitCode = 1;
});
