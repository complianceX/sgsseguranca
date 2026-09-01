import type { QueryRunner } from 'typeorm';
import { AddSignatureKeyVersioning1709000000402 } from '../../infra/database/migrations/1709000000402-add-signature-key-versioning';

type QueryRunnerDouble = Pick<QueryRunner, 'query'> & {
  query: jest.MockedFunction<QueryRunner['query']>;
};

const makeQueryRunner = (): QueryRunnerDouble => {
  const query = jest.fn() as jest.MockedFunction<QueryRunner['query']>;
  query.mockResolvedValue([]);
  return { query };
};

const flattenSql = (queryRunner: QueryRunnerDouble): string =>
  queryRunner.query.mock.calls
    .map(([sql]) => String(sql))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase();

describe('signature key versioning migration contract', () => {
  it('é aditiva e não reescreve tokens históricos nem o ledger', async () => {
    const queryRunner = makeQueryRunner();
    const migration = new AddSignatureKeyVersioning1709000000402();

    await migration.up(queryRunner as unknown as QueryRunner);

    const sql = flattenSql(queryRunner);
    expect(sql).toContain(
      'alter table public."signatures" add column if not exists "signature_key_id"',
    );
    expect(sql).toContain('"timestamp_token_version"');
    expect(sql).toContain('verify_signature_by_hash_public_versioned');
    expect(sql).not.toMatch(/update\s+public\.?("?signatures"?)/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.?("?signatures"?)/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.?("?migrations"?)/i);
    expect(sql).not.toMatch(/update\s+public\.?("?migrations"?)/i);
  });

  it('mantém o contrato antigo e restringe a função versionada ao runtime', async () => {
    const queryRunner = makeQueryRunner();
    const migration = new AddSignatureKeyVersioning1709000000402();

    await migration.up(queryRunner as unknown as QueryRunner);

    const sql = flattenSql(queryRunner);
    expect(sql).not.toContain(
      'drop function public.verify_signature_by_hash_public',
    );
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = pg_catalog, public, pg_temp');
    expect(sql).toContain('revoke execute on function');
    expect(sql).toContain('from public, sgs_admin');
    expect(sql).toContain('grant execute on function');
    expect(sql).toContain('to sgs_app');
  });

  it('faz rollback somente dos artefatos novos', async () => {
    const queryRunner = makeQueryRunner();
    const migration = new AddSignatureKeyVersioning1709000000402();

    await migration.down(queryRunner as unknown as QueryRunner);

    const sql = flattenSql(queryRunner);
    expect(sql).toContain(
      'drop function if exists public.verify_signature_by_hash_public_versioned',
    );
    expect(sql).toContain('drop column if exists "timestamp_token_version"');
    expect(sql).toContain('drop column if exists "signature_key_id"');
    expect(sql).not.toContain(
      'drop function if exists public.verify_signature_by_hash_public(text)',
    );
    expect(sql).not.toContain('drop table');
  });
});
