import appDataSource from '../../data-source';

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

  let initializedHere = false;

  try {
    if (!appDataSource.isInitialized) {
      await appDataSource.initialize();
      initializedHere = true;
    }

    const hasPendingMigrations = await appDataSource.showMigrations();
    if (hasPendingMigrations) {
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
