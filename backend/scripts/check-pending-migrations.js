require('reflect-metadata');
const path = require('path');
const { DataSource } = require('typeorm');
const {
  resolveDatabaseConfig,
  resolveSslConfig,
} = require('./database-runtime.config');

function buildDataSource() {
  const databaseConfig = resolveDatabaseConfig();
  const distEntitiesGlob = path.resolve(
    __dirname,
    '..',
    'dist',
    '**',
    '*.entity.js',
  );
  const distMigrationsGlob = path.resolve(
    __dirname,
    '..',
    'dist',
    'database',
    'migrations',
    '*.js',
  );

  return new DataSource({
    type: 'postgres',
    url: databaseConfig.url,
    host: databaseConfig.host,
    port: databaseConfig.port,
    username: databaseConfig.username,
    password: databaseConfig.password,
    database: databaseConfig.database,
    ssl: resolveSslConfig(),
    synchronize: false,
    entities: [distEntitiesGlob],
    migrations: [distMigrationsGlob],
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
