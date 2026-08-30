import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  APPROVED_RUNTIME_FUNCTION_IDENTITIES,
  HARDENED_SECURITY_DEFINER_FUNCTION_IDENTITIES,
  TightenRuntimeFunctionGrants1709000000393,
} from '../migrations/1709000000393-tighten-runtime-function-grants';

const migrationSource = readFileSync(
  join(
    __dirname,
    '../migrations/1709000000393-tighten-runtime-function-grants.ts',
  ),
  'utf8',
);

describe('TightenRuntimeFunctionGrants1709000000393 contract', () => {
  it('defines one explicit signature-safe runtime allowlist', () => {
    expect(APPROVED_RUNTIME_FUNCTION_IDENTITIES).toHaveLength(14);
    expect(new Set(APPROVED_RUNTIME_FUNCTION_IDENTITIES).size).toBe(14);
    expect(HARDENED_SECURITY_DEFINER_FUNCTION_IDENTITIES).toHaveLength(5);

    for (const identity of APPROVED_RUNTIME_FUNCTION_IDENTITIES) {
      expect(identity).toMatch(/^public\.[^(]+\([^)]*\)$/);
      expect(migrationSource).toContain(identity);
    }
  });

  it('does not use blanket function ACL operations', () => {
    expect(migrationSource).not.toContain(
      'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public',
    );
    expect(migrationSource).not.toContain(
      'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public',
    );
    expect(migrationSource).toContain('aclexplode');
    expect(migrationSource).toContain('::regprocedure');
  });

  it('discovers direct grants and fails closed for unmanaged owners', () => {
    expect(migrationSource).toContain('directSgsAppExecute');
    expect(migrationSource).toContain('excessDirectExecute');
    expect(migrationSource).toContain('cannot administer excess EXECUTE');
    expect(migrationSource).toContain('manageable');
  });

  it('preserves the five 0392-owned functions without owner mutation', () => {
    expect(migrationSource).toContain(
      "functionRow.owner !== 'sgs_function_owner'",
    );
    expect(migrationSource).toContain('functionRow.direct_execute');
    expect(migrationSource).toContain('functionRow.public_execute');
    expect(migrationSource).not.toContain('ALTER FUNCTION');
    expect(migrationSource).not.toContain('SET ROLE');
  });

  it('keeps down() safe and does not issue ACL mutations', async () => {
    const queryRunner = { query: jest.fn() };

    await new TightenRuntimeFunctionGrants1709000000393().down(
      queryRunner as never,
    );

    expect(queryRunner.query).not.toHaveBeenCalled();
    expect(migrationSource).not.toMatch(/GRANT EXECUTE ON ALL FUNCTIONS/);
    expect(migrationSource).not.toMatch(/transaction\s*=\s*false/);
  });
});
