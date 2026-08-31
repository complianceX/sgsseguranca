import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSource = readFileSync(
  resolve(
    __dirname,
    '../migrations/1709000000399-harden-durable-idempotency-rls.ts',
  ),
  'utf8',
);

describe('0399 pgcrypto dependency contract', () => {
  it('provisions pgcrypto in public before requiring public.digest', () => {
    const extensionStatement =
      'CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA public';
    const extensionIndex = migrationSource.indexOf(extensionStatement);
    const upStart = migrationSource.indexOf(
      'public async up(queryRunner: QueryRunner)',
    );
    const downStart = migrationSource.indexOf(
      'public async down(_queryRunner: QueryRunner)',
    );
    const upBody = migrationSource.slice(upStart, downStart);
    const ensureIndex = upBody.indexOf(
      'await this.ensurePgcrypto(queryRunner)',
    );
    const preflightIndex = upBody.indexOf(
      'await this.assertPreflight(queryRunner)',
    );

    expect(extensionIndex).toBeGreaterThanOrEqual(0);
    expect(ensureIndex).toBeGreaterThanOrEqual(0);
    expect(ensureIndex).toBeLessThan(preflightIndex);
    expect(migrationSource).toContain('extnamespace');
    expect(migrationSource).toContain(
      "extensionRows[0]?.schema_name !== 'public'",
    );
    expect(migrationSource).toContain('public.digest(text,text)');
  });
});
