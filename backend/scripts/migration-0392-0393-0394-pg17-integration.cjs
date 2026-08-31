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

const BASE_URL_ENV = 'PG17_MIGRATION_TEST_URL';
const EXECUTOR_ROLE = 'migration_0394_executor';
const APP_ROLE = 'sgs_app';
const ADMIN_ROLE = 'sgs_admin';
const PUBLIC_ROLE = 'pg17_0394_unrelated_role';
const PRE_FIX_ROLE = 'pg17_0394_pre_fix_owner';
const TEST_PASSWORD = 'migration-0394-pg17-test-only';
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
      const result = await client.query(sql, parameters);
      if (
        options.failAfterCompanyMetricsRevoke &&
        /REVOKE ALL PRIVILEGES ON TABLE public\."company_dashboard_metrics"/.test(
          sql,
        )
      ) {
        throw new Error(
          'injected 0394 failure after first materialized-view revoke',
        );
      }
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

async function createFixtureMaterializedViews(client) {
  await client.query(`
    CREATE MATERIALIZED VIEW public.company_dashboard_metrics AS
      SELECT id, company_id, metric FROM public.mv_source
      WITH DATA;
    CREATE UNIQUE INDEX company_dashboard_metrics_id_idx
      ON public.company_dashboard_metrics (id);
  `);
  await createAprRiskRanking(client);
}

async function createAprRiskRanking(client) {
  await client.query(`
    CREATE MATERIALIZED VIEW public.apr_risk_rankings AS
      SELECT id, company_id, metric FROM public.mv_source
      WITH DATA;
    CREATE UNIQUE INDEX apr_risk_rankings_id_idx
      ON public.apr_risk_rankings (id);
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
  assert(rows.length === 1, '0394 executor identity row missing');
  assert(
    rows[0].current_user === EXECUTOR_ROLE &&
      rows[0].session_user === EXECUTOR_ROLE,
    '0394 did not connect as the non-superuser executor',
  );
  assert(
    !booleanValue(rows[0].rolsuper),
    '0394 executor is unexpectedly superuser',
  );
  assert(booleanValue(rows[0].rolcreaterole), '0394 executor lacks CREATEROLE');
}

async function assertPreFixOwnershipFailure(client) {
  await client.query(`
    CREATE ROLE ${quoteIdentifier(PRE_FIX_ROLE)}
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    GRANT CREATE ON SCHEMA public TO ${quoteIdentifier(PRE_FIX_ROLE)}
      GRANTED BY CURRENT_USER;
  `);

  const memberships = await queryRows(
    client,
    `
      SELECT am.admin_option, am.inherit_option, am.set_option
      FROM pg_auth_members AS am
      JOIN pg_roles AS granted_role ON granted_role.oid = am.roleid
      JOIN pg_roles AS member_role ON member_role.oid = am.member
      WHERE granted_role.rolname = $1 AND member_role.rolname = current_user
    `,
    [PRE_FIX_ROLE],
  );
  assert(memberships.length === 1, '0394 PG17 pre-fix membership row missing');
  assert(
    booleanValue(memberships[0].admin_option),
    '0394 pre-fix ADMIN option missing',
  );
  assert(
    !booleanValue(memberships[0].inherit_option),
    '0394 pre-fix INHERIT unexpectedly enabled',
  );
  assert(
    !booleanValue(memberships[0].set_option),
    '0394 pre-fix SET unexpectedly enabled',
  );

  await client.query('BEGIN');
  let failedAtSetRole = false;
  try {
    await client.query(
      `ALTER MATERIALIZED VIEW public.company_dashboard_metrics OWNER TO ${quoteIdentifier(PRE_FIX_ROLE)}`,
    );
  } catch (error) {
    failedAtSetRole = /SET ROLE|must be able to SET ROLE/i.test(
      String(error?.message),
    );
  }
  await client.query('ROLLBACK');
  assert(
    failedAtSetRole,
    '0394 old ownership transfer did not reproduce PG17 SET ROLE failure',
  );

  await client.query(
    `REVOKE CREATE ON SCHEMA public FROM ${quoteIdentifier(PRE_FIX_ROLE)}`,
  );
  await client.query(`DROP ROLE ${quoteIdentifier(PRE_FIX_ROLE)}`);
}

async function assert0392And0393Contract(client) {
  const ownerRows = await queryRows(
    client,
    `
      SELECT count(*)::text AS owned_count
      FROM pg_proc AS p
      JOIN pg_roles AS r ON r.oid = p.proowner
      WHERE r.rolname = 'sgs_function_owner'
        AND p.oid IN (
          'public.find_login_user(text, text)'::regprocedure,
          'public.update_login_user_password_hash(uuid, text)'::regprocedure,
          'public.find_user_bridge(uuid, uuid)'::regprocedure,
          'public.reset_login_user_password(uuid, text)'::regprocedure,
          'public.verify_signature_by_hash_public(text)'::regprocedure
        )
    `,
  );
  assert(
    Number(ownerRows[0]?.owned_count) === 5,
    '0392 ownership contract failed',
  );

  const executeRows = await queryRows(
    client,
    `
      SELECT
        has_function_privilege('sgs_app', 'public.current_company()', 'EXECUTE') AS app_execute,
        has_function_privilege('sgs_app', 'public.find_login_user(text, text)', 'EXECUTE') AS hardened_execute
    `,
  );
  assert(
    booleanValue(executeRows[0]?.app_execute),
    '0393 approved runtime EXECUTE missing',
  );
  assert(
    booleanValue(executeRows[0]?.hardened_execute),
    '0393 SECURITY DEFINER EXECUTE missing',
  );
}

async function assertRollback(executorUrl) {
  const client = await connectClient(
    createClient({ connectionString: executorUrl, ssl: false }),
  );
  try {
    await client.query(
      `GRANT SELECT ON TABLE public.company_dashboard_metrics TO PUBLIC, sgs_app`,
    );
    await client.query('BEGIN');
    let injectedFailure = false;
    try {
      await new HardenMaterializedViewRuntimeAccess1709000000394().up(
        migrationRunner(client, { failAfterCompanyMetricsRevoke: true }),
      );
    } catch (error) {
      injectedFailure = /injected 0394 failure/.test(String(error?.message));
    }
    assert(
      injectedFailure,
      '0394 controlled rollback failure was not observed',
    );
    await client.query('ROLLBACK');

    const rows = await queryRows(
      client,
      `
        SELECT
          has_table_privilege('sgs_app', 'public.company_dashboard_metrics', 'SELECT') AS app_select,
          has_table_privilege('pg17_0394_unrelated_role', 'public.company_dashboard_metrics', 'SELECT') AS public_select
      `,
    );
    assert(
      booleanValue(rows[0]?.app_select),
      '0394 rollback did not restore sgs_app ACL',
    );
    assert(
      booleanValue(rows[0]?.public_select),
      '0394 rollback did not restore PUBLIC ACL',
    );
  } finally {
    await closeClient(client);
  }
}

async function assertRuntimeOwnedFailsClosed(executorClient, appUrl) {
  await executorClient.query('DROP MATERIALIZED VIEW public.apr_risk_rankings');
  await executorClient.query('GRANT USAGE, CREATE ON SCHEMA public TO sgs_app');
  const appClient = await connectClient(
    createClient({ connectionString: appUrl, ssl: false }),
  );
  try {
    await appClient.query(`
      CREATE MATERIALIZED VIEW public.apr_risk_rankings AS
        SELECT 1 AS id
        WITH DATA
    `);
  } finally {
    await closeClient(appClient);
  }
  await executorClient.query(
    'REVOKE USAGE, CREATE ON SCHEMA public FROM sgs_app',
  );
  await executorClient.query(
    'GRANT SELECT ON TABLE public.company_dashboard_metrics TO sgs_app',
  );

  await executorClient.query('BEGIN');
  let failedClosed = false;
  try {
    await new HardenMaterializedViewRuntimeAccess1709000000394().up(
      migrationRunner(executorClient),
    );
  } catch (error) {
    failedClosed = /0394 refuses runtime-owned materialized view/.test(
      String(error?.message),
    );
  }
  await executorClient.query('ROLLBACK');
  assert(failedClosed, '0394 did not fail closed for an sgs_app-owned view');
  assert(
    await tablePrivilege(
      executorClient,
      APP_ROLE,
      'company_dashboard_metrics',
      'SELECT',
    ),
    '0394 fail-closed preflight mutated an unrelated ACL',
  );

  await executorClient.query(
    'REVOKE SELECT ON TABLE public.company_dashboard_metrics FROM sgs_app',
  );
  const ownerClient = await connectClient(
    createClient({ connectionString: appUrl, ssl: false }),
  );
  try {
    await ownerClient.query('DROP MATERIALIZED VIEW public.apr_risk_rankings');
  } finally {
    await closeClient(ownerClient);
  }
  await createAprRiskRanking(executorClient);
}

async function tablePrivilege(client, roleName, relationName, privilege) {
  const rows = await queryRows(
    client,
    'SELECT has_table_privilege($1, $2, $3) AS allowed',
    [roleName, `public.${relationName}`, privilege],
  );
  return booleanValue(rows[0]?.allowed);
}

async function assertMaterializedViewContract(client) {
  for (const relationName of [
    'company_dashboard_metrics',
    'apr_risk_rankings',
  ]) {
    const ownerRows = await queryRows(
      client,
      `
        SELECT owner_role.rolname AS owner, c.relkind
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        JOIN pg_roles AS owner_role ON owner_role.oid = c.relowner
        WHERE n.nspname = 'public' AND c.relname = $1
      `,
      [relationName],
    );
    assert(
      ownerRows.length === 1,
      `0394 materialized view missing: ${relationName}`,
    );
    assert(
      ownerRows[0].relkind === 'm',
      `0394 relation kind changed: ${relationName}`,
    );
    assert(
      ownerRows[0].owner === EXECUTOR_ROLE,
      `0394 owner changed: ${relationName}`,
    );
    assert(
      await tablePrivilege(client, ADMIN_ROLE, relationName, 'SELECT'),
      `0394 admin SELECT missing: ${relationName}`,
    );
    assert(
      await tablePrivilege(client, ADMIN_ROLE, relationName, 'MAINTAIN'),
      `0394 admin MAINTAIN missing: ${relationName}`,
    );
    for (const roleName of [APP_ROLE, PUBLIC_ROLE]) {
      assert(
        !(await tablePrivilege(client, roleName, relationName, 'SELECT')),
        `0394 ${roleName} SELECT remained: ${relationName}`,
      );
      assert(
        !(await tablePrivilege(client, roleName, relationName, 'MAINTAIN')),
        `0394 ${roleName} MAINTAIN remained: ${relationName}`,
      );
    }
    for (const privilege of [
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
    ]) {
      assert(
        !(await tablePrivilege(client, ADMIN_ROLE, relationName, privilege)),
        `0394 admin ${privilege} unexpectedly granted: ${relationName}`,
      );
    }
  }
}

async function assertDenied(client, sql, label) {
  let denied = false;
  try {
    await client.query(sql);
  } catch (error) {
    denied = error?.code === '42501';
  }
  assert(denied, `${label} was not denied with 42501`);
}

async function assertRuntimeAndAdminOperations(
  adminUrl,
  appUrl,
  publicUrl,
  executorClient,
) {
  for (const tableName of [
    'companies',
    'aprs',
    'pts',
    'nonconformities',
    'trainings',
  ]) {
    assert(
      await tablePrivilege(executorClient, ADMIN_ROLE, tableName, 'SELECT'),
      `0394 admin base-table SELECT missing: ${tableName}`,
    );
  }

  const adminClient = await connectClient(
    createClient({ connectionString: adminUrl, ssl: false }),
  );
  const appClient = await connectClient(
    createClient({ connectionString: appUrl, ssl: false }),
  );
  const publicClient = await connectClient(
    createClient({ connectionString: publicUrl, ssl: false }),
  );
  try {
    await adminClient.query(
      'SELECT count(*) FROM public.company_dashboard_metrics',
    );
    await adminClient.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.company_dashboard_metrics',
    );
    await adminClient.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.apr_risk_rankings',
    );

    await assertDenied(
      appClient,
      'SELECT count(*) FROM public.company_dashboard_metrics',
      '0394 sgs_app SELECT',
    );
    await assertDenied(
      appClient,
      'REFRESH MATERIALIZED VIEW public.company_dashboard_metrics',
      '0394 sgs_app REFRESH',
    );
    await assertDenied(
      publicClient,
      'SELECT count(*) FROM public.company_dashboard_metrics',
      '0394 unrelated role SELECT',
    );
    await assertDenied(
      publicClient,
      'REFRESH MATERIALIZED VIEW public.company_dashboard_metrics',
      '0394 unrelated role REFRESH',
    );

    await adminClient.query('BEGIN');
    await assertDenied(
      adminClient,
      'DROP MATERIALIZED VIEW public.company_dashboard_metrics',
      '0394 admin DROP',
    );
    await adminClient.query('ROLLBACK');
  } finally {
    await closeClient(adminClient);
    await closeClient(appClient);
    await closeClient(publicClient);
  }

  const membershipRows = await queryRows(
    executorClient,
    `
      SELECT 1
      FROM pg_auth_members AS am
      JOIN pg_roles AS granted_role ON granted_role.oid = am.roleid
      JOIN pg_roles AS member_role ON member_role.oid = am.member
      WHERE granted_role.rolname = 'sgs_admin'
        AND member_role.rolname = current_user
        AND am.set_option
    `,
  );
  assert(
    membershipRows.length === 0,
    '0394 executor gained SET-capable sgs_admin membership',
  );
}

async function main() {
  const baseUrl = process.env[BASE_URL_ENV];
  if (!baseUrl) {
    throw new Error(
      `${BASE_URL_ENV} is required for a local-only PG17 integration`,
    );
  }
  const parsedBaseUrl = new URL(baseUrl);
  assert(
    ['127.0.0.1', 'localhost', '::1'].includes(parsedBaseUrl.hostname),
    'PG17 integration refuses non-local database host',
  );

  const adminUrl = makeConnectionUrl(baseUrl, 'postgres');
  const setupClient = await connectClient(
    createClient({ connectionString: adminUrl, ssl: false }),
  );
  let executorClient;
  let databaseCreated = false;
  const databaseName = `sgs_pg17_0394_${Date.now()}_${process.pid}`;
  const executorUrl = makeConnectionUrl(baseUrl, databaseName, {
    username: EXECUTOR_ROLE,
    password: TEST_PASSWORD,
  });
  const targetAdminUrl = makeConnectionUrl(baseUrl, databaseName, {
    username: ADMIN_ROLE,
    password: TEST_PASSWORD,
  });
  const targetAppUrl = makeConnectionUrl(baseUrl, databaseName, {
    username: APP_ROLE,
    password: TEST_PASSWORD,
  });
  const targetPublicUrl = makeConnectionUrl(baseUrl, databaseName, {
    username: PUBLIC_ROLE,
    password: TEST_PASSWORD,
  });
  let operationError;

  try {
    const versionRows = await queryRows(
      setupClient,
      `SELECT current_setting('server_version_num') AS version_num`,
    );
    const postgresMajor = Math.floor(
      Number(versionRows[0]?.version_num) / 10000,
    );
    assert(
      postgresMajor === 17,
      '0392->0393->0394 integration requires PostgreSQL 17',
    );

    for (const roleName of [
      EXECUTOR_ROLE,
      APP_ROLE,
      ADMIN_ROLE,
      PUBLIC_ROLE,
      PRE_FIX_ROLE,
      'sgs_function_owner',
    ]) {
      assert(
        !(await roleExists(setupClient, roleName)),
        `fixture role already exists: ${roleName}`,
      );
    }

    await setupClient.query(
      `CREATE ROLE ${quoteIdentifier(EXECUTOR_ROLE)} LOGIN PASSWORD ${quoteLiteral(TEST_PASSWORD)} CREATEROLE BYPASSRLS NOSUPERUSER NOCREATEDB`,
    );
    await setupClient.query(
      `CREATE ROLE ${quoteIdentifier(APP_ROLE)} LOGIN PASSWORD ${quoteLiteral(TEST_PASSWORD)} NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
    await setupClient.query(
      `CREATE ROLE ${quoteIdentifier(ADMIN_ROLE)} LOGIN PASSWORD ${quoteLiteral(TEST_PASSWORD)} NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
    await setupClient.query(
      `CREATE ROLE ${quoteIdentifier(PUBLIC_ROLE)} LOGIN PASSWORD ${quoteLiteral(TEST_PASSWORD)} NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
    await setupClient.query(
      `CREATE DATABASE ${quoteIdentifier(databaseName)} OWNER ${quoteIdentifier(EXECUTOR_ROLE)}`,
    );
    databaseCreated = true;
    await closeClient(setupClient);

    executorClient = await connectClient(
      createClient({ connectionString: executorUrl, ssl: false }),
    );
    await assertExecutorIdentity(executorClient);
    await executorClient.query(
      `ALTER SCHEMA public OWNER TO ${quoteIdentifier(EXECUTOR_ROLE)}`,
    );
    await createFixtureTables(executorClient);
    await createFixtureFunctions(executorClient);
    await createFixtureMaterializedViews(executorClient);

    await assertPreFixOwnershipFailure(executorClient);

    await executorClient.query('BEGIN');
    await new HardenSecurityDefinerFunctions1709000000392().up(
      migrationRunner(executorClient),
    );
    await executorClient.query('COMMIT');

    await executorClient.query('BEGIN');
    await new TightenRuntimeFunctionGrants1709000000393().up(
      migrationRunner(executorClient),
    );
    await executorClient.query('COMMIT');
    await assert0392And0393Contract(executorClient);

    await assertRuntimeOwnedFailsClosed(executorClient, targetAppUrl);
    await assertRollback(executorUrl);

    await executorClient.query('BEGIN');
    await new HardenMaterializedViewRuntimeAccess1709000000394().up(
      migrationRunner(executorClient),
    );
    await executorClient.query('COMMIT');
    await assertMaterializedViewContract(executorClient);
    await assertRuntimeAndAdminOperations(
      targetAdminUrl,
      targetAppUrl,
      targetPublicUrl,
      executorClient,
    );

    console.log(
      JSON.stringify({
        status: 'PASS',
        postgresMajor,
        executor: 'non-superuser CREATEROLE role',
        oldOwnershipTransfer: 'SET ROLE failure reproduced',
        migrationChain: '0392 -> 0393 -> 0394',
        matviews: '2/2 owner preserved; SELECT+MAINTAIN admin-only',
        runtime: 'SELECT/MAINTAIN/REFRESH denied',
        publicRole: 'SELECT/REFRESH denied',
        adminRefresh: 'PASS',
        transactionRollback: 'PASS',
        setRoleEscalation: 'absent',
      }),
    );
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    await closeClient(executorClient, cleanupErrors);
    await closeClient(setupClient, cleanupErrors);

    if (databaseCreated) {
      const cleanupClient = await connectClient(
        createClient({ connectionString: adminUrl, ssl: false }),
      );
      try {
        await cleanupClient.query(
          `DROP DATABASE ${quoteIdentifier(databaseName)} WITH (FORCE)`,
        );
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        await closeClient(cleanupClient, cleanupErrors);
      }
    }

    const roleCleanupClient = await connectClient(
      createClient({ connectionString: adminUrl, ssl: false }),
    );
    try {
      for (const roleName of [
        'sgs_function_owner',
        EXECUTOR_ROLE,
        APP_ROLE,
        ADMIN_ROLE,
        PUBLIC_ROLE,
        PRE_FIX_ROLE,
      ]) {
        try {
          await roleCleanupClient.query(
            `DROP ROLE IF EXISTS ${quoteIdentifier(roleName)}`,
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    } finally {
      await closeClient(roleCleanupClient, cleanupErrors);
    }

    if (!operationError && cleanupErrors.length > 0) {
      throw new Error(
        `PG17 0392->0393->0394 cleanup failed: ${cleanupErrors[0].message}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(
    `PG17 0392->0393->0394 integration failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
});
