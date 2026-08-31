import { createRequire } from 'node:module';

const projectRequire = createRequire(__filename);

type RelationFixture = {
  relation_name: string;
  owner: string;
  view_definition: string;
};

type AclFixture = {
  relation_name: string;
  grantee: string;
  grantor: string;
  privilege_type: string;
  is_grantable: boolean;
};

type BoundaryInput = {
  relations: RelationFixture[];
  acls: AclFixture[];
  extensionOwner: string;
  canSetProviderRole: boolean;
  currentUser: string;
  runtimePrivilegedMemberships?: string[];
};

type BoundaryResult = {
  classification: string;
  failures: string[];
  extensionOwner: string;
  relationOwners: Record<string, string>;
  pgStatStatementsOwner: string | null;
  pgStatStatementsInfoOwner: string | null;
  publicAclGrantors: Record<string, string[]>;
  executorRole: string;
  runtimePrivilegedMemberships: string[];
};

const { classifyPgStatStatementsBoundary } = projectRequire(
  '../../../scripts/lib/pg-stat-statements-boundary',
) as {
  classifyPgStatStatementsBoundary: (input: BoundaryInput) => BoundaryResult;
};

const RELATIONS = ['pg_stat_statements', 'pg_stat_statements_info'];

function baseRelations(): RelationFixture[] {
  return RELATIONS.map((relation_name) => ({
    relation_name,
    owner: 'cloud_admin',
    view_definition: 'SELECT 1',
  }));
}

function baseAcls(): AclFixture[] {
  return RELATIONS.map((relation_name) => ({
    relation_name,
    grantee: 'PUBLIC',
    grantor: 'cloud_admin',
    privilege_type: 'SELECT',
    is_grantable: false,
  }));
}

function baseInput(): BoundaryInput {
  return {
    relations: baseRelations(),
    acls: baseAcls(),
    extensionOwner: 'neondb_owner',
    canSetProviderRole: false,
    currentUser: 'neondb_owner',
    runtimePrivilegedMemberships: [],
  };
}

function classify(overrides: Partial<BoundaryInput> = {}): BoundaryResult {
  return classifyPgStatStatementsBoundary({
    ...baseInput(),
    ...overrides,
  });
}

describe('Neon pg_stat_statements provider boundary', () => {
  it('accepts the observed Neon ownership and executor topology', () => {
    const result = classify();

    expect(result.classification).toBe('MANAGED_PROVIDER_CONSTRAINT');
    expect(result.failures).toEqual([]);
    expect(result.extensionOwner).toBe('neondb_owner');
    expect(result.relationOwners).toEqual({
      pg_stat_statements: 'cloud_admin',
      pg_stat_statements_info: 'cloud_admin',
    });
    expect(result.pgStatStatementsOwner).toBe('cloud_admin');
    expect(result.pgStatStatementsInfoOwner).toBe('cloud_admin');
    expect(result.publicAclGrantors).toEqual({
      pg_stat_statements: ['cloud_admin'],
      pg_stat_statements_info: ['cloud_admin'],
    });
    expect(result.executorRole).toBe('neondb_owner');
    expect(result.runtimePrivilegedMemberships).toEqual([]);
  });

  it('rejects an extension owned by the runtime role', () => {
    const result = classify({ extensionOwner: 'sgs_app' });

    expect(result.classification).toBe('FAIL');
    expect(result.failures).toContain(
      'unexpected extension owner for pg_stat_statements',
    );
  });

  it.each([
    ['neondb_owner', 'pg_stat_statements'],
    ['unknown_role', 'pg_stat_statements_info'],
  ])('rejects an unexpected relation owner: %s', (owner, relationName) => {
    const relations = baseRelations().map((relation) =>
      relation.relation_name === relationName
        ? { ...relation, owner }
        : relation,
    );
    const result = classify({ relations });

    expect(result.classification).toBe('FAIL');
    expect(result.failures).toContain(`unexpected ${relationName} owner`);
  });

  it('rejects PUBLIC ACL provenance outside the managed provider grantor', () => {
    const acls = baseAcls().map((acl) =>
      acl.relation_name === 'pg_stat_statements'
        ? { ...acl, grantor: 'unknown_role' }
        : acl,
    );
    const result = classify({ acls });

    expect(result.classification).toBe('FAIL');
    expect(result.failures).toContain(
      'unexpected PUBLIC ACL provenance on pg_stat_statements',
    );
  });

  it('rejects an executor that can SET ROLE cloud_admin', () => {
    const result = classify({ canSetProviderRole: true });

    expect(result.classification).toBe('FAIL');
    expect(result.failures).toContain(
      'unexpected SET ROLE capability for cloud_admin',
    );
  });

  it.each(['pg_read_all_stats', 'pg_monitor'])(
    'rejects runtime membership in %s',
    (role) => {
      const result = classify({ runtimePrivilegedMemberships: [role] });

      expect(result.classification).toBe('FAIL');
      expect(result.failures).toContain(
        'runtime privileged membership is present',
      );
    },
  );
});
