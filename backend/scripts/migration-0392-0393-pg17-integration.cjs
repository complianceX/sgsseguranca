const { Client } = require('pg');

const {
  HardenSecurityDefinerFunctions1709000000392,
} = require('../dist/infra/database/migrations/1709000000392-harden-security-definer-functions');
const {
  TightenRuntimeFunctionGrants1709000000393,
  HARDENED_SECURITY_DEFINER_FUNCTION_IDENTITIES,
} = require('../dist/infra/database/migrations/1709000000393-tighten-runtime-function-grants');

const BASE_URL_ENV = 'PG17_MIGRATION_TEST_URL';
const EXECUTOR_ROLE = 'migration_0393_executor';
const APP_ROLE = 'sgs_app';
const ADMIN_ROLE = 'sgs_admin';
const UNMANAGEABLE_ROLE = 'pg17_0393_unmanageable_owner';
const TEST_PASSWORD = 'migration-0393-pg17-test-only';
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

async function closeClient(client, cleanupErrors) {
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
  let revokeCount = 0;
  return {
    query: async (sql, parameters) => {
      const result = await client.query(sql, parameters);
      if (
        options.failAfterFirstRevoke &&
        /^\s*REVOKE EXECUTE ON FUNCTION/.test(sql)
      ) {
        revokeCount += 1;
        if (revokeCount === 1) {
          throw new Error('injected 0393 failure after first revoke');
        }
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
    CREATE OR REPLACE FUNCTION public.runtime_owner_aware_excess_probe()
    RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
  `);
}

async function functionState(client, identity) {
  const rows = await queryRows(
    client,
    `
      SELECT
        p.oid::regprocedure::text AS identity,
        owner_role.rolname AS owner,
        p.prosecdef,
        EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
          JOIN pg_roles grantee ON grantee.oid = acl.grantee
          WHERE grantee.rolname = 'sgs_app'
            AND acl.privilege_type = 'EXECUTE'
        ) AS direct_execute,
        EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
          WHERE acl.grantee = 0
            AND acl.privilege_type = 'EXECUTE'
        ) AS public_execute
      FROM pg_proc p
      JOIN pg_roles owner_role ON owner_role.oid = p.proowner
      WHERE p.oid = $1::regprocedure::oid
    `,
    [identity],
  );
  assert(rows.length === 1, `function fixture is absent: ${identity}`);
  return rows[0];
}

async function assertHardenedContract(client) {
  for (const identity of HARDENED_SECURITY_DEFINER_FUNCTION_IDENTITIES) {
    const state = await functionState(client, identity);
    assert(state.owner === 'sgs_function_owner', `${identity} owner changed`);
    assert(booleanValue(state.prosecdef), `${identity} lost SECURITY DEFINER`);
    assert(booleanValue(state.direct_execute), `${identity} lost app EXECUTE`);
    assert(
      !booleanValue(state.public_execute),
      `${identity} retained PUBLIC EXECUTE`,
    );
  }

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
        has_schema_privilege('sgs_function_owner', 'public', 'CREATE') AS schema_create,
        (
          SELECT count(*)
          FROM pg_auth_members am
          JOIN pg_roles granted ON granted.oid = am.roleid
          WHERE granted.rolname = 'sgs_function_owner' AND am.set_option
        ) AS set_memberships,
        (
          SELECT count(*)
          FROM pg_auth_members am
          JOIN pg_roles granted ON granted.oid = am.roleid
          WHERE granted.rolname = 'sgs_function_owner' AND am.inherit_option
        ) AS inherit_memberships,
        EXISTS (
          SELECT 1
          FROM pg_auth_members am
          JOIN pg_roles member ON member.oid = am.member
          JOIN pg_roles granted ON granted.oid = am.roleid
          WHERE member.rolname = 'sgs_app'
            AND granted.rolname = 'sgs_function_owner'
        ) AS app_member
      FROM pg_roles r
      WHERE r.rolname = 'sgs_function_owner'
    `,
  );
  const role = roleRows[0];
  assert(role, 'function owner role is absent');
  assert(!booleanValue(role.rolcanlogin), 'function owner became LOGIN');
  assert(!booleanValue(role.rolsuper), 'function owner became SUPERUSER');
  assert(!booleanValue(role.rolcreatedb), 'function owner became CREATEDB');
  assert(!booleanValue(role.rolcreaterole), 'function owner became CREATEROLE');
  assert(!booleanValue(role.rolinherit), 'function owner became INHERIT');
  assert(booleanValue(role.rolbypassrls), 'function owner lost BYPASSRLS');
  assert(!booleanValue(role.schema_create), 'temporary schema CREATE remains');
  assert(
    Number(role.set_memberships) === 0,
    'temporary SET membership remains',
  );
  assert(
    Number(role.inherit_memberships) === 0,
    'unexpected INHERIT membership remains',
  );
  assert(!booleanValue(role.app_member), 'sgs_app became owner-role member');
}

async function assertLegacy0393Fails(client) {
  await client.query('BEGIN');
  let failed = false;
  try {
    await client.query(
      'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM sgs_app',
    );
  } catch (error) {
    failed = /permission denied|must be owner/i.test(String(error?.message));
  }
  await client.query('ROLLBACK');
  assert(
    failed,
    'old blanket 0393 behavior did not reproduce the ownership failure',
  );
}

async function assertRollback(client) {
  await client.query(`
    CREATE OR REPLACE FUNCTION public.runtime_owner_aware_rollback_probe()
    RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
    GRANT EXECUTE ON FUNCTION public.runtime_owner_aware_rollback_probe() TO sgs_app;
  `);

  await client.query('BEGIN');
  let failed = false;
  try {
    await new TightenRuntimeFunctionGrants1709000000393().up(
      migrationRunner(client, { failAfterFirstRevoke: true }),
    );
  } catch (error) {
    failed = /injected 0393 failure/.test(String(error?.message));
  }
  await client.query('ROLLBACK');
  assert(failed, '0393 injected rollback failure was not observed');
  const state = await functionState(
    client,
    'public.runtime_owner_aware_rollback_probe()',
  );
  assert(
    booleanValue(state.direct_execute),
    '0393 rollback did not restore the ACL',
  );
}

async function createUnmanageableFixture(client) {
  await client.query(`
    CREATE ROLE ${quoteIdentifier(UNMANAGEABLE_ROLE)}
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    GRANT CREATE ON SCHEMA public TO ${quoteIdentifier(UNMANAGEABLE_ROLE)};
    GRANT ${quoteIdentifier(UNMANAGEABLE_ROLE)} TO CURRENT_USER
      WITH SET TRUE, INHERIT FALSE;
    SET ROLE ${quoteIdentifier(UNMANAGEABLE_ROLE)};
    CREATE FUNCTION public.runtime_owner_aware_unmanageable_probe()
      RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
    GRANT EXECUTE ON FUNCTION public.runtime_owner_aware_unmanageable_probe()
      TO sgs_app;
    RESET ROLE;
    REVOKE ${quoteIdentifier(UNMANAGEABLE_ROLE)} FROM CURRENT_USER;
    REVOKE CREATE ON SCHEMA public FROM ${quoteIdentifier(UNMANAGEABLE_ROLE)};
  `);
}

async function assertFailClosed(client) {
  await client.query('BEGIN');
  let failed = false;
  try {
    await new TightenRuntimeFunctionGrants1709000000393().up(
      migrationRunner(client),
    );
  } catch (error) {
    failed = /cannot administer excess EXECUTE/i.test(String(error?.message));
  }
  await client.query('ROLLBACK');
  assert(failed, '0393 did not fail closed for an unmanaged owner');
  const state = await functionState(
    client,
    'public.runtime_owner_aware_unmanageable_probe()',
  );
  assert(
    booleanValue(state.direct_execute),
    'fail-closed transaction changed the ACL',
  );
}

async function main() {
  const baseUrl = process.env[BASE_URL_ENV];
  assert(baseUrl, `${BASE_URL_ENV} is required`);
  const parsedUrl = new URL(baseUrl);
  assert(
    ['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname),
    'PG17 integration target must be local-only',
  );

  const databaseName = `sgs_0393_pg17_${process.pid}_${Date.now()}`;
  const adminUrl = makeConnectionUrl(
    baseUrl,
    parsedUrl.pathname.slice(1) || 'postgres',
  );
  const executorUrl = makeConnectionUrl(baseUrl, databaseName, {
    username: EXECUTOR_ROLE,
    password: TEST_PASSWORD,
  });
  const adminClient = createClient({ connectionString: adminUrl, ssl: false });
  let setupClient = createClient({ connectionString: adminUrl, ssl: false });
  let executorClient = null;
  let databaseCreated = false;
  let executorRoleCreated = false;
  let appRoleCreated = false;
  let adminRoleCreated = false;
  let ownerRoleCreated = false;
  let unmanageableRoleCreated = false;
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
    assert(
      !(await roleExists(setupClient, EXECUTOR_ROLE)),
      'executor fixture role already exists',
    );
    assert(
      !(await roleExists(setupClient, UNMANAGEABLE_ROLE)),
      'unmanageable fixture role already exists',
    );
    assert(
      !(await roleExists(setupClient, 'sgs_function_owner')),
      '0392 owner role already exists',
    );

    await setupClient.query(
      `CREATE ROLE ${quoteIdentifier(EXECUTOR_ROLE)} LOGIN PASSWORD ${quoteLiteral(TEST_PASSWORD)} CREATEROLE BYPASSRLS NOSUPERUSER NOCREATEDB`,
    );
    executorRoleCreated = true;
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
    await setupClient.query(
      `CREATE DATABASE ${quoteIdentifier(databaseName)} OWNER ${quoteIdentifier(EXECUTOR_ROLE)}`,
    );
    databaseCreated = true;
    await closeClient(setupClient, []);
    setupClient = null;

    executorClient = createClient({
      connectionString: executorUrl,
      ssl: false,
    });
    await connectClient(executorClient);
    const identity = await queryRows(
      executorClient,
      `SELECT current_user, session_user, rolsuper, rolcreaterole FROM pg_roles WHERE rolname=current_user`,
    );
    assert(identity.length === 1, 'executor identity missing');
    assert(
      identity[0].current_user === EXECUTOR_ROLE,
      'executor role mismatch',
    );
    assert(identity[0].session_user === EXECUTOR_ROLE, 'session role mismatch');
    assert(
      !booleanValue(identity[0].rolsuper),
      'executor unexpectedly superuser',
    );
    assert(
      booleanValue(identity[0].rolcreaterole),
      'executor lacks CREATEROLE',
    );

    await executorClient.query(
      `ALTER SCHEMA public OWNER TO ${quoteIdentifier(EXECUTOR_ROLE)}`,
    );
    await createFixtureTables(executorClient);
    await createFixtureFunctions(executorClient);

    ownerRoleCreated = true;
    await executorClient.query('BEGIN');
    await new HardenSecurityDefinerFunctions1709000000392().up(
      migrationRunner(executorClient),
    );
    await executorClient.query('COMMIT');
    await assertLegacy0393Fails(executorClient);

    await executorClient.query('BEGIN');
    await new TightenRuntimeFunctionGrants1709000000393().up(
      migrationRunner(executorClient),
    );
    await executorClient.query('COMMIT');
    await assertHardenedContract(executorClient);
    const allowlisted = await functionState(
      executorClient,
      'public.current_company()',
    );
    const excess = await functionState(
      executorClient,
      'public.runtime_owner_aware_excess_probe()',
    );
    assert(
      booleanValue(allowlisted.direct_execute),
      'allowlisted function lost EXECUTE',
    );
    assert(
      !booleanValue(excess.direct_execute),
      'excess direct EXECUTE was not removed',
    );
    await assertRollback(executorClient);
    unmanageableRoleCreated = true;
    await createUnmanageableFixture(executorClient);
    await assertFailClosed(executorClient);

    console.log(
      JSON.stringify({
        status: 'PASS',
        postgresMajor,
        executor: 'non-superuser CREATEROLE role',
        canonicalAllowlistCount: 14,
        hardenedFunctions: '5/5 preserved',
        legacy0393Failure: 'reproduced',
        mixedOwner: 'PASS',
        excessDirectExecute: 'removed',
        transactionRollback: 'PASS',
        unmanagedOwnerFailClosed: 'PASS',
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
        unmanageableRoleCreated ? UNMANAGEABLE_ROLE : null,
        ownerRoleCreated ? 'sgs_function_owner' : null,
        executorRoleCreated ? EXECUTOR_ROLE : null,
        appRoleCreated ? APP_ROLE : null,
        adminRoleCreated ? ADMIN_ROLE : null,
      ]) {
        if (!roleName) continue;
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
        `PG17 0392->0393 cleanup failed: ${cleanupErrors[0].message}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(
    `PG17 0392->0393 integration failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
});
