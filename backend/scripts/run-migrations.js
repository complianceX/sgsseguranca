require('reflect-metadata');
const fs = require('fs');
const path = require('path');
const { DataSource } = require('typeorm');
const crypto = require('crypto');
const {
  getHostnameFromDatabaseConfig,
  isSupabaseHost,
  isTlsCertificateError,
  resolveDatabaseConfig,
  resolveSslConfig,
} = require('./database-runtime.config');

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

function clampPositiveInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function computeAdvisoryLockId(input) {
  // Postgres advisory lock uses signed bigint. We generate a stable positive bigint < 2^63.
  const hash = crypto.createHash('sha256').update(String(input)).digest();
  const asU64 = hash.readBigUInt64BE(0);
  const maxSignedBigInt = BigInt('9223372036854775807');
  return (asU64 % maxSignedBigInt).toString();
}

async function acquireAdvisoryLock(queryRunner, lockId, timeoutMs) {
  const startedAt = Date.now();
  let attempt = 0;

  while (true) {
    attempt += 1;
    const rows = await queryRunner.query(
      'SELECT pg_try_advisory_lock($1::bigint) AS locked',
      [lockId],
    );
    const locked = Boolean(rows && rows[0] && rows[0].locked);
    if (locked) {
      console.log(
        `[MIGRATIONS] Advisory lock acquired (lockId=${lockId}, attempts=${attempt}).`,
      );
      return;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(
        `Timed out waiting for advisory lock after ${timeoutMs}ms (lockId=${lockId}).`,
      );
    }

    if (attempt === 1 || attempt % 10 === 0) {
      console.log(
        `[MIGRATIONS] Waiting for advisory lock (lockId=${lockId}, attempt=${attempt})...`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function releaseAdvisoryLock(queryRunner, lockId) {
  try {
    await queryRunner.query('SELECT pg_advisory_unlock($1::bigint)', [lockId]);
    console.log(`[MIGRATIONS] Advisory lock released (lockId=${lockId}).`);
  } catch (err) {
    console.warn(
      `[MIGRATIONS] Failed to release advisory lock (lockId=${lockId}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function buildDataSource(databaseConfig, sslConfig = resolveSslConfig()) {
  const targetConfig = databaseConfig || resolveDatabaseConfig();
  const migrations = resolveMigrationsForExecution();

  if (targetConfig.url) {
    console.log(
      `[MIGRATIONS] Using database URL from environment (${targetConfig.target}).`,
    );
    return new DataSource({
      type: 'postgres',
      url: targetConfig.url,
      ssl: sslConfig,
      synchronize: false,
      entities: ['dist/!(database|seed|queue|worker)/**/*.entity.js'],
      migrations,
    });
  }

  console.log(
    `[MIGRATIONS] Using host credentials (${targetConfig.target}).`,
  );
  return new DataSource({
    type: 'postgres',
    host: targetConfig.host,
    port: targetConfig.port,
    username: targetConfig.username,
    password: targetConfig.password,
    database: targetConfig.database,
    ssl: sslConfig,
    synchronize: false,
    entities: ['dist/!(database|seed|queue|worker)/**/*.entity.js'],
    migrations,
  });
}

function resolveDeferredMigrationIds() {
  const envValue = process.env.MIGRATION_DEFERRED_IDS;
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    return envValue
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  if (process.env.NODE_ENV === 'production') {
    return DEFERRED_PRODUCTION_MIGRATION_IDS;
  }

  return [];
}

function resolveMigrationsForExecution() {
  const distDir = path.resolve(__dirname, '..', 'dist', 'database', 'migrations');
  const deferredIds = new Set(resolveDeferredMigrationIds());

  if (!fs.existsSync(distDir)) {
    return ['dist/database/migrations/*.js'];
  }

  const files = fs
    .readdirSync(distDir)
    .filter((file) => file.endsWith('.js'))
    .sort();

  const deferred = [];
  const active = [];

  for (const file of files) {
    const migrationId = file.slice(0, 13);
    if (deferredIds.has(migrationId)) {
      deferred.push(file);
      continue;
    }
    active.push(path.join(distDir, file));
  }

  if (deferred.length > 0) {
    console.warn(
      `[MIGRATIONS] Deferred production migration batch skipped by policy: ${deferred.join(', ')}`,
    );
  }

  return active;
}

async function initializeDataSourceWithTlsFallback(databaseConfig) {
  const hostname = getHostnameFromDatabaseConfig(databaseConfig);
  let dataSource = buildDataSource(databaseConfig);

  try {
    await dataSource.initialize();
    return dataSource;
  } catch (error) {
    if (!isSupabaseHost(hostname) || !isTlsCertificateError(error)) {
      throw error;
    }

    console.warn(
      '[MIGRATIONS] TLS strict falhou para Supabase. Repetindo com rejectUnauthorized=false como fallback operacional controlado.',
    );

    try {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    } catch {
      // noop
    }

    dataSource = buildDataSource(databaseConfig, {
      rejectUnauthorized: false,
    });
    await dataSource.initialize();
    return dataSource;
  }
}

function isDuplicateMigrationsPrimaryKeyError(err) {
  if (!err) {
    return false;
  }

  const message = String(err.message || err);
  const code = String(err.code || '');

  return (
    code === '23505' &&
    /duplicate key value/i.test(message) &&
    /PK_8c82d7f526340ab734260ea46be/i.test(message)
  );
}

async function runMigrationsWithRaceTolerance(dataSource) {
  try {
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    return applied;
  } catch (err) {
    if (!isDuplicateMigrationsPrimaryKeyError(err)) {
      throw err;
    }

    console.warn(
      '[MIGRATIONS] Duplicate insert detected in migrations table. Verifying pending migrations state...',
    );
    const stillPending = await dataSource.showMigrations();
    if (stillPending) {
      throw err;
    }

    console.warn(
      '[MIGRATIONS] Migration race resolved: no pending migrations remain. Continuing startup.',
    );
    return [];
  }
}

async function main() {
  const databaseConfig = resolveDatabaseConfig();
  const dataSource = await initializeDataSourceWithTlsFallback(databaseConfig);
  const lockInput =
    process.env.MIGRATION_ADVISORY_LOCK_INPUT ||
    `typeorm-migrations:${databaseConfig.target || 'unknown'}`;
  const lockId =
    process.env.MIGRATION_ADVISORY_LOCK_ID || computeAdvisoryLockId(lockInput);
  const lockTimeoutMs = clampPositiveInt(
    process.env.MIGRATION_ADVISORY_LOCK_TIMEOUT_MS,
    5 * 60_000,
    5_000,
    30 * 60_000,
  );
  let lockRunner;
  try {
    lockRunner = dataSource.createQueryRunner();
    await lockRunner.connect();
    await acquireAdvisoryLock(lockRunner, lockId, lockTimeoutMs);
    const hasPending = await dataSource.showMigrations();
    if (!hasPending) {
      console.log('[MIGRATIONS] No pending migrations.');
      return;
    }
    console.log('[MIGRATIONS] Applying pending migrations...');
    const applied = await runMigrationsWithRaceTolerance(dataSource);
    console.log(`[MIGRATIONS] Applied ${applied.length} migration(s).`);
  } finally {
    if (lockRunner) {
      await releaseAdvisoryLock(lockRunner, lockId);
      try {
        await lockRunner.release();
      } catch {
        // noop
      }
    }
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main().catch((err) => {
  console.error('[MIGRATIONS] Failed:', err.message || err);
  process.exit(1);
});
