'use strict';

const RELATIONS = ['pg_stat_statements', 'pg_stat_statements_info'];
const NEON_EXTENSION_OWNER = 'neondb_owner';
const NEON_MANAGED_RELATION_OWNER = 'cloud_admin';
const NEON_MANAGED_ACL_GRANTOR = 'cloud_admin';
const RUNTIME_ROLE = 'sgs_app';
const RUNTIME_PRIVILEGED_ROLES = new Set([
  'pg_monitor',
  'pg_read_all_stats',
  'pg_read_all_settings',
  'pg_stat_scan_tables',
  'pg_read_server_files',
  'pg_write_server_files',
  'pg_execute_server_program',
  'pg_signal_backend',
  'pg_read_all_data',
  'pg_write_all_data',
  'neon_superuser',
  'cloud_admin',
]);
const PROVIDER_ROLES = new Set(['cloud_admin', 'neon_superuser']);

function isTruthy(value) {
  return value === true || value === 't' || value === 'true';
}

function relationMap(rows) {
  return new Map(rows.map((row) => [String(row.relation_name), row]));
}

function aclRowsFor(acls, relationName) {
  return acls.filter((row) => String(row.relation_name) === relationName);
}

function normalizeRoleNames(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((role) => String(role || ''))
    .filter((role) => role.length > 0);
}

function classifyPgStatStatementsBoundary({
  relations,
  acls,
  extensionOwner,
  canSetProviderRole,
  currentUser,
  runtimePrivilegedMemberships = [],
  requireAdminNormalization = true,
}) {
  const relationRows = relationMap(relations);
  const failures = [];
  const normalizedRuntimePrivilegedMemberships = normalizeRoleNames(
    runtimePrivilegedMemberships,
  );
  const relationOwners = {};
  const publicAclGrantors = {};

  if (String(extensionOwner || '') !== NEON_EXTENSION_OWNER) {
    failures.push('unexpected extension owner for pg_stat_statements');
  }
  if (
    String(currentUser || '') === NEON_MANAGED_RELATION_OWNER ||
    canSetProviderRole
  ) {
    failures.push('unexpected SET ROLE capability for cloud_admin');
  }
  if (
    normalizedRuntimePrivilegedMemberships.some((role) =>
      RUNTIME_PRIVILEGED_ROLES.has(role),
    )
  ) {
    failures.push('runtime privileged membership is present');
  }

  for (const relationName of RELATIONS) {
    const relation = relationRows.get(relationName);
    if (!relation) {
      failures.push(`${relationName} relation is missing`);
      continue;
    }
    relationOwners[relationName] = String(relation.owner || '');
    if (relationOwners[relationName] !== NEON_MANAGED_RELATION_OWNER) {
      failures.push(`unexpected ${relationName} owner`);
    }

    const relationAcls = aclRowsFor(acls, relationName);
    const publicAcls = relationAcls.filter(
      (row) => String(row.grantee || '') === 'PUBLIC',
    );
    const publicSelect = publicAcls.filter(
      (row) =>
        String(row.privilege_type || '') === 'SELECT' &&
        String(row.grantor || '') === NEON_MANAGED_ACL_GRANTOR &&
        !isTruthy(row.is_grantable),
    );
    publicAclGrantors[relationName] = publicAcls.map((row) =>
      String(row.grantor || ''),
    );
    if (publicSelect.length !== 1 || publicAcls.length !== 1) {
      failures.push(
        `${relationName} PUBLIC ACL is not provider-owned SELECT only`,
      );
    }
    if (
      publicAcls.some(
        (row) => String(row.grantor || '') !== NEON_MANAGED_ACL_GRANTOR,
      )
    ) {
      failures.push(`unexpected PUBLIC ACL provenance on ${relationName}`);
    }

    for (const acl of relationAcls) {
      const grantee = String(acl.grantee || '');
      const privilege = String(acl.privilege_type || '');
      const grantor = String(acl.grantor || '');

      if (grantee === 'PUBLIC') continue;
      if (grantee === RUNTIME_ROLE) {
        failures.push(`${relationName} has a direct runtime ACL`);
        continue;
      }
      if (grantee === 'sgs_admin') {
        const allowed =
          !requireAdminNormalization ||
          (relationName === 'pg_stat_statements' &&
            privilege === 'SELECT' &&
            !isTruthy(acl.is_grantable));
        if (!allowed) {
          failures.push(`${relationName} has an unsafe admin ACL`);
        }
        continue;
      }
      if (
        !PROVIDER_ROLES.has(grantee) ||
        grantor !== NEON_MANAGED_ACL_GRANTOR
      ) {
        failures.push(
          `${relationName} has an unknown or customer-controlled ACL`,
        );
      }
    }
  }

  return {
    classification:
      failures.length === 0 ? 'MANAGED_PROVIDER_CONSTRAINT' : 'FAIL',
    failures,
    provider: 'Neon',
    extensionOwner: String(extensionOwner || ''),
    relationOwners,
    publicAclGrantors,
    managedRelationOwner: NEON_MANAGED_RELATION_OWNER,
    managedAclGrantor: NEON_MANAGED_ACL_GRANTOR,
    executorRole: String(currentUser || ''),
    runtimePrivilegedMemberships: normalizedRuntimePrivilegedMemberships,
    pgStatStatementsOwner: relationOwners.pg_stat_statements || null,
    pgStatStatementsInfoOwner: relationOwners.pg_stat_statements_info || null,
    customerCanRevokeProviderAcl: false,
    customerCanSetProviderRole: isTruthy(canSetProviderRole),
    customerRole: String(currentUser || ''),
    relations: RELATIONS,
  };
}

async function inspectPgStatStatementsBoundary(client, options = {}) {
  const relationResult = await client.query(
    `
      SELECT
        c.relname AS relation_name,
        c.relkind,
        pg_get_userbyid(c.relowner) AS owner,
        pg_get_viewdef(c.oid, true) AS view_definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ANY($1::text[])
      ORDER BY c.relname
    `,
    [RELATIONS],
  );
  const extensionResult = await client.query(`
    SELECT pg_get_userbyid(extowner) AS extension_owner
    FROM pg_extension
    WHERE extname = 'pg_stat_statements'
  `);
  const aclResult = await client.query(
    `
      SELECT
        c.relname AS relation_name,
        CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
             ELSE pg_get_userbyid(acl.grantee) END AS grantee,
        pg_get_userbyid(acl.grantor) AS grantor,
        acl.privilege_type,
        acl.is_grantable
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
      WHERE n.nspname = 'public'
        AND c.relname = ANY($1::text[])
      ORDER BY c.relname, grantee, acl.privilege_type
    `,
    [RELATIONS],
  );
  const roleResult = await client.query(`
    SELECT
      current_user AS current_user,
      pg_has_role(current_user, 'cloud_admin', 'SET') AS can_set_provider_role
  `);
  const runtimeRoleResult = await client.query(
    `
      WITH RECURSIVE inherited_roles(role_oid) AS (
        SELECT oid FROM pg_roles WHERE rolname = $1
        UNION
        SELECT am.roleid
        FROM pg_auth_members am
        JOIN inherited_roles ir ON ir.role_oid = am.member
        WHERE am.inherit_option
      )
      SELECT COALESCE(
        array_agg(r.rolname ORDER BY r.rolname),
        ARRAY[]::text[]
      ) AS runtime_privileged_memberships
      FROM inherited_roles ir
      JOIN pg_roles r ON r.oid = ir.role_oid
      WHERE r.rolname = ANY($2::text[])
    `,
    [RUNTIME_ROLE, [...RUNTIME_PRIVILEGED_ROLES]],
  );

  const result = classifyPgStatStatementsBoundary({
    relations: relationResult.rows,
    acls: aclResult.rows,
    extensionOwner: extensionResult.rows[0]?.extension_owner,
    canSetProviderRole: roleResult.rows[0]?.can_set_provider_role,
    currentUser: roleResult.rows[0]?.current_user,
    runtimePrivilegedMemberships:
      runtimeRoleResult.rows[0]?.runtime_privileged_memberships,
    requireAdminNormalization: options.requireAdminNormalization !== false,
  });

  return {
    ...result,
    relationMetadata: relationResult.rows.map((row) => ({
      relation_name: row.relation_name,
      relkind: row.relkind,
      owner: row.owner,
      has_view_definition: Boolean(row.view_definition),
    })),
    aclRows: aclResult.rows,
    extensionOwner: extensionResult.rows[0]?.extension_owner || null,
  };
}

function evaluatePgStatBehavior({
  ownQueryVisible,
  foreignQueryVisible,
  sameRoleCrossSessionVisible,
  sensitiveLiteralVisible,
  infoSensitiveFields,
  resetDenied,
}) {
  const failures = [];
  if (!ownQueryVisible) failures.push('own query is not visible');
  if (foreignQueryVisible) failures.push('foreign-role query is visible');
  if (!sameRoleCrossSessionVisible) {
    failures.push('same-role cross-session visibility is missing');
  }
  if (sensitiveLiteralVisible) failures.push('sensitive literal is visible');
  if (infoSensitiveFields) failures.push('info view exposes sensitive fields');
  if (!resetDenied) failures.push('runtime reset is not denied');

  return {
    classification: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
    sensitiveLiterals: sensitiveLiteralVisible ? 'PRESENT' : 'NONE',
    reset: resetDenied ? 'DENIED' : 'ALLOWED',
  };
}

module.exports = {
  RELATIONS,
  classifyPgStatStatementsBoundary,
  evaluatePgStatBehavior,
  inspectPgStatStatementsBoundary,
};
