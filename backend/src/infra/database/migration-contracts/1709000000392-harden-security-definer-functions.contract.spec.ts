import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationSource = readFileSync(
  join(
    __dirname,
    '../migrations/1709000000392-harden-security-definer-functions.ts',
  ),
  'utf8',
);

describe('HardenSecurityDefinerFunctions1709000000392 contract', () => {
  it('identifies the executor and rejects the runtime role', () => {
    expect(migrationSource).toContain('SELECT current_user, session_user');
    expect(migrationSource).toContain("identity.current_user === 'sgs_app'");
    expect(migrationSource).toContain("identity.session_user === 'sgs_app'");
  });

  it('uses temporary SET capability without forcing an invalid grantor', () => {
    expect(migrationSource).toContain(
      'GRANT sgs_function_owner TO CURRENT_USER',
    );
    expect(migrationSource).toContain('WITH SET TRUE, INHERIT FALSE');
    expect(migrationSource).toContain(
      'Do not force GRANTED BY CURRENT_USER here',
    );
    expect(migrationSource).not.toContain(
      'WITH SET TRUE, INHERIT FALSE\n        GRANTED BY CURRENT_USER',
    );
  });

  it('uses temporary schema CREATE and removes it without forcing a grantor', () => {
    expect(migrationSource).toContain('GRANT CREATE ON SCHEMA public');
    expect(migrationSource).toContain('REVOKE CREATE ON SCHEMA public');
    expect(migrationSource).not.toContain(
      'FROM sgs_function_owner\n          GRANTED BY CURRENT_USER',
    );
  });

  it('asserts the final role, membership, schema, and ownership contracts', () => {
    expect(migrationSource).toContain(
      '0392 final role or temporary privilege contract failed',
    );
    expect(migrationSource).toContain(
      '0392 final SECURITY DEFINER ownership contract failed',
    );
    expect(migrationSource).not.toMatch(/transaction\s*=\s*false/);
  });

  it('removes default PUBLIC EXECUTE before transferring function ownership', () => {
    const revokeIndex = migrationSource.indexOf('REVOKE EXECUTE ON FUNCTION');
    const ownershipIndex = migrationSource.indexOf(
      'ALTER FUNCTION public.find_login_user(text, text) OWNER TO sgs_function_owner',
    );

    expect(revokeIndex).toBeGreaterThanOrEqual(0);
    expect(ownershipIndex).toBeGreaterThan(revokeIndex);
  });
});
