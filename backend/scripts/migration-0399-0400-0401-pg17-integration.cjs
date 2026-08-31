const crypto = require('crypto');
const { Client } = require('pg');
const {
  evaluatePgStatBehavior,
  inspectPgStatStatementsBoundary,
} = require('./lib/pg-stat-statements-boundary');

const OWNER_URL_ENV = 'PG17_STRICT_OWNER_URL';
const RUNTIME_URL_ENV = 'PG17_STRICT_RUNTIME_URL';
const ADMIN_URL_ENV = 'PG17_STRICT_ADMIN_URL';
const CHILD_HOST_ENV = 'PG17_STRICT_CHILD_HOST';
const PHASE_ENV = 'PG17_STRICT_PHASE';
const RUNTIME_ROLE = 'sgs_app';
const ADMIN_ROLE = 'sgs_admin';
const IDEMPOTENCY_TABLE = 'public.idempotency_durable_records';
const SAMPLE_TABLE = 'public.playing_with_neon';
const STATEMENTS_VIEW = 'public.pg_stat_statements';
const STATEMENTS_INFO_VIEW = 'public.pg_stat_statements_info';
const TENANT_A = '00000000-0000-4000-8000-000000000001';
const TENANT_B = '00000000-0000-4000-8000-000000000002';
const USER_A = '00000000-0000-4000-8000-000000000011';
const USER_B = '00000000-0000-4000-8000-000000000012';
const HASH_VECTORS = [
  'user:sha256-equivalence-test',
  `tenant:${TENANT_A}:user:${USER_B}`,
];
const SENSITIVE_INFO_FIELDS = new Set([
  'query',
  'queryid',
  'userid',
  'role',
  'rolname',
  'tenant',
  'literal',
  'password',
  'token',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function booleanValue(value) {
  return value === true || value === 't' || value === 'true';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  assert(value, `${name} is required`);
  return value;
}

function sanitizeError(error) {
  const code = error && error.code ? `${error.code}: ` : '';
  const message = error instanceof Error ? error.message : String(error);
  return `${code}${message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]')}`;
}

function createClient(connectionString) {
  const client = new Client({ connectionString });
  client.on('error', () => {});
  return client;
}

function roleConnectionString(baseConnectionString, roleName, password) {
  const parsed = new URL(baseConnectionString);
  parsed.username = roleName;
  parsed.password = password;
  return parsed.toString();
}

async function queryRows(client, sql, parameters) {
  return (await client.query(sql, parameters)).rows;
}

async function connectRole(connectionString, expectedRole) {
  const client = createClient(connectionString);
  await client.connect();
  const rows = await queryRows(
    client,
    `SELECT current_user AS current_user, current_setting('server_version_num') AS version_num`,
  );
  assert(rows.length === 1, `${expectedRole} identity row is missing`);
  assert(
    rows[0].current_user === expectedRole,
    `connection role mismatch for ${expectedRole}`,
  );
  assert(
    Math.floor(Number(rows[0].version_num) / 10000) === 17,
    'integration requires PostgreSQL 17',
  );
  return client;
}

function assertChildEndpoint(urls) {
  const expectedHost = requiredEnv(CHILD_HOST_ENV).toLowerCase();
  assert(
    expectedHost.startsWith('ep-') && expectedHost.endsWith('.neon.tech'),
    'integration requires the explicit Neon child endpoint host',
  );
  for (const [name, value] of Object.entries(urls)) {
    const parsed = new URL(value);
    assert(
      parsed.hostname.toLowerCase() === expectedHost,
      `${name} is not addressed to the explicit child endpoint`,
    );
  }
}

async function assertBefore(owner, runtime, admin) {
  const ledgerRows = await queryRows(
    owner,
    `SELECT count(*)::int AS migration_count FROM public.migrations`,
  );
  assert(
    Number(ledgerRows[0]?.migration_count) === 336,
    'before phase requires the 336-entry rehearsal ledger',
  );

  const idempotencyRows = await queryRows(
    owner,
    `
      SELECT c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS force_rls,
             count(p.polname)::int AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE n.nspname = 'public' AND c.relname = 'idempotency_durable_records'
      GROUP BY c.relrowsecurity, c.relforcerowsecurity
    `,
  );
  assert(
    idempotencyRows.length === 1,
    'idempotency table is missing before phase',
  );
  assert(
    !booleanValue(idempotencyRows[0].rls_enabled),
    '0399 RLS already active before phase',
  );
  assert(
    !booleanValue(idempotencyRows[0].force_rls),
    '0399 FORCE RLS already active before phase',
  );
  assert(
    Number(idempotencyRows[0].policy_count) === 0,
    'unexpected idempotency policy before phase',
  );

  const sampleRows = await queryRows(
    owner,
    `SELECT to_regclass($1) AS table_name, count(*)::int AS row_count FROM ${SAMPLE_TABLE}`,
    [SAMPLE_TABLE],
  );
  assert(
    sampleRows[0]?.table_name,
    'verified Neon sample table is missing before phase',
  );
  assert(
    Number(sampleRows[0].row_count) === 20,
    'verified Neon sample row count changed before phase',
  );

  const privileges = await queryRows(
    owner,
    `
      SELECT
        has_table_privilege($1, $3, 'SELECT') AS runtime_stat_select,
        has_table_privilege('public', $3, 'SELECT') AS public_stat_select,
        has_table_privilege($2, $3, 'SELECT') AS admin_stat_select,
        has_table_privilege($1, $4, 'SELECT') AS runtime_info_select,
        has_table_privilege('public', $4, 'SELECT') AS public_info_select
    `,
    [RUNTIME_ROLE, ADMIN_ROLE, STATEMENTS_VIEW, STATEMENTS_INFO_VIEW],
  );
  const privilegeRow = privileges[0];
  assert(
    booleanValue(privilegeRow.runtime_stat_select),
    'runtime pg_stat_statements SELECT is not present before phase',
  );
  assert(
    booleanValue(privilegeRow.public_stat_select),
    'PUBLIC pg_stat_statements SELECT is not present before phase',
  );
  assert(
    booleanValue(privilegeRow.admin_stat_select),
    'admin pg_stat_statements SELECT is not present before phase',
  );
  assert(
    booleanValue(privilegeRow.runtime_info_select),
    'runtime pg_stat_statements_info SELECT is not present before phase',
  );
  assert(
    booleanValue(privilegeRow.public_info_select),
    'PUBLIC pg_stat_statements_info SELECT is not present before phase',
  );

  await queryRows(runtime, 'SELECT 1');
  await queryRows(admin, 'SELECT 1');
}

async function assertPgStatBehavior(owner, runtime, ownerUrl, runtimeUrl) {
  const suffix = crypto.randomBytes(8).toString('hex');
  const roleA = `sgs_stat_a_${suffix}`;
  const roleB = `sgs_stat_b_${suffix}`;
  const passwordA = crypto.randomBytes(24).toString('base64url');
  const passwordB = crypto.randomBytes(24).toString('base64url');
  const markerA = `sgs_stat_marker_a_${suffix}`;
  const markerB = `sgs_stat_marker_b_${suffix}`;
  const literalA = `sgs_sensitive_literal_a_${suffix}`;
  const appMarker = `sgs_app_marker_${suffix}`;
  const appLiteral = `sgs_app_sensitive_literal_${suffix}`;
  const clients = [];

  const ownRowsQuery = `
    SELECT query, queryid::text AS queryid
    FROM public.pg_stat_statements
    WHERE userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
      AND query LIKE $1
  `;

  try {
    await owner.query(
      `CREATE ROLE "${roleA}" LOGIN PASSWORD $1 NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
      [passwordA],
    );
    await owner.query(
      `CREATE ROLE "${roleB}" LOGIN PASSWORD $1 NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
      [passwordB],
    );

    const roleA1 = createClient(
      roleConnectionString(ownerUrl, roleA, passwordA),
    );
    const roleA2 = createClient(
      roleConnectionString(ownerUrl, roleA, passwordA),
    );
    const roleBClient = createClient(
      roleConnectionString(ownerUrl, roleB, passwordB),
    );
    const runtime2 = createClient(runtimeUrl);
    clients.push(roleA1, roleA2, roleBClient, runtime2);
    await Promise.all(
      clients.map(async (client) => {
        await client.connect();
      }),
    );

    await queryRows(roleA1, `SELECT $1::text AS "${markerA}"`, [literalA]);
    await queryRows(roleBClient, `SELECT $1::text AS "${markerB}"`, [markerB]);

    const ownRows = await queryRows(roleA2, ownRowsQuery, [`%${markerA}%`]);
    const foreignRows = await queryRows(
      roleBClient,
      `
        SELECT query, queryid::text AS queryid
        FROM public.pg_stat_statements
        WHERE userid = (SELECT usesysid FROM pg_user WHERE usename = $1)
          AND query LIKE $2
      `,
      [roleA, `%${markerA}%`],
    );
    const ownAllRows = await queryRows(roleA2, ownRowsQuery, ['%']);
    const foreignQueryVisible = foreignRows.some(
      (row) =>
        row.query !== null ||
        row.queryid !== null ||
        String(row.query || '').includes(markerA),
    );

    await queryRows(runtime, `SELECT $1::text AS "${appMarker}"`, [appLiteral]);
    const appRows = await queryRows(runtime2, ownRowsQuery, [`%${appMarker}%`]);
    const appAllRows = await queryRows(runtime2, ownRowsQuery, ['%']);
    const infoColumns = await queryRows(
      owner,
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pg_stat_statements_info'
        ORDER BY ordinal_position
      `,
    );
    const infoPayload = await queryRows(
      owner,
      `
        SELECT COALESCE(
          jsonb_agg(to_jsonb(info)), '[]'::jsonb
        )::text AS payload
        FROM public.pg_stat_statements_info info
      `,
    );
    const infoSensitiveFields = infoColumns.some((row) =>
      SENSITIVE_INFO_FIELDS.has(String(row.column_name).toLowerCase()),
    );
    const infoHasSyntheticData = String(infoPayload[0]?.payload || '').includes(
      suffix,
    );
    let resetDenied = false;
    try {
      await runtime.query('SELECT pg_stat_statements_reset()');
    } catch (error) {
      resetDenied = error && error.code === '42501';
    }

    const behavior = evaluatePgStatBehavior({
      ownQueryVisible: ownRows.some((row) =>
        String(row.query || '').includes(markerA),
      ),
      foreignQueryVisible,
      sameRoleCrossSessionVisible: ownRows.length > 0,
      sensitiveLiteralVisible:
        ownAllRows.some((row) => String(row.query || '').includes(literalA)) ||
        appAllRows.some((row) => String(row.query || '').includes(appLiteral)),
      infoSensitiveFields: infoSensitiveFields || infoHasSyntheticData,
      resetDenied,
    });
    assert(
      behavior.classification === 'PASS',
      `pg_stat_statements behavior failed: ${behavior.failures.join('; ')}`,
    );
    assert(
      appRows.some((row) => String(row.query || '').includes(appMarker)),
      'same-role sgs_app cross-session query visibility is missing',
    );
  } finally {
    await Promise.all(
      clients.map((client) => client.end().catch(() => undefined)),
    );
    await owner.query(`DROP ROLE IF EXISTS "${roleA}"`);
    await owner.query(`DROP ROLE IF EXISTS "${roleB}"`);
  }
}

async function assertAfter(owner, runtime, admin, ownerUrl, runtimeUrl) {
  const ledgerRows = await queryRows(
    owner,
    `SELECT count(*)::int AS migration_count FROM public.migrations`,
  );
  assert(
    Number(ledgerRows[0]?.migration_count) === 339,
    'after phase requires the 339-entry migration ledger',
  );

  const idempotencyRows = await queryRows(
    owner,
    `
      SELECT c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS force_rls,
             count(p.polname)::int AS policy_count,
             max(pg_get_expr(p.polqual, p.polrelid)) AS using_expression,
             max(pg_get_expr(p.polwithcheck, p.polrelid)) AS check_expression
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE n.nspname = 'public' AND c.relname = 'idempotency_durable_records'
      GROUP BY c.relrowsecurity, c.relforcerowsecurity
    `,
  );
  assert(
    idempotencyRows.length === 1,
    'idempotency table is missing after phase',
  );
  assert(
    booleanValue(idempotencyRows[0].rls_enabled),
    '0399 RLS is not enabled',
  );
  assert(
    booleanValue(idempotencyRows[0].force_rls),
    '0399 FORCE RLS is not enabled',
  );
  assert(
    Number(idempotencyRows[0].policy_count) === 1,
    '0399 policy count is not exactly one',
  );
  for (const expression of [
    idempotencyRows[0].using_expression,
    idempotencyRows[0].check_expression,
  ]) {
    assert(
      String(expression).includes('current_app_user_id'),
      '0399 policy omits current_app_user_id',
    );
    assert(
      String(expression).includes('digest'),
      '0399 policy omits SHA-256 reconstruction',
    );
    assert(
      !String(expression).includes('is_super_admin'),
      '0399 policy has a super-admin bypass',
    );
  }

  const sampleRows = await queryRows(
    owner,
    `SELECT to_regclass($1) AS table_name`,
    [SAMPLE_TABLE],
  );
  assert(!sampleRows[0]?.table_name, '0400 sample table still exists');

  const privileges = await queryRows(
    owner,
    `
      SELECT
        has_table_privilege($1, $3, 'SELECT') AS runtime_stat_select,
        has_table_privilege('public', $3, 'SELECT') AS public_stat_select,
        has_table_privilege($2, $3, 'SELECT') AS admin_stat_select,
        has_table_privilege($1, $4, 'SELECT') AS runtime_info_select,
        has_table_privilege('public', $4, 'SELECT') AS public_info_select,
        has_table_privilege($2, $4, 'SELECT') AS admin_info_select
    `,
    [RUNTIME_ROLE, ADMIN_ROLE, STATEMENTS_VIEW, STATEMENTS_INFO_VIEW],
  );
  const privilegeRow = privileges[0];
  assert(
    booleanValue(privilegeRow.runtime_stat_select),
    'provider-managed runtime pg_stat_statements SELECT is not available',
  );
  assert(
    booleanValue(privilegeRow.public_stat_select),
    'provider-managed PUBLIC pg_stat_statements SELECT is not available',
  );
  assert(
    booleanValue(privilegeRow.admin_stat_select),
    'admin pg_stat_statements SELECT was removed',
  );
  assert(
    booleanValue(privilegeRow.runtime_info_select),
    'provider-managed runtime pg_stat_statements_info SELECT is not available',
  );
  assert(
    booleanValue(privilegeRow.public_info_select),
    'provider-managed PUBLIC pg_stat_statements_info SELECT is not available',
  );
  assert(
    booleanValue(privilegeRow.admin_info_select),
    'admin should retain effective provider-managed info visibility',
  );

  const boundary = await inspectPgStatStatementsBoundary(owner);
  assert(
    boundary.classification === 'MANAGED_PROVIDER_CONSTRAINT',
    `pg_stat_statements ACL classification failed: ${boundary.failures.join('; ')}`,
  );
  assert(
    boundary.customerCanRevokeProviderAcl === false,
    'customer provider ACL revocation capability was not denied',
  );
  await assertPgStatBehavior(owner, runtime, ownerUrl, runtimeUrl);

  const monitorRows = await queryRows(
    owner,
    `
      WITH RECURSIVE inherited_roles(role_oid) AS (
        SELECT oid FROM pg_roles WHERE rolname = $1
        UNION
        SELECT am.roleid
        FROM pg_auth_members am
        JOIN inherited_roles ir ON ir.role_oid = am.member
        WHERE am.inherit_option
      )
      SELECT r.rolname AS role_name
      FROM inherited_roles ir
      JOIN pg_roles r ON r.oid = ir.role_oid
      WHERE r.rolname = ANY($2::text[])
    `,
    [RUNTIME_ROLE, ['pg_monitor', 'pg_read_all_stats']],
  );
  assert(monitorRows.length === 0, 'runtime monitoring membership remains');

  const sqlHashRows = await queryRows(
    owner,
    `SELECT encode(public.digest(value, 'sha256'), 'hex') AS hash FROM unnest($1::text[]) AS input(value)`,
    [HASH_VECTORS],
  );
  assert(
    sqlHashRows.map((row) => row.hash).join(',') ===
      HASH_VECTORS.map(sha256).join(','),
    'PostgreSQL SHA-256 vectors differ from Node',
  );

  const fixtureIds = [];
  const fixtures = [
    { tenantId: TENANT_A, userId: USER_A },
    { tenantId: TENANT_A, userId: USER_B },
    { tenantId: TENANT_B, userId: USER_A },
    { tenantId: null, userId: USER_B },
  ];
  try {
    for (const fixture of fixtures) {
      const scope = fixture.tenantId
        ? `tenant:${fixture.tenantId}:user:${fixture.userId}`
        : `user:${fixture.userId}`;
      const id = crypto.randomUUID();
      fixtureIds.push(id);
      await owner.query(
        `
          INSERT INTO ${IDEMPOTENCY_TABLE}
            (id, scope_hash, method, path, idempotency_key_hash, request_hash, status, expires_at)
          VALUES ($1, $2, 'POST', '/strict-audit', $3, $4, 'processing', now() + interval '1 hour')
        `,
        [id, sha256(scope), sha256(`key:${id}`), sha256(`request:${id}`)],
      );
    }

    await setContext(runtime, TENANT_A, USER_A);
    assert(
      Number(
        (
          await queryRows(
            runtime,
            `SELECT count(*)::int AS visible FROM ${IDEMPOTENCY_TABLE}`,
          )
        )[0].visible,
      ) === 1,
      'own tenant/user row is not visible',
    );
    assert(
      Number(
        (
          await queryRows(
            runtime,
            `SELECT count(*)::int AS visible FROM ${IDEMPOTENCY_TABLE} WHERE id = $1`,
            [fixtureIds[2]],
          )
        )[0].visible,
      ) === 0,
      'cross-tenant row is visible',
    );

    await setContext(runtime, TENANT_A, USER_B);
    assert(
      Number(
        (
          await queryRows(
            runtime,
            `SELECT count(*)::int AS visible FROM ${IDEMPOTENCY_TABLE}`,
          )
        )[0].visible,
      ) === 1,
      'same-tenant/different-user row is not visible',
    );
    assert(
      Number(
        (
          await queryRows(
            runtime,
            `SELECT count(*)::int AS visible FROM ${IDEMPOTENCY_TABLE} WHERE id = $1`,
            [fixtureIds[0]],
          )
        )[0].visible,
      ) === 0,
      'different-user row is visible',
    );

    await setContext(runtime, TENANT_B, USER_A);
    assert(
      Number(
        (
          await queryRows(
            runtime,
            `SELECT count(*)::int AS visible FROM ${IDEMPOTENCY_TABLE}`,
          )
        )[0].visible,
      ) === 1,
      'second tenant/user row is not visible',
    );

    await setContext(runtime, null, USER_B);
    assert(
      Number(
        (
          await queryRows(
            runtime,
            `SELECT count(*)::int AS visible FROM ${IDEMPOTENCY_TABLE}`,
          )
        )[0].visible,
      ) === 1,
      'user-only row is not visible',
    );

    await setContext(runtime, TENANT_A, USER_A, true);
    assert(
      Number(
        (
          await queryRows(
            runtime,
            `SELECT count(*)::int AS visible FROM ${IDEMPOTENCY_TABLE}`,
          )
        )[0].visible,
      ) === 1,
      'forged super-admin flag changed own visibility',
    );
    assert(
      Number(
        (
          await queryRows(
            runtime,
            `SELECT count(*)::int AS visible FROM ${IDEMPOTENCY_TABLE} WHERE id = $1`,
            [fixtureIds[2]],
          )
        )[0].visible,
      ) === 0,
      'forged super-admin flag exposed cross-tenant data',
    );

    await setContext(runtime, TENANT_A, USER_A);
    const ownInsertId = crypto.randomUUID();
    fixtureIds.push(ownInsertId);
    await runtime.query(
      `
        INSERT INTO ${IDEMPOTENCY_TABLE}
          (id, scope_hash, method, path, idempotency_key_hash, request_hash, status, expires_at)
        VALUES ($1, $2, 'POST', '/strict-audit', $3, $4, 'processing', now() + interval '1 hour')
      `,
      [
        ownInsertId,
        sha256(`tenant:${TENANT_A}:user:${USER_A}`),
        sha256(`key:${ownInsertId}`),
        sha256(`request:${ownInsertId}`),
      ],
    );
    const crossInsertId = crypto.randomUUID();
    let crossInsertDenied = false;
    try {
      await runtime.query(
        `
          INSERT INTO ${IDEMPOTENCY_TABLE}
            (id, scope_hash, method, path, idempotency_key_hash, request_hash, status, expires_at)
          VALUES ($1, $2, 'POST', '/strict-audit', $3, $4, 'processing', now() + interval '1 hour')
        `,
        [
          crossInsertId,
          sha256(`tenant:${TENANT_B}:user:${USER_A}`),
          sha256(`key:${crossInsertId}`),
          sha256(`request:${crossInsertId}`),
        ],
      );
    } catch (error) {
      crossInsertDenied = error && error.code === '42501';
    }
    assert(crossInsertDenied, 'cross-tenant insert was not denied with 42501');

    const updateResult = await runtime.query(
      `UPDATE ${IDEMPOTENCY_TABLE} SET status = 'completed' WHERE id = $1`,
      [fixtureIds[0]],
    );
    assert(updateResult.rowCount === 1, 'own update was not allowed');
    const crossUpdateResult = await runtime.query(
      `UPDATE ${IDEMPOTENCY_TABLE} SET status = 'completed' WHERE id = $1`,
      [fixtureIds[2]],
    );
    assert(
      crossUpdateResult.rowCount === 0,
      'cross-tenant update affected a row',
    );

    await runtime.query(`DELETE FROM ${IDEMPOTENCY_TABLE} WHERE id = $1`, [
      ownInsertId,
    ]);
    await setContext(runtime, 'not-a-uuid', 'not-a-uuid');
    assert(
      Number(
        (
          await queryRows(
            runtime,
            `SELECT count(*)::int AS visible FROM ${IDEMPOTENCY_TABLE}`,
          )
        )[0].visible,
      ) === 0,
      'malformed context exposed idempotency rows',
    );

    await setContext(runtime, TENANT_A, null);
    assert(
      Number(
        (
          await queryRows(
            runtime,
            `SELECT count(*)::int AS visible FROM ${IDEMPOTENCY_TABLE}`,
          )
        )[0].visible,
      ) === 0,
      'missing user context exposed idempotency rows',
    );
  } finally {
    await owner.query(
      `DELETE FROM ${IDEMPOTENCY_TABLE} WHERE id = ANY($1::uuid[])`,
      [fixtureIds],
    );
  }
}

async function setContext(client, tenantId, userId, forgedSuperAdmin = false) {
  await client.query(
    `
      SELECT
        set_config('app.current_company_id', $1, false),
        set_config('app.current_company', $2, false),
        set_config('app.current_user_id', $3, false),
        set_config('app.is_super_admin', $4, false)
    `,
    [tenantId || '', '', userId || '', forgedSuperAdmin ? 'true' : 'false'],
  );
}

async function main() {
  const phase = String(process.env[PHASE_ENV] || '')
    .trim()
    .toLowerCase();
  assert(
    phase === 'before' || phase === 'after',
    `${PHASE_ENV} must be before or after`,
  );
  const urls = {
    owner: requiredEnv(OWNER_URL_ENV),
    runtime: requiredEnv(RUNTIME_URL_ENV),
    admin: requiredEnv(ADMIN_URL_ENV),
  };
  assertChildEndpoint(urls);

  const owner = await connectRole(urls.owner, 'neondb_owner');
  const runtime = await connectRole(urls.runtime, RUNTIME_ROLE);
  const admin = await connectRole(urls.admin, ADMIN_ROLE);
  try {
    if (phase === 'before') {
      await assertBefore(owner, runtime, admin);
    } else {
      await assertAfter(owner, runtime, admin, urls.owner, urls.runtime);
    }
    console.log(
      JSON.stringify({
        status: 'PASS',
        phase,
        postgresMajor: 17,
        childEndpoint: 'verified-explicitly',
        migrationLedger: phase === 'before' ? 336 : 339,
        idempotencyRls:
          phase === 'before' ? 'not-yet-enabled' : 'force-enabled',
        sampleTable: phase === 'before' ? 'present-verified' : 'absent',
        pgStatRuntimeAccess: phase === 'before' ? 'present-baseline' : 'denied',
        pgStatAdminAccess:
          phase === 'before' ? 'present-baseline' : 'pg_stat_statements-only',
        productionAccess: 'NO',
        productionMigration: 'NO',
      }),
    );
  } finally {
    await Promise.all(
      [owner, runtime, admin].map((client) =>
        client.end().catch(() => undefined),
      ),
    );
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      reason: sanitizeError(error),
      productionAccess: 'NO',
      productionMigration: 'NO',
    }),
  );
  process.exitCode = 1;
});
