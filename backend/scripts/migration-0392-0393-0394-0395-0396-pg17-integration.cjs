const { Client } = require('pg');

const {
  HardenSecurityDefinerFunctions1709000000392,
} = require('../dist/infra/database/migrations/1709000000392-harden-security-definer-functions');
const {
  TightenRuntimeFunctionGrants1709000000393,
} = require('../dist/infra/database/migrations/1709000000393-tighten-runtime-function-grants');
const {
  HardenMaterializedViewRuntimeAccess1709000000394,
} = require('../dist/infra/database/migrations/1709000000394-harden-materialized-view-runtime-access');
const {
  HardenPhotographicReportRlsRoleGate1709000000395,
} = require('../dist/infra/database/migrations/1709000000395-harden-photographic-report-rls-role-gate');
const {
  CreatePublicAprEvidenceVerifyFunction1709000000396,
} = require('../dist/infra/database/migrations/1709000000396-create-public-apr-evidence-verify-function');

const BASE_URL_ENV = 'PG17_MIGRATION_TEST_URL';
const EXECUTOR_ROLE = `pg17_0396_executor_${process.pid}`;
const APP_ROLE = 'sgs_app';
const ADMIN_ROLE = 'sgs_admin';
const PRE_FIX_ROLE = `pg17_0396_pre_fix_owner_${process.pid}`;
const TEST_PASSWORD = 'pg17-0396-local-only';
const APP_PASSWORD = 'pg17-0396-app-local-only';
const FUNCTION_NAME = 'public.verify_apr_evidence_by_hash_public';
const FUNCTION_SIGNATURE = 'public.verify_apr_evidence_by_hash_public(text)';
const connectedClients = new WeakSet();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function booleanValue(value) {
  return value === true || value === 't' || value === 'true';
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function makeConnectionUrl(baseUrl, database, credentials) {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  if (credentials) {
    url.username = credentials.username;
    url.password = credentials.password;
  }
  return url.toString();
}

function createClient(options) {
  const client = new Client(options);
  client.on('error', () => {});
  return client;
}

async function connectClient(client) {
  await client.connect();
  connectedClients.add(client);
  return client;
}

async function closeClient(client, cleanupErrors = []) {
  if (!client || !connectedClients.has(client)) return;
  try {
    await client.end();
  } catch (error) {
    cleanupErrors.push(error);
  } finally {
    connectedClients.delete(client);
  }
}

async function queryRows(client, sql, parameters) {
  return (await client.query(sql, parameters)).rows;
}

function migrationRunner(client, options = {}) {
  return {
    query: async (sql, parameters) => {
      if (
        options.failAt === '0396-function-create' &&
        /CREATE OR REPLACE FUNCTION public\.verify_apr_evidence_by_hash_public/.test(
          sql,
        )
      ) {
        throw new Error('injected 0396 failure after temporary privileges');
      }
      const result = await client.query(sql, parameters);
      return result.rows;
    },
  };
}

async function roleExists(client, roleName) {
  const rows = await queryRows(
    client,
    'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS present',
    [roleName],
  );
  return booleanValue(rows[0]?.present);
}

async function membershipRows(client, roleName, memberName) {
  return queryRows(
    client,
    `
      SELECT
        grantor.rolname AS grantor,
        am.admin_option,
        am.inherit_option,
        am.set_option
      FROM pg_auth_members AS am
      JOIN pg_roles AS granted_role ON granted_role.oid = am.roleid
      JOIN pg_roles AS member_role ON member_role.oid = am.member
      JOIN pg_roles AS grantor ON grantor.oid = am.grantor
      WHERE granted_role.rolname = $1
        AND member_role.rolname = $2
    `,
    [roleName, memberName],
  );
}

function migrationChain() {
  return [
    new HardenSecurityDefinerFunctions1709000000392(),
    new TightenRuntimeFunctionGrants1709000000393(),
    new HardenMaterializedViewRuntimeAccess1709000000394(),
    new HardenPhotographicReportRlsRoleGate1709000000395(),
    new CreatePublicAprEvidenceVerifyFunction1709000000396(),
  ];
}

async function createFixtureTables(client) {
  await client.query(`
    CREATE TABLE public.users (
      id uuid PRIMARY KEY,
      nome varchar,
      cpf varchar,
      cpf_ciphertext text,
      cpf_hash text,
      email varchar,
      funcao varchar,
      password varchar,
      auth_user_id uuid,
      company_id uuid,
      site_id uuid,
      profile_id uuid,
      status boolean,
      must_change_password boolean,
      deleted_at timestamptz
    );
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, nome varchar);
    CREATE TABLE public.user_sites (
      user_id uuid,
      company_id uuid,
      site_id uuid,
      created_at timestamptz
    );
    CREATE TABLE public.signatures (
      signature_hash text,
      signed_at timestamptz,
      timestamp_authority text,
      type text,
      timestamp_token text,
      integrity_payload jsonb,
      deleted_at timestamptz
    );
    CREATE TABLE public.apr_risk_evidences (
      id uuid PRIMARY KEY,
      hash_sha256 varchar(64) NOT NULL,
      watermarked_hash_sha256 varchar(64),
      apr_id uuid,
      apr_risk_item_id uuid,
      uploaded_by_id uuid,
      uploaded_at timestamptz DEFAULT now()
    );
    ALTER TABLE public.apr_risk_evidences ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.apr_risk_evidences FORCE ROW LEVEL SECURITY;
    CREATE POLICY apr_evidence_runtime_deny
      ON public.apr_risk_evidences
      FOR ALL TO sgs_app
      USING (false)
      WITH CHECK (false);

    CREATE TABLE public.companies (id uuid PRIMARY KEY);
    CREATE TABLE public.aprs (id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE public.pts (id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE public.nonconformities (id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE public.trainings (id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE public.mv_source (
      id integer PRIMARY KEY,
      company_id uuid NOT NULL,
      metric integer NOT NULL
    );
    INSERT INTO public.mv_source (id, company_id, metric)
    VALUES
      (1, '00000000-0000-0000-0000-000000000001', 10),
      (2, '00000000-0000-0000-0000-000000000002', 20);
    CREATE MATERIALIZED VIEW public.company_dashboard_metrics AS
      SELECT id, company_id, metric FROM public.mv_source WITH DATA;
    CREATE UNIQUE INDEX company_dashboard_metrics_id_idx
      ON public.company_dashboard_metrics (id);
    CREATE MATERIALIZED VIEW public.apr_risk_rankings AS
      SELECT id, company_id, metric FROM public.mv_source WITH DATA;
    CREATE UNIQUE INDEX apr_risk_rankings_id_idx
      ON public.apr_risk_rankings (id);

    CREATE TABLE public.photographic_reports (
      id uuid PRIMARY KEY,
      company_id uuid NOT NULL
    );
    CREATE TABLE public.photographic_report_days (
      id uuid PRIMARY KEY,
      report_id uuid NOT NULL
    );
    CREATE TABLE public.photographic_report_images (
      id uuid PRIMARY KEY,
      report_id uuid NOT NULL
    );
    CREATE TABLE public.photographic_report_exports (
      id uuid PRIMARY KEY,
      report_id uuid NOT NULL
    );
  `);
}

async function createFixtureFunctions(client) {
  await client.query(`
    CREATE OR REPLACE FUNCTION public.gdpr_delete_user_data(uuid)
    RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
    CREATE OR REPLACE FUNCTION public.cleanup_expired_data()
    RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
    CREATE OR REPLACE FUNCTION public.current_company()
    RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE OR REPLACE FUNCTION public.is_super_admin()
    RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE OR REPLACE FUNCTION public.current_user_role()
    RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
    CREATE OR REPLACE FUNCTION public.current_app_user_id()
    RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE OR REPLACE FUNCTION public.current_site_id()
    RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE OR REPLACE FUNCTION public.current_site_scope()
    RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
    CREATE OR REPLACE FUNCTION public.current_site_ids()
    RETURNS uuid[] LANGUAGE sql AS $$ SELECT ARRAY[]::uuid[] $$;
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE OR REPLACE FUNCTION public.try_parse_uuid(text)
    RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  `);
}

async function assertExecutorIdentity(client) {
  const rows = await queryRows(
    client,
    `
      SELECT current_user, session_user, rolsuper, rolcreaterole
      FROM pg_roles
      WHERE rolname = current_user
    `,
  );
  assert(rows.length === 1, '0396 executor identity row missing');
  assert(
    rows[0].current_user === EXECUTOR_ROLE &&
      rows[0].session_user === EXECUTOR_ROLE,
    '0396 integration did not connect as the non-superuser executor',
  );
  assert(!booleanValue(rows[0].rolsuper), '0396 executor is superuser');
  assert(booleanValue(rows[0].rolcreaterole), '0396 executor lacks CREATEROLE');
}

async function assertPreFixOwnershipFailure(client) {
  await client.query(`
    CREATE ROLE ${quoteIdentifier(PRE_FIX_ROLE)}
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    GRANT CREATE ON SCHEMA public TO ${quoteIdentifier(PRE_FIX_ROLE)}
      GRANTED BY CURRENT_USER;
    CREATE FUNCTION public.pg17_0396_owner_transfer_probe()
      RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
  `);

  const memberships = await membershipRows(client, PRE_FIX_ROLE, EXECUTOR_ROLE);
  assert(
    memberships.length === 1 &&
      booleanValue(memberships[0].admin_option) &&
      !booleanValue(memberships[0].inherit_option) &&
      !booleanValue(memberships[0].set_option),
    '0396 pre-fix membership did not expose the PG17 default options',
  );

  await client.query('BEGIN');
  let failedAtSetRole = false;
  try {
    await client.query(
      `ALTER FUNCTION public.pg17_0396_owner_transfer_probe() OWNER TO ${quoteIdentifier(PRE_FIX_ROLE)}`,
    );
  } catch (error) {
    failedAtSetRole = /SET ROLE|must be able to SET ROLE/i.test(
      String(error?.message),
    );
  }
  await client.query('ROLLBACK');
  assert(
    failedAtSetRole,
    '0396 old ownership transfer did not reproduce PG17 SET ROLE failure',
  );

  await client.query('DROP FUNCTION public.pg17_0396_owner_transfer_probe()');
  await client.query(
    `REVOKE CREATE ON SCHEMA public FROM ${quoteIdentifier(PRE_FIX_ROLE)}`,
  );
  await client.query(`DROP ROLE ${quoteIdentifier(PRE_FIX_ROLE)}`);
}

async function assertRoleAndFunctionContract(client) {
  const role = (
    await queryRows(
      client,
      `
        SELECT
          r.rolcanlogin,
          r.rolsuper,
          r.rolcreatedb,
          r.rolcreaterole,
          r.rolinherit,
          r.rolbypassrls,
          has_schema_privilege('sgs_function_owner', 'public', 'USAGE') AS schema_usage,
          has_schema_privilege('sgs_function_owner', 'public', 'CREATE') AS schema_create,
          EXISTS (
            SELECT 1
            FROM pg_auth_members AS membership
            JOIN pg_roles AS member_role ON member_role.oid = membership.member
            JOIN pg_roles AS owner_role ON owner_role.oid = membership.roleid
            WHERE member_role.rolname = 'sgs_app'
              AND owner_role.rolname = 'sgs_function_owner'
          ) AS app_member,
          (
            SELECT count(*) FROM pg_auth_members AS membership
            JOIN pg_roles AS owner_role ON owner_role.oid = membership.roleid
            WHERE owner_role.rolname = 'sgs_function_owner'
              AND membership.set_option
          ) AS set_memberships,
          (
            SELECT count(*) FROM pg_auth_members AS membership
            JOIN pg_roles AS owner_role ON owner_role.oid = membership.roleid
            WHERE owner_role.rolname = 'sgs_function_owner'
              AND membership.inherit_option
          ) AS inherit_memberships
        FROM pg_roles AS r
        WHERE r.rolname = 'sgs_function_owner'
      `,
    )
  )[0];
  assert(role, '0396 final owner role is absent');
  assert(!booleanValue(role.rolcanlogin), '0396 owner role can LOGIN');
  assert(!booleanValue(role.rolsuper), '0396 owner role is SUPERUSER');
  assert(!booleanValue(role.rolcreatedb), '0396 owner role can CREATEDB');
  assert(!booleanValue(role.rolcreaterole), '0396 owner role can CREATEROLE');
  assert(!booleanValue(role.rolinherit), '0396 owner role has INHERIT');
  assert(booleanValue(role.rolbypassrls), '0396 owner role lost BYPASSRLS');
  assert(booleanValue(role.schema_usage), '0396 owner role lost schema USAGE');
  assert(
    !booleanValue(role.schema_create),
    '0396 temporary schema CREATE remains',
  );
  assert(!booleanValue(role.app_member), '0396 sgs_app became owner member');
  assert(Number(role.set_memberships) === 0, '0396 SET membership remains');
  assert(
    Number(role.inherit_memberships) === 0,
    '0396 INHERIT membership remains',
  );

  const executorMembership = await membershipRows(
    client,
    'sgs_function_owner',
    EXECUTOR_ROLE,
  );
  assert(
    executorMembership.length === 1 &&
      booleanValue(executorMembership[0].admin_option) &&
      !booleanValue(executorMembership[0].inherit_option) &&
      !booleanValue(executorMembership[0].set_option),
    '0396 executor membership was not restored without temporary options',
  );

  const functionRows = await queryRows(
    client,
    `
      SELECT
        pg_get_userbyid(p.proowner) AS owner,
        p.prosecdef AS security_definer,
        language.lanname AS language_name,
        p.proconfig AS config,
        has_function_privilege('public', '${FUNCTION_SIGNATURE}', 'EXECUTE') AS public_execute,
        has_function_privilege('sgs_admin', '${FUNCTION_SIGNATURE}', 'EXECUTE') AS admin_execute,
        has_function_privilege('sgs_app', '${FUNCTION_SIGNATURE}', 'EXECUTE') AS app_execute
      FROM pg_proc AS p
      JOIN pg_language AS language ON language.oid = p.prolang
      WHERE p.oid = '${FUNCTION_SIGNATURE}'::regprocedure
    `,
  );
  const fn = functionRows[0];
  assert(fn, '0396 verification function is absent');
  assert(fn.owner === 'sgs_function_owner', '0396 function owner is incorrect');
  assert(
    booleanValue(fn.security_definer),
    '0396 function is not SECURITY DEFINER',
  );
  assert(fn.language_name === 'sql', '0396 function language is not SQL');
  assert(
    fn.config.includes('search_path=pg_catalog, public, pg_temp'),
    '0396 function search_path is unsafe',
  );
  assert(!booleanValue(fn.public_execute), '0396 PUBLIC EXECUTE remains');
  assert(!booleanValue(fn.admin_execute), '0396 sgs_admin EXECUTE remains');
  assert(booleanValue(fn.app_execute), '0396 sgs_app EXECUTE is missing');

  const tablePrivileges = (
    await queryRows(
      client,
      `
        SELECT
          has_table_privilege('sgs_function_owner', 'public.apr_risk_evidences', 'SELECT') AS can_select,
          has_table_privilege('sgs_function_owner', 'public.apr_risk_evidences', 'INSERT') AS can_insert,
          has_table_privilege('sgs_function_owner', 'public.apr_risk_evidences', 'UPDATE') AS can_update,
          has_table_privilege('sgs_function_owner', 'public.apr_risk_evidences', 'DELETE') AS can_delete,
          has_table_privilege('sgs_function_owner', 'public.apr_risk_evidences', 'TRUNCATE') AS can_truncate,
          has_table_privilege('sgs_function_owner', 'public.apr_risk_evidences', 'REFERENCES') AS can_references,
          has_table_privilege('sgs_function_owner', 'public.apr_risk_evidences', 'TRIGGER') AS can_trigger
      `,
    )
  )[0];
  assert(booleanValue(tablePrivileges.can_select), '0396 owner SELECT missing');
  for (const privilege of [
    'can_insert',
    'can_update',
    'can_delete',
    'can_truncate',
    'can_references',
    'can_trigger',
  ]) {
    assert(
      !booleanValue(tablePrivileges[privilege]),
      `0396 broad table privilege: ${privilege}`,
    );
  }
}

async function assertFunctionalBoundary(executorClient, appClient) {
  const originalHash = 'a'.repeat(64);
  const watermarkedHash = 'b'.repeat(64);
  await executorClient.query(
    `
      INSERT INTO public.apr_risk_evidences (
        id, hash_sha256, watermarked_hash_sha256
      ) VALUES (
        '00000000-0000-0000-0000-000000000039', $1, $2
      )
    `,
    [originalHash, watermarkedHash],
  );

  const original = await queryRows(
    appClient,
    `SELECT * FROM ${FUNCTION_NAME}($1)`,
    [originalHash],
  );
  const watermarked = await queryRows(
    appClient,
    `SELECT * FROM ${FUNCTION_NAME}($1)`,
    [watermarkedHash],
  );
  const unknown = await queryRows(
    appClient,
    `SELECT * FROM ${FUNCTION_NAME}($1)`,
    ['c'.repeat(64)],
  );
  const invalid = await queryRows(
    appClient,
    `SELECT * FROM ${FUNCTION_NAME}($1)`,
    ['not-a-sha256'],
  );

  assert(
    JSON.stringify(original) === JSON.stringify([{ matched_in: 'original' }]),
    '0396 original hash result leaked or changed',
  );
  assert(
    JSON.stringify(watermarked) ===
      JSON.stringify([{ matched_in: 'watermarked' }]),
    '0396 watermarked hash result leaked or changed',
  );
  assert(unknown.length === 0, '0396 unknown valid hash returned data');
  assert(invalid.length === 0, '0396 invalid hash returned data');

  let directSelectDenied = false;
  try {
    await appClient.query('SELECT * FROM public.apr_risk_evidences');
  } catch (error) {
    directSelectDenied = /permission denied/i.test(String(error?.message));
  }
  assert(directSelectDenied, '0396 sgs_app direct table SELECT was not denied');
}

async function assertRollbackCleanup(adminUrl, databaseName) {
  const targetAdmin = await connectClient(
    createClient({
      connectionString: makeConnectionUrl(adminUrl, databaseName),
      ssl: false,
    }),
  );
  try {
    const rows = await queryRows(
      targetAdmin,
      `
        SELECT
          has_schema_privilege('sgs_function_owner', 'public', 'CREATE') AS schema_create,
          has_table_privilege('sgs_function_owner', 'public.apr_risk_evidences', 'SELECT') AS table_select,
          EXISTS (
            SELECT 1 FROM pg_proc
            WHERE oid = to_regprocedure('${FUNCTION_SIGNATURE}')
          ) AS function_present
      `,
    );
    assert(
      !booleanValue(rows[0].schema_create),
      '0396 rollback left schema CREATE',
    );
    assert(
      !booleanValue(rows[0].table_select),
      '0396 rollback left table SELECT',
    );
    assert(
      !booleanValue(rows[0].function_present),
      '0396 rollback left function',
    );
    const membership = await membershipRows(
      targetAdmin,
      'sgs_function_owner',
      EXECUTOR_ROLE,
    );
    assert(
      membership.length === 1 &&
        booleanValue(membership[0].admin_option) &&
        !booleanValue(membership[0].inherit_option) &&
        !booleanValue(membership[0].set_option),
      '0396 rollback did not restore executor membership options',
    );
  } finally {
    await closeClient(targetAdmin);
  }
}

async function assertDownCleanup(client) {
  const rows = await queryRows(
    client,
    `
      SELECT
        EXISTS (
          SELECT 1 FROM pg_proc
          WHERE oid = to_regprocedure('${FUNCTION_SIGNATURE}')
        ) AS function_present,
        has_schema_privilege('sgs_function_owner', 'public', 'CREATE') AS schema_create,
        has_table_privilege('sgs_function_owner', 'public.apr_risk_evidences', 'SELECT') AS table_select
    `,
  );
  assert(!booleanValue(rows[0].function_present), '0396 down left function');
  assert(!booleanValue(rows[0].schema_create), '0396 down left schema CREATE');
  assert(!booleanValue(rows[0].table_select), '0396 down left table SELECT');
  const membership = await membershipRows(
    client,
    'sgs_function_owner',
    EXECUTOR_ROLE,
  );
  assert(
    membership.length === 1 &&
      booleanValue(membership[0].admin_option) &&
      !booleanValue(membership[0].inherit_option) &&
      !booleanValue(membership[0].set_option),
    '0396 down left temporary membership options',
  );
}

async function main() {
  const baseUrl = process.env[BASE_URL_ENV];
  assert(baseUrl, `${BASE_URL_ENV} is required for local PG17 integration`);
  const parsedUrl = new URL(baseUrl);
  assert(
    ['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname),
    '0396 integration refuses a non-local database host',
  );

  const adminDatabase = parsedUrl.pathname.slice(1) || 'postgres';
  const adminUrl = makeConnectionUrl(baseUrl, adminDatabase);
  const databaseName = `sgs_pg17_0396_${Date.now()}_${process.pid}`;
  const executorUrl = makeConnectionUrl(baseUrl, databaseName, {
    username: EXECUTOR_ROLE,
    password: TEST_PASSWORD,
  });
  const appUrl = makeConnectionUrl(baseUrl, databaseName, {
    username: APP_ROLE,
    password: APP_PASSWORD,
  });

  const adminClient = await connectClient(
    createClient({ connectionString: adminUrl, ssl: false }),
  );
  let executorClient;
  let appClient;
  let databaseCreated = false;
  let stage = 'connect';
  const cleanupErrors = [];

  try {
    stage = 'server-version';
    const versionRows = await queryRows(
      adminClient,
      `SELECT current_setting('server_version_num') AS version_num`,
    );
    const postgresMajor = Math.floor(
      Number(versionRows[0]?.version_num) / 10000,
    );
    assert(postgresMajor === 17, '0396 integration requires PostgreSQL 17');

    stage = 'role-preflight';
    for (const roleName of [APP_ROLE, ADMIN_ROLE, 'sgs_function_owner']) {
      assert(
        !(await roleExists(adminClient, roleName)),
        `0396 fixture role already exists: ${roleName}`,
      );
    }
    assert(
      !(await roleExists(adminClient, EXECUTOR_ROLE)),
      '0396 executor role already exists',
    );

    stage = 'create-roles-and-database';
    await adminClient.query(
      `CREATE ROLE ${quoteIdentifier(EXECUTOR_ROLE)} LOGIN PASSWORD ${quoteLiteral(TEST_PASSWORD)} CREATEROLE BYPASSRLS NOSUPERUSER NOCREATEDB`,
    );
    await adminClient.query(
      `CREATE ROLE ${quoteIdentifier(APP_ROLE)} LOGIN PASSWORD ${quoteLiteral(APP_PASSWORD)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
    );
    await adminClient.query(
      `CREATE ROLE ${quoteIdentifier(ADMIN_ROLE)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
    );
    await adminClient.query(
      `CREATE DATABASE ${quoteIdentifier(databaseName)} OWNER ${quoteIdentifier(EXECUTOR_ROLE)}`,
    );
    databaseCreated = true;
    await closeClient(adminClient, cleanupErrors);

    executorClient = await connectClient(
      createClient({ connectionString: executorUrl, ssl: false }),
    );
    stage = 'fixture-schema';
    await executorClient.query(
      `ALTER SCHEMA public OWNER TO ${quoteIdentifier(EXECUTOR_ROLE)}`,
    );
    await assertExecutorIdentity(executorClient);
    await createFixtureTables(executorClient);
    await createFixtureFunctions(executorClient);
    stage = 'old-failure-reproduction';
    await assertPreFixOwnershipFailure(executorClient);

    await executorClient.query('BEGIN');
    for (const migration of migrationChain()) {
      stage = `migration-${migration.name}`;
      await migration.up(migrationRunner(executorClient));
    }
    stage = 'commit-migration-chain';
    await executorClient.query('COMMIT');
    stage = 'final-contract';
    await assertRoleAndFunctionContract(executorClient);

    appClient = await connectClient(
      createClient({ connectionString: appUrl, ssl: false }),
    );
    stage = 'functional-boundary';
    await assertFunctionalBoundary(executorClient, appClient);
    await closeClient(appClient, cleanupErrors);
    appClient = null;

    stage = 'down-migration';
    await executorClient.query('BEGIN');
    await new CreatePublicAprEvidenceVerifyFunction1709000000396().down(
      migrationRunner(executorClient),
    );
    await executorClient.query('COMMIT');
    await assertDownCleanup(executorClient);

    stage = 'rollback-injection';
    await executorClient.query('BEGIN');
    let rollbackFailureObserved = false;
    try {
      await new CreatePublicAprEvidenceVerifyFunction1709000000396().up(
        migrationRunner(executorClient, { failAt: '0396-function-create' }),
      );
    } catch (error) {
      rollbackFailureObserved =
        /injected 0396 failure after temporary privileges/.test(
          String(error?.message),
        );
    }
    assert(
      rollbackFailureObserved,
      '0396 controlled rollback failure was not observed',
    );
    await executorClient.query('ROLLBACK');
    await assertRollbackCleanup(adminUrl, databaseName);

    stage = 'reapply-after-rollback';
    await executorClient.query('BEGIN');
    await new CreatePublicAprEvidenceVerifyFunction1709000000396().up(
      migrationRunner(executorClient),
    );
    await executorClient.query('COMMIT');
    await assertRoleAndFunctionContract(executorClient);

    console.log(
      JSON.stringify({
        status: 'PASS',
        postgresMajor: 17,
        executor: 'non-superuser CREATEROLE role',
        migrationChain: '0392 -> 0393 -> 0394 -> 0395 -> 0396',
        preFixOwnershipTransfer: 'FAIL at SET ROLE as expected',
        fixed0396: 'PASS',
        functionalOriginal: 'PASS',
        functionalWatermarked: 'PASS',
        unknownAndInvalidHashes: 'PASS',
        directTableSelectDenied: 'PASS',
        rollbackCleanup: 'PASS',
        downOwnerAware: 'PASS',
        finalOwnerContract: 'PASS',
        productionAccess: 'NO',
        neonAccess: 'NO',
      }),
    );
  } catch (error) {
    throw new Error(
      `0396 integration failed at ${stage}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  } finally {
    await closeClient(appClient, cleanupErrors);
    await closeClient(executorClient, cleanupErrors);
    await closeClient(adminClient, cleanupErrors);

    const cleanupAdmin = createClient({
      connectionString: adminUrl,
      ssl: false,
    });
    try {
      await connectClient(cleanupAdmin);
      if (databaseCreated) {
        await cleanupAdmin.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [databaseName],
        );
        await cleanupAdmin.query(
          `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
        );
      }
      for (const roleName of [
        'sgs_function_owner',
        EXECUTOR_ROLE,
        APP_ROLE,
        ADMIN_ROLE,
        PRE_FIX_ROLE,
      ]) {
        if (await roleExists(cleanupAdmin, roleName)) {
          if (
            roleName === 'sgs_function_owner' &&
            (await roleExists(cleanupAdmin, EXECUTOR_ROLE))
          ) {
            await cleanupAdmin.query(
              `REVOKE ${quoteIdentifier(roleName)} FROM ${quoteIdentifier(EXECUTOR_ROLE)}`,
            );
          }
          await cleanupAdmin.query(`DROP ROLE ${quoteIdentifier(roleName)}`);
        }
      }
    } catch (error) {
      cleanupErrors.push(error);
    } finally {
      await closeClient(cleanupAdmin, cleanupErrors);
    }
    if (cleanupErrors.length > 0) {
      throw new Error(`0396 cleanup failed: ${cleanupErrors[0].message}`);
    }
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      reason: error instanceof Error ? error.message : String(error),
      productionAccess: 'NO',
      neonAccess: 'NO',
    }),
  );
  process.exitCode = 1;
});
