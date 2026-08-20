const { Client } = require('/app/node_modules/pg');

const REQUIRED_PROFILES = [
  'Administrador da Empresa',
  'Técnico de Segurança do Trabalho (TST)',
  'Supervisor / Encarregado',
  'Operador / Colaborador',
];

function assertLoadtestEnvironment(env = process.env) {
  if (env.APP_ENV !== 'loadtest' || env.APP_LOADTEST_MARKER !== 'sgs-loadtest') {
    throw new Error('load-test marker is missing');
  }
  if (env.DATABASE_NAME !== 'sgs_loadtest') {
    throw new Error('database name is not sgs_loadtest');
  }
  if (!String(env.DATABASE_MIGRATION_URL || '').includes('postgres-loadtest')) {
    throw new Error('migration host is not loadtest');
  }
}

async function main() {
  assertLoadtestEnvironment();
  const client = new Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const profileName of REQUIRED_PROFILES) {
      await client.query(
        `INSERT INTO profiles (nome, permissoes, status)
         SELECT $1::varchar, '{}'::jsonb, true
         WHERE NOT EXISTS (
           SELECT 1 FROM profiles WHERE nome = $1::varchar AND status = true
         )`,
        [profileName],
      );
    }
    await client.query('COMMIT');
    console.log(`[loadtest-profiles] OK ensured=${REQUIRED_PROFILES.length} synthetic profiles`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[loadtest-profiles] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = { REQUIRED_PROFILES, assertLoadtestEnvironment };
