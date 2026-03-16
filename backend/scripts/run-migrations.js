require('reflect-metadata');
const { DataSource } = require('typeorm');
const {
  resolveDatabaseConfig,
  resolveSslConfig,
} = require('./database-runtime.config');

function buildDataSource() {
  const databaseConfig = resolveDatabaseConfig();

  if (databaseConfig.url) {
    console.log(
      `[MIGRATIONS] Using database URL from environment (${databaseConfig.target}).`,
    );
    return new DataSource({
      type: 'postgres',
      url: databaseConfig.url,
      ssl: resolveSslConfig(),
      synchronize: false,
      entities: ['dist/!(database|seed|queue|worker)/**/*.entity.js'],
      migrations: ['dist/database/migrations/*.js'],
    });
  }

  console.log(
    `[MIGRATIONS] Using host credentials (${databaseConfig.target}).`,
  );
  return new DataSource({
    type: 'postgres',
    host: databaseConfig.host,
    port: databaseConfig.port,
    username: databaseConfig.username,
    password: databaseConfig.password,
    database: databaseConfig.database,
    ssl: resolveSslConfig(),
    synchronize: false,
    entities: ['dist/!(database|seed|queue|worker)/**/*.entity.js'],
    migrations: ['dist/database/migrations/*.js'],
  });
}

async function main() {
  const dataSource = buildDataSource();
  try {
    await dataSource.initialize();
    const hasPending = await dataSource.showMigrations();
    if (!hasPending) {
      console.log('[MIGRATIONS] No pending migrations.');
      return;
    }
    console.log('[MIGRATIONS] Applying pending migrations...');
    const applied = await dataSource.runMigrations({ transaction: 'all' });
    console.log(`[MIGRATIONS] Applied ${applied.length} migration(s).`);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main().catch((err) => {
  console.error('[MIGRATIONS] Failed:', err.message || err);
  process.exit(1);
});
