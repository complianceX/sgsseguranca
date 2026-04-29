/**
 * Verifica que a chave atual de FIELD_ENCRYPTION_KEY:
 *   1. Faz round-trip cifrar/decifrar/comparar.
 *   2. Decifra com sucesso os ciphertexts já gravados em users.cpf_ciphertext.
 *   3. Hash determinístico produz o cpf_hash já gravado quando temos plaintext de referência.
 *
 * Não muta nada. Imprime relatório e sai com exit code 1 em caso de falha.
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  hashSensitiveValue,
} from '../src/common/security/field-encryption.util';

function loadEnv(): void {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
}

function resolveConnectionString(): string {
  const url =
    process.env.DATABASE_MIGRATION_URL ||
    process.env.DATABASE_DIRECT_URL ||
    process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente.');
  return url;
}

async function main(): Promise<void> {
  loadEnv();

  const sample = '12345678909';
  const cipher = encryptSensitiveValue(sample);
  if (!cipher || cipher === sample || !cipher.startsWith('enc:v1:')) {
    console.error('FAIL: encryption returned unexpected payload', { cipher });
    process.exitCode = 1;
    return;
  }
  const round = decryptSensitiveValue(cipher);
  if (round !== sample) {
    console.error('FAIL: round-trip mismatch', { sample, round });
    process.exitCode = 1;
    return;
  }
  console.log('PASS: round-trip cifrar/decifrar OK');

  const sampleHash = hashSensitiveValue(sample);
  if (!/^[a-f0-9]{64}$/.test(sampleHash)) {
    console.error('FAIL: hash format invalid', { sampleHash });
    process.exitCode = 1;
    return;
  }
  console.log('PASS: hash determinístico produz hex(64)');

  const client = new Client({
    connectionString: resolveConnectionString(),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 15_000,
  });

  await client.connect();
  try {
    const { rows } = await client.query<{
      id: string;
      cpf_hash: string;
      cpf_ciphertext: string;
    }>(`
      SELECT id, cpf_hash, cpf_ciphertext
        FROM public.users
       WHERE cpf_ciphertext IS NOT NULL
         AND cpf_hash IS NOT NULL
       ORDER BY created_at NULLS LAST
    `);

    if (rows.length === 0) {
      console.warn(
        'SKIP: nenhum usuário já encriptado para validar (esperado 9)',
      );
    } else {
      let okDecrypt = 0;
      let okHash = 0;
      for (const row of rows) {
        const plain = decryptSensitiveValue(row.cpf_ciphertext);
        if (plain && plain.length >= 11) {
          okDecrypt += 1;
          const expectedHash = hashSensitiveValue(plain);
          if (expectedHash === row.cpf_hash) okHash += 1;
        }
      }
      console.log(
        `Decryption: ${okDecrypt}/${rows.length} ciphertexts decoded; hash match: ${okHash}/${rows.length}`,
      );
      if (okDecrypt !== rows.length || okHash !== rows.length) {
        console.error(
          'FAIL: nem todos ciphertexts existentes decifram com a chave atual, OU hash discordante. Não rodar --apply.',
        );
        process.exitCode = 1;
        return;
      }
      console.log(
        'PASS: chave atual decifra todos ciphertexts existentes e hash bate.',
      );
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exitCode = 1;
});
