import appDataSource from '../../data-source';

const DEFERRED_PRODUCTION_MIGRATION_IDS = [
  '1709000000086',
  '1709000000087',
  '1709000000088',
  '1709000000089',
  '1709000000090',
  '1709000000091',
  '1709000000092',
  '1709000000093',
  '1709000000094',
];

type MigrationMetadata = {
  name?: string;
  timestamp?: number | string;
};

function hasDatabaseConfig(): boolean {
  return Boolean(
    process.env.DATABASE_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    process.env.URL_DO_BANCO_DE_DADOS ||
    process.env.DATABASE_HOST ||
    process.env.PGHOST,
  );
}

export function shouldRequireNoPendingMigrations(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const isProd = env.NODE_ENV === 'production';
  const pendingMigrationPolicy = (env.REQUIRE_NO_PENDING_MIGRATIONS || '')
    .trim()
    .toLowerCase();

  return isProd && pendingMigrationPolicy !== 'false';
}

function resolveDeferredMigrationIds(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const rawValue = (env.MIGRATION_DEFERRED_IDS || '').trim();
  if (rawValue.length > 0) {
    return new Set(
      rawValue
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  if (env.NODE_ENV === 'production') {
    return new Set(DEFERRED_PRODUCTION_MIGRATION_IDS);
  }

  return new Set();
}

function isDeferredMigration(
  migration: MigrationMetadata,
  deferredMigrationIds: Set<string>,
): boolean {
  if (deferredMigrationIds.size === 0) {
    return false;
  }

  const name = String(migration.name || '');
  const timestamp = String(migration.timestamp || '');

  if (timestamp && deferredMigrationIds.has(timestamp)) {
    return true;
  }

  for (const deferredId of deferredMigrationIds) {
    if (name.includes(deferredId)) {
      return true;
    }
  }

  return false;
}

export async function assertNoPendingMigrationsInProd(): Promise<void> {
  const requireNoPendingMigrations = shouldRequireNoPendingMigrations(
    process.env,
  );

  if (!requireNoPendingMigrations) {
    return;
  }

  if (!hasDatabaseConfig()) {
    throw new Error(
      'REQUIRE_NO_PENDING_MIGRATIONS=true but database configuration is missing.',
    );
  }

  const deferredMigrationIds = resolveDeferredMigrationIds(process.env);
  let initializedHere = false;

  try {
    if (!appDataSource.isInitialized) {
      await appDataSource.initialize();
      initializedHere = true;
    }

    const executedRows = (await appDataSource.query(
      'SELECT name FROM "migrations"',
    )) as Array<{ name?: string }>;
    const executedMigrationNames = new Set(
      executedRows.map((row) => String(row?.name || '')).filter(Boolean),
    );

    const pendingMigrations = appDataSource.migrations.filter(
      (migration) =>
        !executedMigrationNames.has(String(migration.name || '')) &&
        !isDeferredMigration(migration, deferredMigrationIds),
    );

    if (pendingMigrations.length > 0) {
      throw new Error(
        'Pending database migrations detected. Run migrations before starting the application in production.',
      );
    }
  } finally {
    if (initializedHere && appDataSource.isInitialized) {
      await appDataSource.destroy();
    }
  }
}
