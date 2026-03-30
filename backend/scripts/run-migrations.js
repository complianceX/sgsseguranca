require('reflect-metadata');
const { DataSource } = require('typeorm');
const crypto = require('crypto');
const {
  resolveDatabaseConfig,
  resolveSslConfig,
} = require('./database-runtime.config');

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
  const databaseConfig = resolveDatabaseConfig();
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
    await dataSource.initialize();
    lockRunner = dataSource.createQueryRunner();
    await lockRunner.connect();
    await acquireAdvisoryLock(lockRunner, lockId, lockTimeoutMs);
    const hasPending = await dataSource.showMigrations();
    if (!hasPending) {
      console.log('[MIGRATIONS] No pending migrations.');
      return;
    }
    console.log('[MIGRATIONS] Applying pending migrations...');
    const applied = await dataSource.runMigrations({ transaction: 'each' });
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
