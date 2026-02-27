require('reflect-metadata');
const { DataSource } = require('typeorm');

function buildDataSource() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    process.env.URL_DO_BANCO_DE_DADOS;

  const host = process.env.DATABASE_HOST || process.env.PGHOST;
  const port = Number(process.env.DATABASE_PORT || process.env.PGPORT || 5432);
  const username = process.env.DATABASE_USER || process.env.PGUSER;
  const password = process.env.DATABASE_PASSWORD || process.env.PGPASSWORD;
  const database = process.env.DATABASE_NAME || process.env.PGDATABASE;

  if (!databaseUrl && (!host || !username || !database)) {
    throw new Error(
      'Database config missing. Set DATABASE_URL/URL_DO_BANCO_DE_DADOS or DATABASE_HOST/PORT/USER/PASSWORD/NAME.',
    );
  }

  return new DataSource({
    type: 'postgres',
    url: databaseUrl,
    host,
    port,
    username,
    password,
    database,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    synchronize: false,
    entities: ['src/**/*.entity.ts', 'dist/**/*.entity.js'],
    migrations: [
      'src/database/migrations/*.ts',
      'dist/src/database/migrations/*.js',
    ],
  });
}

async function main() {
  const dataSource = buildDataSource();

  try {
    await dataSource.initialize();
    const hasPending = await dataSource.showMigrations();

    if (hasPending) {
      console.error('[MIGRATIONS] Pending migrations detected.');
      process.exit(1);
    }

    console.log('[MIGRATIONS] No pending migrations.');
  } catch (error) {
    console.error(
      '[MIGRATIONS] Failed to verify pending migrations:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main();
