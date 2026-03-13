require('reflect-metadata');
const { DataSource } = require('typeorm');


function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function resolveSslConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const hasDatabaseUrl = !!firstNonEmpty(
    process.env.DATABASE_URL,
    process.env.DATABASE_PUBLIC_URL,
    process.env.URL_DO_BANCO_DE_DADOS,
  );
  const railwaySelfSigned = process.env.BANCO_DE_DADOS_SSL === 'true';
  const sslEnabled = process.env.DATABASE_SSL === 'true';
  const sslCA = process.env.DATABASE_SSL_CA;

  if (!isProduction) {
    return sslEnabled ? { rejectUnauthorized: false } : false;
  }

  if (railwaySelfSigned) {
    return { rejectUnauthorized: false };
  }

  if (hasDatabaseUrl && !sslCA) {
    return { rejectUnauthorized: false };
  }

  if (!sslEnabled) {
    return false;
  }

  if (sslCA) {
    return { rejectUnauthorized: true, ca: sslCA };
  }

  return { rejectUnauthorized: true };
}

function describeDatabaseTarget(url) {
  if (!url) {
    return 'target=unknown';
  }

  try {
    const parsed = new URL(url);
    const databaseName = parsed.pathname.replace(/^\//, '') || '(default)';
    return `host=${parsed.hostname} port=${parsed.port || '5432'} db=${databaseName}`;
  } catch {
    return 'target=invalid-url';
  }
}

function buildDataSource() {
  const databaseUrl = firstNonEmpty(
    process.env.DATABASE_URL,
    process.env.DATABASE_PRIVATE_URL,
    process.env.DATABASE_PUBLIC_URL,
    process.env.URL_DO_BANCO_DE_DADOS,
    process.env.POSTGRES_URL,
    process.env.POSTGRESQL_URL,
  );

  if (databaseUrl) {
    console.log(
      `[MIGRATIONS] Using database URL from environment (${describeDatabaseTarget(databaseUrl)}).`,
    );
    return new DataSource({
      type: 'postgres',
      url: databaseUrl,
      ssl: resolveSslConfig(),
      synchronize: false,
      entities: ['dist/!(database|seed|queue|worker)/**/*.entity.js'],
      migrations: ['dist/database/migrations/*.js'],
    });
  }

  const host = firstNonEmpty(
    process.env.DATABASE_HOST,
    process.env.PGHOST,
    process.env.POSTGRES_HOST,
  );
  const port = Number(
    firstNonEmpty(
      process.env.DATABASE_PORT,
      process.env.PGPORT,
      process.env.POSTGRES_PORT,
    ) || '5432',
  );
  const username = firstNonEmpty(
    process.env.DATABASE_USER,
    process.env.PGUSER,
    process.env.POSTGRES_USER,
  );
  const password = firstNonEmpty(
    process.env.DATABASE_PASSWORD,
    process.env.PGPASSWORD,
    process.env.POSTGRES_PASSWORD,
  );
  const database = firstNonEmpty(
    process.env.DATABASE_NAME,
    process.env.PGDATABASE,
    process.env.POSTGRES_DB,
  );

  if (!host || !username || !password || !database) {
    throw new Error(
      'Database config missing. Set DATABASE_URL (recommended) or DATABASE_HOST/PORT/USER/PASSWORD/NAME.',
    );
  }

  console.log(
    `[MIGRATIONS] Using host credentials (${username}@${host}:${port}/${database}).`,
  );
  return new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
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
