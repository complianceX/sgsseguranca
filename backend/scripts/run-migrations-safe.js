require('reflect-metadata');
require('dotenv').config();
const { DataSource } = require('typeorm');
const {
  resolveDatabaseConfig,
  resolveSslConfig,
} = require('./database-runtime.config');

function buildDataSource() {
  const databaseConfig = resolveDatabaseConfig();

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
    entities: ['src/**/*.entity.ts', 'dist/**/*.entity.js'],
    migrations: [
      'src/database/migrations/*.ts',
      'dist/database/migrations/*.js',
    ],
  });
}

async function main() {
  const dataSource = buildDataSource();

  try {
    await dataSource.initialize();
    const hasPending = await dataSource.showMigrations();

    if (!hasPending) {
      console.log('[MIGRATIONS] No pending migrations. Nothing to apply.');
      return;
    }

    console.log('[MIGRATIONS] Pending migrations found. Applying...');
    const applied = await dataSource.runMigrations({ transaction: 'all' });
    console.log(`[MIGRATIONS] Applied ${applied.length} migration(s).`);
  } catch (error) {
    console.error(
      '[MIGRATIONS] Failed to apply migrations:',
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
