require('reflect-metadata');
const path = require('path');
const dotenv = require('dotenv');
const { DataSource } = require('typeorm');
const { MigrationExecutor } = require('typeorm/migration/MigrationExecutor');
const {
  resolveDatabaseConfig,
  resolveSslConfig,
} = require('./database-runtime.config');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function buildDataSource() {
  const databaseConfig = resolveDatabaseConfig();
  const ssl = resolveSslConfig();

  return new DataSource({
    type: 'postgres',
    url: databaseConfig.url,
    host: databaseConfig.host,
    port: databaseConfig.port,
    username: databaseConfig.username,
    password: databaseConfig.password,
    database: databaseConfig.database,
    ssl,
    synchronize: false,
    entities: ['dist/!(database|seed|queue|worker)/**/*.entity.js'],
    migrations: ['dist/database/migrations/*.js'],
  });
}

async function main() {
  const dataSource = buildDataSource();
  try {
    await dataSource.initialize();
    const executor = new MigrationExecutor(dataSource);
    const pending = await executor.getPendingMigrations();

    console.log(
      JSON.stringify(
        {
          pendingCount: pending.length,
          pending: pending.map((migration) => migration.name),
        },
        null,
        2,
      ),
    );

    if (pending.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      '[MIGRATIONS:PENDING] Failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main();
