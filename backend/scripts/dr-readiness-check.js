const isStrict = process.argv.includes('--strict');

function hasDatabaseConfig() {
  return Boolean(
    process.env.DATABASE_URL ||
      process.env.DATABASE_PUBLIC_URL ||
      process.env.URL_DO_BANCO_DE_DADOS ||
      process.env.DATABASE_HOST ||
      process.env.PGHOST,
  );
}

function hasRedisConfig() {
  return Boolean(
    process.env.URL_REDIS ||
      process.env.REDIS_URL ||
      process.env.REDIS_PUBLIC_URL ||
      process.env.REDIS_HOST,
  );
}

function check(name, condition, recommendation) {
  return {
    name,
    ok: Boolean(condition),
    recommendation,
  };
}

function printResult(result) {
  const status = result.ok ? 'OK' : 'FAIL';
  console.log(`[${status}] ${result.name}`);
  if (!result.ok && result.recommendation) {
    console.log(`       -> ${result.recommendation}`);
  }
}

function main() {
  const checks = [
    check(
      'Database configuration',
      hasDatabaseConfig(),
      'Set DATABASE_URL (recommended) or DATABASE_HOST/PGHOST.',
    ),
    check(
      'Redis configuration',
      hasRedisConfig(),
      'Set URL_REDIS or REDIS_URL (recommended) or REDIS_HOST.',
    ),
    check(
      'Backup secret configured',
      Boolean(process.env.BACKUP_SECRET_KEY),
      'Set BACKUP_SECRET_KEY to protect backup log endpoint.',
    ),
    check(
      'Pending migration guard enabled',
      process.env.REQUIRE_NO_PENDING_MIGRATIONS === 'true',
      'Set REQUIRE_NO_PENDING_MIGRATIONS=true in production.',
    ),
    check(
      'DB sync disabled in production',
      process.env.DB_SYNC !== 'true',
      'Set DB_SYNC=false in production.',
    ),
  ];

  const isProd = process.env.NODE_ENV === 'production';
  const failed = checks.filter((item) => !item.ok);

  console.log(
    `[DR] Running readiness check (${isProd ? 'production' : 'non-production'} mode${isStrict ? ', strict' : ''})`,
  );
  checks.forEach(printResult);

  if (failed.length === 0) {
    console.log('[DR] All checks passed.');
    return;
  }

  console.log(`[DR] ${failed.length} check(s) failed.`);

  if (isStrict || isProd) {
    process.exit(1);
  }
}

main();
