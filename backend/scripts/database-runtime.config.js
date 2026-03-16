function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function parseBooleanFlag(value) {
  return typeof value === 'string' && /^true$/i.test(value.trim());
}

function resolveSslConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const sslEnabled = parseBooleanFlag(process.env.DATABASE_SSL);
  const sslCA = firstNonEmpty(process.env.DATABASE_SSL_CA);
  const allowInsecure =
    parseBooleanFlag(process.env.DATABASE_SSL_ALLOW_INSECURE) ||
    parseBooleanFlag(process.env.BANCO_DE_DADOS_SSL);

  if (!isProduction && !sslEnabled && !allowInsecure) {
    return false;
  }

  if (allowInsecure) {
    return { rejectUnauthorized: false };
  }

  if (!isProduction && !sslEnabled) {
    return false;
  }

  if (isProduction && !sslEnabled) {
    throw new Error(
      'DATABASE_SSL=true é obrigatório em produção (ou use DATABASE_SSL_ALLOW_INSECURE=true com risco explícito).',
    );
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

function resolveDatabaseConfig() {
  const databaseUrl = firstNonEmpty(
    process.env.DATABASE_URL,
    process.env.DATABASE_PRIVATE_URL,
    process.env.DATABASE_PUBLIC_URL,
    process.env.URL_DO_BANCO_DE_DADOS,
    process.env.POSTGRES_URL,
    process.env.POSTGRESQL_URL,
  );

  if (databaseUrl) {
    return {
      url: databaseUrl,
      target: describeDatabaseTarget(databaseUrl),
    };
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

  return {
    host,
    port,
    username,
    password,
    database,
    target: `${username}@${host}:${port}/${database}`,
  };
}

module.exports = {
  describeDatabaseTarget,
  firstNonEmpty,
  parseBooleanFlag,
  resolveDatabaseConfig,
  resolveSslConfig,
};
