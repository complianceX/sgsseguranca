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

export async function assertNoPendingMigrationsInProd(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  const requireNoPendingMigrations =
    process.env.REQUIRE_NO_PENDING_MIGRATIONS === 'true';

  if (!isProd || !requireNoPendingMigrations) {
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
