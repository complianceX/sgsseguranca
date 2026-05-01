const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require('pg');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_SQL =
  process.argv[2] ||
  path.resolve(
    PROJECT_ROOT,
    'temp/supabase-migration/full_public_r10.supabase.sql',
  );
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL nao definido.');
  process.exit(1);
}

if (!fs.existsSync(SOURCE_SQL)) {
  console.error(`Arquivo de backup nao encontrado: ${SOURCE_SQL}`);
  process.exit(1);
}

const TABLES = ['profiles', 'companies', 'sites', 'users'];
const STAGE_TABLES = {
  profiles: 'stage_profiles',
  companies: 'stage_companies',
  sites: 'stage_sites',
  users: 'stage_users',
};

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

async function createLocalSnapshot(client, reportDir, stamp) {
  const safeStamp = String(stamp).replace(/[^0-9_]/g, '');
  const snapshotPath = `${reportDir}${path.sep}restore-snapshot-${safeStamp}.json`;
  const snapshot = {
    generatedAtUtc: new Date().toISOString(),
    tables: {},
  };

  for (const table of TABLES) {
    const { rows } = await client.query(`SELECT * FROM public.${table}`);
    snapshot.tables[table] = rows;
  }

  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
  return snapshotPath;
}

async function createTempStage(client) {
  await client.query('DROP TABLE IF EXISTS stage_users');
  await client.query('DROP TABLE IF EXISTS stage_sites');
  await client.query('DROP TABLE IF EXISTS stage_companies');
  await client.query('DROP TABLE IF EXISTS stage_profiles');

  await client.query(
    'CREATE TEMP TABLE stage_profiles AS TABLE public.profiles WITH NO DATA',
  );
  await client.query(
    'CREATE TEMP TABLE stage_companies AS TABLE public.companies WITH NO DATA',
  );
  await client.query(
    'CREATE TEMP TABLE stage_sites AS TABLE public.sites WITH NO DATA',
  );
  await client.query(
    'CREATE TEMP TABLE stage_users AS TABLE public.users WITH NO DATA',
  );
}

async function extractIntoStage(client, sourceSqlPath) {
  const starts = Object.fromEntries(
    TABLES.map((t) => [t, `INSERT INTO public.${t} VALUES`]),
  );
  const counters = Object.fromEntries(TABLES.map((t) => [t, 0]));

  const stream = fs.createReadStream(sourceSqlPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let activeTable = null;
  let buffer = '';

  for await (const line of rl) {
    if (!activeTable) {
      for (const table of TABLES) {
        if (line.startsWith(starts[table])) {
          activeTable = table;
          buffer = `${line}\n`;
          break;
        }
      }
      continue;
    }

    buffer += `${line}\n`;

    if (line.trim().endsWith(';')) {
      const stmt = buffer.replace(
        starts[activeTable],
        `INSERT INTO ${STAGE_TABLES[activeTable]} VALUES`,
      );
      await client.query(stmt);
      counters[activeTable] += 1;
      activeTable = null;
      buffer = '';
    }
  }

  return counters;
}

async function getPublicCounts(client) {
  const q = `
    SELECT
      (SELECT COUNT(*)::bigint FROM public.users) AS users,
      (SELECT COUNT(*)::bigint FROM public.companies) AS companies,
      (SELECT COUNT(*)::bigint FROM public.profiles) AS profiles,
      (SELECT COUNT(*)::bigint FROM public.sites) AS sites;
  `;
  const { rows } = await client.query(q);
  return rows[0];
}

async function getStageCounts(client) {
  const q = `
    SELECT
      (SELECT COUNT(*)::bigint FROM stage_users) AS users,
      (SELECT COUNT(*)::bigint FROM stage_companies) AS companies,
      (SELECT COUNT(*)::bigint FROM stage_profiles) AS profiles,
      (SELECT COUNT(*)::bigint FROM stage_sites) AS sites;
  `;
  const { rows } = await client.query(q);
  return rows[0];
}

async function getDiffCounts(client) {
  const q = `
    WITH users_missing AS (
      SELECT s.*
      FROM stage_users s
      WHERE NOT (
        (s.cpf IS NOT NULL AND EXISTS (SELECT 1 FROM public.users t WHERE t.cpf = s.cpf))
        OR (s.cpf IS NULL AND s.email IS NOT NULL AND EXISTS (SELECT 1 FROM public.users t WHERE t.email = s.email))
        OR (s.cpf IS NULL AND s.email IS NULL AND EXISTS (SELECT 1 FROM public.users t WHERE t.id = s.id))
      )
    )
    SELECT
      (SELECT COUNT(*)::bigint FROM stage_companies s WHERE NOT EXISTS (SELECT 1 FROM public.companies t WHERE t.cnpj = s.cnpj)) AS companies_missing,
      (SELECT COUNT(*)::bigint FROM users_missing) AS users_missing,
      (SELECT COUNT(*)::bigint
       FROM stage_profiles p
       WHERE p.id IN (SELECT DISTINCT u.profile_id FROM users_missing u WHERE u.profile_id IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.profiles t WHERE t.id = p.id)
      ) AS profiles_missing,
      (SELECT COUNT(*)::bigint
       FROM stage_sites s
       WHERE s.id IN (SELECT DISTINCT u.site_id FROM users_missing u WHERE u.site_id IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.sites t WHERE t.id = s.id)
      ) AS sites_missing;
  `;
  const { rows } = await client.query(q);
  return rows[0];
}

async function applyRestore(client) {
  await client.query('BEGIN');
  try {
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await client.query(`SET LOCAL app.is_super_admin = 'true'`);
    await client.query(
      'LOCK TABLE public.profiles, public.companies, public.sites, public.users IN SHARE ROW EXCLUSIVE MODE',
    );

    const insertedProfiles = await client.query(`
      WITH users_missing AS (
        SELECT s.*
        FROM stage_users s
        WHERE NOT (
          (s.cpf IS NOT NULL AND EXISTS (SELECT 1 FROM public.users t WHERE t.cpf = s.cpf))
          OR (s.cpf IS NULL AND s.email IS NOT NULL AND EXISTS (SELECT 1 FROM public.users t WHERE t.email = s.email))
          OR (s.cpf IS NULL AND s.email IS NULL AND EXISTS (SELECT 1 FROM public.users t WHERE t.id = s.id))
        )
      )
      INSERT INTO public.profiles
      SELECT p.*
      FROM stage_profiles p
      WHERE p.id IN (SELECT DISTINCT u.profile_id FROM users_missing u WHERE u.profile_id IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM public.profiles t WHERE t.id = p.id)
      ON CONFLICT DO NOTHING
      RETURNING id;
    `);

    const insertedCompanies = await client.query(`
      INSERT INTO public.companies
      SELECT c.*
      FROM stage_companies c
      WHERE NOT EXISTS (SELECT 1 FROM public.companies t WHERE t.cnpj = c.cnpj)
      ON CONFLICT (cnpj) DO NOTHING
      RETURNING id;
    `);

    const insertedSites = await client.query(`
      WITH users_missing AS (
        SELECT s.*
        FROM stage_users s
        WHERE NOT (
          (s.cpf IS NOT NULL AND EXISTS (SELECT 1 FROM public.users t WHERE t.cpf = s.cpf))
          OR (s.cpf IS NULL AND s.email IS NOT NULL AND EXISTS (SELECT 1 FROM public.users t WHERE t.email = s.email))
          OR (s.cpf IS NULL AND s.email IS NULL AND EXISTS (SELECT 1 FROM public.users t WHERE t.id = s.id))
        )
      )
      INSERT INTO public.sites
      SELECT st.*
      FROM stage_sites st
      WHERE st.id IN (SELECT DISTINCT u.site_id FROM users_missing u WHERE u.site_id IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM public.sites t WHERE t.id = st.id)
      ON CONFLICT DO NOTHING
      RETURNING id;
    `);

    const insertedUsers = await client.query(`
      WITH users_missing AS (
        SELECT s.*
        FROM stage_users s
        WHERE NOT (
          (s.cpf IS NOT NULL AND EXISTS (SELECT 1 FROM public.users t WHERE t.cpf = s.cpf))
          OR (s.cpf IS NULL AND s.email IS NOT NULL AND EXISTS (SELECT 1 FROM public.users t WHERE t.email = s.email))
          OR (s.cpf IS NULL AND s.email IS NULL AND EXISTS (SELECT 1 FROM public.users t WHERE t.id = s.id))
        )
      )
      INSERT INTO public.users
      SELECT u.*
      FROM users_missing u
      WHERE EXISTS (SELECT 1 FROM public.companies c WHERE c.id = u.company_id)
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.profile_id)
        AND (u.site_id IS NULL OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = u.site_id))
      ON CONFLICT DO NOTHING
      RETURNING id, cpf, email, company_id;
    `);

    await client.query('COMMIT');

    return {
      insertedProfiles: insertedProfiles.rowCount,
      insertedCompanies: insertedCompanies.rowCount,
      insertedSites: insertedSites.rowCount,
      insertedUsers: insertedUsers.rowCount,
      restoredUsersSample: insertedUsers.rows.slice(0, 30),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function getDupes(client) {
  const q = `
    SELECT
      (SELECT COUNT(*)::bigint FROM (SELECT cpf FROM public.users WHERE cpf IS NOT NULL GROUP BY cpf HAVING COUNT(*) > 1) d) AS users_cpf_dupes,
      (SELECT COUNT(*)::bigint FROM (SELECT email FROM public.users WHERE email IS NOT NULL GROUP BY email HAVING COUNT(*) > 1) d) AS users_email_dupes,
      (SELECT COUNT(*)::bigint FROM (SELECT cnpj FROM public.companies WHERE cnpj IS NOT NULL GROUP BY cnpj HAVING COUNT(*) > 1) d) AS companies_cnpj_dupes,
      (SELECT COUNT(*)::bigint FROM public.users WHERE password IS NOT NULL) AS users_with_password;
  `;
  const { rows } = await client.query(q);
  return rows[0];
}

async function main() {
  const stamp = nowStamp();
  const reportDir = path.resolve(PROJECT_ROOT, 'temp/supabase-migration');
  const reportPath = path.resolve(reportDir, `restore-report-${stamp}.json`);
  fs.mkdirSync(reportDir, { recursive: true });

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: true },
  });

  await client.connect();

  try {
    await client.query(`SET app.is_super_admin = 'true'`);
    const healthCheck = await client.query(
      'SELECT current_database() AS db, now() AS now',
    );
    const snapshotFile = await createLocalSnapshot(client, reportDir, stamp);

    await createTempStage(client);
    const statementsLoaded = await extractIntoStage(client, SOURCE_SQL);

    const beforeCounts = await getPublicCounts(client);
    const stageCounts = await getStageCounts(client);
    const diffCounts = await getDiffCounts(client);

    const applyResult = await applyRestore(client);

    const afterCounts = await getPublicCounts(client);
    const dupes = await getDupes(client);

    const report = {
      executedAtUtc: new Date().toISOString(),
      sourceSql: SOURCE_SQL,
      snapshotFile,
      connection: healthCheck.rows[0],
      statementsLoaded,
      stageCounts,
      beforeCounts,
      diffCounts,
      applyResult,
      afterCounts,
      dupes,
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
    console.error(`REPORT_PATH=${reportPath}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('RESTORE_ERROR', err && err.stack ? err.stack : err);
  process.exit(1);
});
