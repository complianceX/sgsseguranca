const { Client } = require('pg');

const {
  HardenSecurityDefinerFunctions1709000000392,
} = require('../dist/infra/database/migrations/1709000000392-harden-security-definer-functions');

const BASE_URL_ENV = 'PG17_MIGRATION_TEST_URL';
const EXECUTOR_ROLE = 'migration_0392_executor';
const APP_ROLE = 'sgs_app';
const ADMIN_ROLE = 'sgs_admin';
const PRE_FIX_ROLE = 'pg17_pre_fix_owner';
const TEST_PASSWORD = 'migration-0392-pg17-test-only';
const connectedClients = new WeakSet();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function rowsOf(result) {
  return Array.isArray(result) ? result : [];
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
  // A FORCE drop can terminate an idle target connection asynchronously.
  // Consume that cleanup event so it cannot mask the migration assertion.
  client.on('error', () => {});
  return client;
}

async function connectClient(client) {
  await client.connect();
  connectedClients.add(client);
  return client;
}

async function closeClient(client, cleanupErrors) {
  if (!client || !connectedClients.has(client)) {
    return;
  }
  try {
    await client.end();
  } catch (error) {
    if (cleanupErrors) {
      cleanupErrors.push(error);
    }
  } finally {
    connectedClients.delete(client);
  }
}

function migrationRunner(client, injectedFailure) {
  return {
    query: async (sql, parameters) => {
      if (
        injectedFailure &&
        /^\s*ALTER FUNCTION public\.find_login_user/.test(sql)
      ) {
        throw new Error('injected failure after temporary privilege setup');
      }
      const result = await client.query(sql, parameters);
      return result.rows;
    },
  };
}

async function queryRows(client, sql, parameters) {
  const result = await client.query(sql, parameters);
  return result.rows;
}

async function roleExists(client, roleName) {
  const rows = await queryRows(
    client,
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS present`,
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
      SELECT current_user,
             session_user,
             rolsuper,
             rolcreaterole
      FROM pg_roles
      WHERE rolname = current_user
    `,
  );
  assert(rows.length === 1, 'PG17 executor identity row missing');
  assert(
    rows[0].current_user === EXECUTOR_ROLE &&
      rows[0].session_user === EXECUTOR_ROLE,
    'PG17 integration did not connect as the non-superuser executor',
  );
  assert(
    !booleanValue(rows[0].rolsuper),
    'PG17 executor unexpectedly is superuser',
  );
  assert(
    booleanValue(rows[0].rolcreaterole),
    'PG17 executor does not have CREATEROLE',
  );
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
  `);
}

async function assertPreFixAutomaticMembership(client) {
  const rows = await membershipRows(client, PRE_FIX_ROLE, EXECUTOR_ROLE);
  assert(rows.length === 1, 'PG17 automatic membership row missing');
  assert(
    booleanValue(rows[0].admin_option),
    'PG17 automatic ADMIN option is not true',
  );
  assert(
    !booleanValue(rows[0].inherit_option),
    'PG17 automatic INHERIT option is not false',
  );
  assert(
    !booleanValue(rows[0].set_option),
    'PG17 automatic SET option is not false',
  );
}

async function assertPreFixOwnershipFailure(client) {
  await client.query(`
    CREATE ROLE ${quoteIdentifier(PRE_FIX_ROLE)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    GRANT CREATE ON SCHEMA public TO ${quoteIdentifier(PRE_FIX_ROLE)} GRANTED BY CURRENT_USER;
    CREATE FUNCTION public.pg17_owner_transfer_probe()
    RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
  `);
  await assertPreFixAutomaticMembership(client);

  await client.query('BEGIN');
  await client.query('SAVEPOINT before_owner_transfer_probe');
  let failed = false;
  try {
    await client.query(
      `ALTER FUNCTION public.pg17_owner_transfer_probe() OWNER TO ${quoteIdentifier(PRE_FIX_ROLE)}`,
    );
  } catch (error) {
    failed = /SET ROLE|must be able to SET ROLE/i.test(String(error?.message));
  }
  await client.query('ROLLBACK TO SAVEPOINT before_owner_transfer_probe');
  await client.query('COMMIT');
  assert(failed, 'PG17 pre-fix ownership transfer did not fail at SET ROLE');

  await client.query('DROP FUNCTION public.pg17_owner_transfer_probe()');
  await client.query(
    `REVOKE CREATE ON SCHEMA public FROM ${quoteIdentifier(PRE_FIX_ROLE)}`,
  );
  await client.query(`DROP ROLE ${quoteIdentifier(PRE_FIX_ROLE)}`);
}

async function assertFailureRollback(adminUrl, executorUrl) {
  const client = createClient({ connectionString: executorUrl, ssl: false });
  await connectClient(client);
  try {
    await client.query('BEGIN');
    let failed = false;
    try {
      await new HardenSecurityDefinerFunctions1709000000392().up(
        migrationRunner(client, true),
      );
    } catch (error) {
      failed = /injected failure after temporary privilege setup/.test(
        String(error?.message),
      );
    }
    assert(failed, 'controlled rollback failure was not observed');
    await client.query('ROLLBACK');
  } finally {
    await closeClient(client);
  }

  const targetAdminUrl = makeConnectionUrl(
    adminUrl,
    new URL(executorUrl).pathname.slice(1),
  );
  const targetAdminClient = createClient({
    connectionString: targetAdminUrl,
    ssl: false,
  });
  await connectClient(targetAdminClient);
  try {
    const rows = await queryRows(
      targetAdminClient,
      `
        SELECT
          EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgs_function_owner') AS role_present,
          EXISTS (
            SELECT 1
            FROM pg_proc
            WHERE pronamespace = 'public'::regnamespace
              AND proname = 'find_login_user'
          ) AS function_present
      `,
    );
    assert(
      !booleanValue(rows[0]?.role_present),
      '0392 rollback left owner role behind',
    );
    assert(
      !booleanValue(rows[0]?.function_present),
      '0392 rollback left a hardened function behind',
    );
  } finally {
    await closeClient(targetAdminClient);
  }
}

async function assertFinalContract(client) {
  const roleRows = await queryRows(
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
          FROM pg_auth_members am
          JOIN pg_roles member_role ON member_role.oid = am.member
          JOIN pg_roles granted_role ON granted_role.oid = am.roleid
          WHERE member_role.rolname = 'sgs_app'
            AND granted_role.rolname = 'sgs_function_owner'
        ) AS app_member,
        (
          SELECT count(*)
          FROM pg_auth_members am
          JOIN pg_roles granted_role ON granted_role.oid = am.roleid
          WHERE granted_role.rolname = 'sgs_function_owner' AND am.set_option
        ) AS set_memberships,
        (
          SELECT count(*)
          FROM pg_auth_members am
          JOIN pg_roles granted_role ON granted_role.oid = am.roleid
          WHERE granted_role.rolname = 'sgs_function_owner' AND am.inherit_option
        ) AS inherit_memberships
      FROM pg_roles r
      WHERE r.rolname = 'sgs_function_owner'
    `,
  );
  const role = roleRows[0];
  assert(role, 'final function owner role is absent');
  assert(!booleanValue(role.rolcanlogin), 'function owner became LOGIN');
  assert(!booleanValue(role.rolsuper), 'function owner became SUPERUSER');
  assert(!booleanValue(role.rolcreatedb), 'function owner became CREATEDB');
  assert(!booleanValue(role.rolcreaterole), 'function owner became CREATEROLE');
  assert(!booleanValue(role.rolinherit), 'function owner became INHERIT');
  assert(booleanValue(role.rolbypassrls), 'function owner lost BYPASSRLS');
  assert(booleanValue(role.schema_usage), 'function owner lost schema USAGE');
  assert(!booleanValue(role.schema_create), 'temporary schema CREATE remains');
  assert(
    !booleanValue(role.app_member),
    'sgs_app became a function owner member',
  );
  assert(
    Number(role.set_memberships) === 0,
    'temporary SET membership remains',
  );
  assert(
    Number(role.inherit_memberships) === 0,
    'unexpected INHERIT membership remains',
  );

  const executorMembership = await membershipRows(
    client,
    'sgs_function_owner',
    EXECUTOR_ROLE,
  );
  assert(
    executorMembership.length >= 1,
    'executor membership disappeared unexpectedly',
  );
  assert(
    executorMembership.every(
      (row) =>
        !booleanValue(row.set_option) && !booleanValue(row.inherit_option),
    ),
    'executor membership retained a temporary option',
  );

  const owners = await queryRows(
    client,
    `
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE p.proowner = owner_role.oid)::int AS owned
      FROM (
        VALUES
          ('public.find_login_user(text, text)'::regprocedure),
          ('public.update_login_user_password_hash(uuid, text)'::regprocedure),
          ('public.find_user_bridge(uuid, uuid)'::regprocedure),
          ('public.reset_login_user_password(uuid, text)'::regprocedure),
          ('public.verify_signature_by_hash_public(text)'::regprocedure)
      ) expected(signature)
      LEFT JOIN pg_proc p ON p.oid = expected.signature
      CROSS JOIN (SELECT oid FROM pg_roles WHERE rolname = 'sgs_function_owner') owner_role
    `,
  );
  assert(
    Number(owners[0]?.total) === 5 && Number(owners[0]?.owned) === 5,
    'five function owners are incorrect',
  );

  const privileges = await queryRows(
    client,
    `
      SELECT
        has_function_privilege('sgs_app', 'public.find_login_user(text, text)', 'EXECUTE') AS app_execute,
        has_function_privilege('sgs_admin', 'public.find_login_user(text, text)', 'EXECUTE') AS admin_execute,
        has_function_privilege('sgs_app', 'public.gdpr_delete_user_data(uuid)', 'EXECUTE') AS app_gdpr,
        has_function_privilege('sgs_admin', 'public.gdpr_delete_user_data(uuid)', 'EXECUTE') AS admin_gdpr,
        (SELECT proacl::text FROM pg_proc WHERE oid = 'public.find_login_user(text, text)'::regprocedure) AS hardened_acl,
        EXISTS (
          SELECT 1
          FROM pg_auth_members am
          JOIN pg_roles member_role ON member_role.oid = am.member
          JOIN pg_roles granted_role ON granted_role.oid = am.roleid
          WHERE member_role.rolname = 'sgs_admin'
            AND granted_role.rolname = 'sgs_function_owner'
        ) AS admin_owner_membership
    `,
  );
  assert(
    booleanValue(privileges[0]?.app_execute),
    'sgs_app lost approved function EXECUTE',
  );
  assert(
    !booleanValue(privileges[0]?.admin_execute),
    `sgs_admin gained hardened function EXECUTE (acl=${privileges[0]?.hardened_acl ?? 'null'}, membership=${privileges[0]?.admin_owner_membership ?? 'false'})`,
  );
  assert(!booleanValue(privileges[0]?.app_gdpr), 'sgs_app gained GDPR EXECUTE');
  assert(
    booleanValue(privileges[0]?.admin_gdpr),
    'sgs_admin lost GDPR EXECUTE',
  );
}

async function main() {
  const baseUrl = process.env[BASE_URL_ENV];
  assert(baseUrl, `${BASE_URL_ENV} is required`);
  const parsedUrl = new URL(baseUrl);
  assert(
    ['127.0.0.1', 'localhost'].includes(parsedUrl.hostname),
    'PG17 integration target must be local-only',
  );

  const databaseName = `sgs_0392_pg17_${process.pid}_${Date.now()}`;
  const adminUrl = makeConnectionUrl(
    baseUrl,
    parsedUrl.pathname.slice(1) || 'postgres',
  );
  const executorUrl = makeConnectionUrl(baseUrl, databaseName, {
    username: EXECUTOR_ROLE,
    password: TEST_PASSWORD,
  });
  const adminClient = createClient({ connectionString: adminUrl, ssl: false });
  let setupClient = createClient({
    connectionString: adminUrl,
    ssl: false,
  });
  let dbAdminClient = null;
  let executorClient = null;
  let databaseCreated = false;
  let executorRoleCreated = false;
  let appRoleCreated = false;
  let adminRoleCreated = false;
  let preFixRoleCreated = false;
  let functionOwnerRoleCreated = false;

  let operationError = null;
  try {
    await connectClient(adminClient);
    await connectClient(setupClient);

    const versionRows = await queryRows(
      adminClient,
      `SELECT current_setting('server_version_num') AS version_num`,
    );
    const postgresMajor = Math.floor(
      Number(versionRows[0]?.version_num) / 10000,
    );
    assert(postgresMajor === 17, 'PG17 integration requires PostgreSQL 17');

    if (!(await roleExists(setupClient, EXECUTOR_ROLE))) {
      await setupClient.query(
        `CREATE ROLE ${quoteIdentifier(EXECUTOR_ROLE)} LOGIN PASSWORD ${quoteLiteral(TEST_PASSWORD)} CREATEROLE BYPASSRLS NOSUPERUSER NOCREATEDB`,
      );
      executorRoleCreated = true;
    }
    if (!(await roleExists(setupClient, APP_ROLE))) {
      await setupClient.query(
        `CREATE ROLE ${quoteIdentifier(APP_ROLE)} NOLOGIN NOSUPERUSER`,
      );
      appRoleCreated = true;
    }
    if (!(await roleExists(setupClient, ADMIN_ROLE))) {
      await setupClient.query(
        `CREATE ROLE ${quoteIdentifier(ADMIN_ROLE)} NOLOGIN NOSUPERUSER`,
      );
      adminRoleCreated = true;
    }
    assert(
      !(await roleExists(setupClient, PRE_FIX_ROLE)),
      'PG17 pre-fix probe role already exists',
    );
    assert(
      !(await roleExists(setupClient, 'sgs_function_owner')),
      '0392 owner role must be absent for a pristine integration fixture',
    );

    await setupClient.query(
      `CREATE DATABASE ${quoteIdentifier(databaseName)} OWNER ${quoteIdentifier(EXECUTOR_ROLE)}`,
    );
    databaseCreated = true;
    await closeClient(setupClient);
    setupClient = null;

    dbAdminClient = createClient({
      connectionString: executorUrl,
      ssl: false,
    });
    await connectClient(dbAdminClient);
    await dbAdminClient.query(
      `ALTER SCHEMA public OWNER TO ${quoteIdentifier(EXECUTOR_ROLE)}`,
    );
    await closeClient(dbAdminClient);
    dbAdminClient = null;

    executorClient = createClient({
      connectionString: executorUrl,
      ssl: false,
    });
    await connectClient(executorClient);
    await assertExecutorIdentity(executorClient);
    await createFixtureTables(executorClient);
    await createFixtureFunctions(executorClient);
    preFixRoleCreated = true;
    await assertPreFixOwnershipFailure(executorClient);
    await assertFailureRollback(adminUrl, executorUrl);

    await executorClient.query('BEGIN');
    await new HardenSecurityDefinerFunctions1709000000392().up(
      migrationRunner(executorClient, false),
    );
    await executorClient.query('COMMIT');
    functionOwnerRoleCreated = true;
    await assertFinalContract(executorClient);
    await closeClient(executorClient);
    executorClient = null;

    console.log(
      JSON.stringify({
        status: 'PASS',
        postgresMajor,
        executor: 'non-superuser CREATEROLE role',
        automaticMembership: 'ADMIN TRUE / INHERIT FALSE / SET FALSE',
        preFixOwnershipTransfer: 'FAIL at SET ROLE as expected',
        fixedMigration: 'PASS',
        rollbackCleanup: 'PASS',
        finalOwnerContract: 'PASS',
        functionCount: 5,
      }),
    );
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    await closeClient(executorClient, cleanupErrors);
    await closeClient(dbAdminClient, cleanupErrors);
    await closeClient(setupClient, cleanupErrors);

    if (databaseCreated) {
      const cleanupClient = createClient({
        connectionString: adminUrl,
        ssl: false,
      });
      try {
        await connectClient(cleanupClient);
        await cleanupClient.query(
          `DROP DATABASE ${quoteIdentifier(databaseName)} WITH (FORCE)`,
        );
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        await closeClient(cleanupClient, cleanupErrors);
      }
    }

    if (connectedClients.has(adminClient)) {
      for (const roleName of [
        executorRoleCreated ? EXECUTOR_ROLE : null,
        appRoleCreated ? APP_ROLE : null,
        adminRoleCreated ? ADMIN_ROLE : null,
        preFixRoleCreated ? PRE_FIX_ROLE : null,
        functionOwnerRoleCreated ? 'sgs_function_owner' : null,
      ]) {
        if (!roleName) {
          continue;
        }
        try {
          await adminClient.query(
            `DROP ROLE IF EXISTS ${quoteIdentifier(roleName)}`,
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }
    await closeClient(adminClient, cleanupErrors);

    if (!operationError && cleanupErrors.length > 0) {
      throw new Error(
        `PG17 migration integration cleanup failed: ${cleanupErrors[0].message}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(
    `PG17 migration integration failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
});
