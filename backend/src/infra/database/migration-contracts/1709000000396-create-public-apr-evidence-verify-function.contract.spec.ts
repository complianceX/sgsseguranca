import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationSource = readFileSync(
  join(
    __dirname,
    '../migrations/1709000000396-create-public-apr-evidence-verify-function.ts',
  ),
  'utf8',
);

describe('CreatePublicAprEvidenceVerifyFunction1709000000396 contract', () => {
  it('requires an authorized migration executor and pre-existing roles', () => {
    expect(migrationSource).toContain('current_user');
    expect(migrationSource).toContain('session_user');
    expect(migrationSource).toContain('rolsuper');
    expect(migrationSource).toContain('rolcreaterole');
    expect(migrationSource).toContain("identity.current_user === 'sgs_app'");
    expect(migrationSource).toContain("identity.session_user === 'sgs_app'");
    expect(migrationSource).toContain(
      '0396 requires a SUPERUSER or CREATEROLE executor',
    );
    expect(migrationSource).toContain('0396 required role is absent');
    expect(migrationSource).not.toMatch(/CREATE ROLE/);
  });

  it('uses temporary PG17 privileges and restores them on every failure path', () => {
    expect(migrationSource).toContain(
      'GRANT ${FUNCTION_OWNER} TO CURRENT_USER',
    );
    expect(migrationSource).toContain('WITH SET TRUE, INHERIT FALSE');
    expect(migrationSource).toContain('GRANT CREATE ON SCHEMA public');
    expect(migrationSource).toContain('REVOKE CREATE ON SCHEMA public');
    expect(migrationSource).toContain('cleanupTemporaryPrivileges');
    expect(migrationSource).toContain('temporarySchemaCreate');
    expect(migrationSource).toContain('previousMembership');
    expect(migrationSource).not.toMatch(/GRANT ALL PRIVILEGES/);
    expect(migrationSource).not.toMatch(/TRUSTED_PROXY_CIDRS/);
  });

  it('preserves the hardened function contract and makes down owner-aware', () => {
    expect(migrationSource).toContain('SECURITY DEFINER');
    expect(migrationSource).toContain(
      'SET search_path = pg_catalog, public, pg_temp',
    );
    expect(migrationSource).toContain('REVOKE EXECUTE ON FUNCTION');
    expect(migrationSource).toContain('FROM PUBLIC, sgs_admin');
    expect(migrationSource).toContain('GRANT EXECUTE ON FUNCTION');
    expect(migrationSource).toContain('TO sgs_app');
    expect(migrationSource).toContain(
      'ALTER FUNCTION ${FUNCTION_SIGNATURE} OWNER TO ${FUNCTION_OWNER}',
    );
    expect(migrationSource).toContain('SET ROLE ${FUNCTION_OWNER}');
    expect(migrationSource).toContain("queryRunner.query('RESET ROLE')");
    expect(migrationSource).toContain('DROP FUNCTION ${FUNCTION_SIGNATURE}');
    expect(migrationSource).not.toMatch(/GRANT EXECUTE[\s\S]*TO PUBLIC/);
  });
});
