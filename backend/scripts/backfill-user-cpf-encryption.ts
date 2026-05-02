import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  hashSensitiveValue,
} from '../src/common/security/field-encryption.util';
import { CpfUtil } from '../src/common/utils/cpf.util';
import {
  ensureDir,
  getStringArg,
  hasFlag,
  parseCliArgs,
} from './disaster-recovery/common';

type UserCpfRow = {
  id: string;
  cpf: string | null;
  cpf_hash: string | null;
  cpf_ciphertext: string | null;
};

type Report = {
  version: 1;
  type: 'backfill_user_cpf_encryption';
  mode: 'dry_run' | 'apply';
  clearPlaintext: boolean;
  status: 'dry_run' | 'success' | 'failed';
  startedAt: string;
  completedAt: string | null;
  reportFile: string;
  summary: {
    candidates: number;
    invalidCpf: number;
    alreadyEncrypted: number;
    updated: number;
    plaintextCleared: number;
  };
  warnings: string[];
  errors: string[];
};

function maskCpf(value: string): string {
  return value.replace(/\d(?=\d{2})/g, '*');
}

function loadEnv(): void {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
}

function resolveConnectionString(): string {
  const connectionString =
    process.env.DATABASE_MIGRATION_URL ||
    process.env.DATABASE_DIRECT_URL ||
    process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_MIGRATION_URL, DATABASE_DIRECT_URL ou DATABASE_URL ausente.',
    );
  }

  return connectionString;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const apply = hasFlag(args, 'apply');
  const clearPlaintext = hasFlag(args, 'clear-plaintext');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.resolve(
    process.cwd(),
    getStringArg(args, 'output-dir') ||
      path.join('output', 'privacy', 'cpf-encryption'),
  );
  const reportFile = path.resolve(
    outputDir,
    getStringArg(args, 'report-file') ||
      `backfill-user-cpf-encryption-${timestamp}.json`,
  );

  loadEnv();
  await ensureDir(outputDir);

  const encryptionProbe = encryptSensitiveValue('12345678909');
  if (!encryptionProbe || !encryptionProbe.startsWith('enc:v1:')) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY/FIELD_ENCRYPTION_ENABLED não produzem ciphertext AES-GCM. Corrija a chave antes de rodar dry-run ou --apply.',
    );
  }

  const report: Report = {
    version: 1,
    type: 'backfill_user_cpf_encryption',
    mode: apply ? 'apply' : 'dry_run',
    clearPlaintext,
    status: apply ? 'failed' : 'dry_run',
    startedAt: new Date().toISOString(),
    completedAt: null,
    reportFile,
    summary: {
      candidates: 0,
      invalidCpf: 0,
      alreadyEncrypted: 0,
      updated: 0,
      plaintextCleared: 0,
    },
    warnings: [],
    errors: [],
  };

  const client = new Client({
    connectionString: resolveConnectionString(),
    ssl: { rejectUnauthorized: true },
    statement_timeout: 30_000,
  });

  try {
    await client.connect();

    const encryptedRows = await client.query<{
      id: string;
      cpf_hash: string;
      cpf_ciphertext: string;
    }>(`
      SELECT id, cpf_hash, cpf_ciphertext
      FROM public.users
      WHERE cpf_hash IS NOT NULL
        AND cpf_ciphertext IS NOT NULL
      ORDER BY created_at ASC NULLS LAST, id ASC
    `);

    for (const row of encryptedRows.rows) {
      const plainCpf = decryptSensitiveValue(row.cpf_ciphertext);
      const matchesHash =
        Boolean(plainCpf) &&
        hashSensitiveValue(String(plainCpf)) === row.cpf_hash;
      if (!matchesHash) {
        throw new Error(
          `FIELD_ENCRYPTION_KEY/FIELD_ENCRYPTION_HASH_KEY não validam ciphertext existente de users. Abortado antes de qualquer alteração. user=${row.id}`,
        );
      }
    }

    const result = await client.query<UserCpfRow>(`
      SELECT id, cpf, cpf_hash, cpf_ciphertext
      FROM public.users
      WHERE cpf IS NOT NULL
      ORDER BY created_at ASC NULLS LAST, id ASC
    `);

    report.summary.candidates = result.rowCount ?? 0;

    if (!apply) {
      for (const row of result.rows) {
        const normalizedCpf = CpfUtil.normalize(row.cpf || '');
        if (!CpfUtil.validate(normalizedCpf)) {
          report.summary.invalidCpf += 1;
          report.warnings.push(
            `CPF invalido ignorado no dry-run: user=${row.id} cpf=${maskCpf(normalizedCpf)}`,
          );
          continue;
        }

        if (row.cpf_hash && row.cpf_ciphertext) {
          report.summary.alreadyEncrypted += 1;
        }
      }

      report.warnings.push(
        'Dry-run: nenhuma alteracao aplicada. Use --apply para gravar hash/ciphertext e --clear-plaintext para limpar users.cpf.',
      );
      return;
    }

    await client.query('BEGIN');

    for (const row of result.rows) {
      const normalizedCpf = CpfUtil.normalize(row.cpf || '');
      if (!CpfUtil.validate(normalizedCpf)) {
        report.summary.invalidCpf += 1;
        report.warnings.push(
          `CPF invalido ignorado: user=${row.id} cpf=${maskCpf(normalizedCpf)}`,
        );
        continue;
      }

      const cpfHash = hashSensitiveValue(normalizedCpf);
      const cpfCiphertext = encryptSensitiveValue(normalizedCpf);
      if (!cpfCiphertext || cpfCiphertext === normalizedCpf) {
        throw new Error(
          'Criptografia de CPF nao produziu ciphertext. Verifique FIELD_ENCRYPTION_KEY/FIELD_ENCRYPTION_ENABLED.',
        );
      }

      await client.query(
        `
        UPDATE public.users
        SET cpf_hash = $2,
            cpf_ciphertext = $3,
            cpf = CASE WHEN $4::boolean THEN NULL ELSE cpf END,
            updated_at = NOW()
        WHERE id = $1
        `,
        [row.id, cpfHash, cpfCiphertext, clearPlaintext],
      );

      report.summary.updated += 1;
      if (clearPlaintext) {
        report.summary.plaintextCleared += 1;
      }
    }

    await client.query('COMMIT');
    report.status = 'success';
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors after failed connect or closed connection
    }
    report.status = 'failed';
    report.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await client.end().catch(() => undefined);
    report.completedAt = new Date().toISOString();
    await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    console.log(`REPORT_FILE=${reportFile}`);
  }

  if (report.status === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.stack || error.message : String(error),
  );
  process.exitCode = 1;
});
