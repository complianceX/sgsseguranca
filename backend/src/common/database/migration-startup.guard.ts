import { Logger } from '@nestjs/common';
import appDataSource from '../../data-source';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import {
  isSupabaseHost,
  isTlsCertificateError,
  parseBooleanFlag,
  resolveDatabaseHostname,
} from './db-ssl.util';

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
  constructor?: {
    name?: string;
  };
};

const logger = new Logger('MigrationStartupGuard');

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

  const name = getMigrationName(migration);
  const timestamp = getMigrationTimestamp(migration);

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

function getMigrationName(migration: MigrationMetadata): string {
  return String(migration.name || migration.constructor?.name || '');
}

function getMigrationTimestamp(migration: MigrationMetadata): string {
  if (migration.timestamp !== undefined && migration.timestamp !== null) {
    return String(migration.timestamp);
  }

  const migrationName = getMigrationName(migration);
  const matchedTimestamp = migrationName.match(/(\d{13})$/);
  return matchedTimestamp?.[1] || '';
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
  let dataSource: DataSource = appDataSource;
  const allowSupabaseCertFallback = parseBooleanFlag(
    process.env.DATABASE_SSL_ALLOW_SUPABASE_CERT_FALLBACK,
  );

  try {
    if (!dataSource.isInitialized) {
      try {
        await dataSource.initialize();
      } catch (error) {
        const databaseHostname = resolveDatabaseHostname({
          url: (dataSource.options as { url?: string })?.url,
          host: (dataSource.options as { host?: string })?.host,
        });

        if (
          !allowSupabaseCertFallback ||
          !isSupabaseHost(databaseHostname) ||
          !isTlsCertificateError(error)
        ) {
          throw error;
        }

        logger.warn(
          `TLS strict falhou ao validar migrations em Supabase (${databaseHostname || 'host=unknown'}). Repetindo verificacao com rejectUnauthorized=false por DATABASE_SSL_ALLOW_SUPABASE_CERT_FALLBACK.`,
        );

        const fallbackOptions = {
          ...((appDataSource.options as unknown) as Record<string, unknown>),
          ssl: { rejectUnauthorized: false },
        } as unknown as DataSourceOptions;
        dataSource = new DataSource(fallbackOptions);
        await dataSource.initialize();
      }
      initializedHere = true;
    }

    const executedRows = (await dataSource.query(
      'SELECT name FROM "migrations"',
    )) as Array<{ name?: string }>;
    const executedMigrationNames = new Set(
      executedRows.map((row) => String(row?.name || '')).filter(Boolean),
    );

    const pendingMigrations = dataSource.migrations.filter(
      (migration) =>
        !executedMigrationNames.has(getMigrationName(migration)) &&
        getMigrationName(migration).length > 0 &&
        !isDeferredMigration(migration, deferredMigrationIds),
    );

    if (pendingMigrations.length > 0) {
      throw new Error(
        'Pending database migrations detected. Run migrations before starting the application in production.',
      );
    }
  } finally {
    if (initializedHere && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}
