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

function stripSslModeFromConnectionString(connectionString) {
  if (typeof connectionString !== 'string' || !connectionString) {
    return connectionString;
  }

  try {
    const parsed = new URL(connectionString);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch {
    return connectionString;
  }
}

function resolveSslConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const legacySslEnabled = parseBooleanFlag(process.env.BANCO_DE_DADOS_SSL);
  const sslEnabled =
    parseBooleanFlag(process.env.DATABASE_SSL) || legacySslEnabled;
  const sslCA = firstNonEmpty(process.env.DATABASE_SSL_CA);
  const allowInsecureRequested = parseBooleanFlag(
    process.env.DATABASE_SSL_ALLOW_INSECURE,
  );
  const allowInsecureForced = parseBooleanFlag(
    process.env.DATABASE_SSL_ALLOW_INSECURE_FORCE,
  );
  const allowInsecure =
    allowInsecureForced || (isProduction && allowInsecureRequested);

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

function getHostnameFromDatabaseConfig(databaseConfig) {
  if (!databaseConfig) {
    return '';
  }

  if (databaseConfig.url) {
    try {
      return new URL(databaseConfig.url).hostname;
    } catch {
      return '';
    }
  }

  return databaseConfig.host || '';
}

function isSupabaseHost(hostname) {
  if (typeof hostname !== 'string') {
    return false;
  }

  const normalized = hostname.toLowerCase();
  return (
    normalized.includes('supabase.co') ||
    normalized.includes('pooler.supabase.com') ||
    normalized.includes('.supabase.')
  );
}

function isTlsCertificateError(error) {
  const message =
    error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : '';

  return (
    message.includes('self-signed certificate') ||
    message.includes('certificate has expired') ||
    message.includes('certificate chain') ||
    message.includes('unable to verify')
  );
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
  // DATABASE_MIGRATION_URL deve ter prioridade para migrations em produção:
  // usa o role owner/DDL, enquanto DATABASE_URL fica reservado ao role de
  // aplicação sem BYPASSRLS.
  const databaseUrl = firstNonEmpty(
    process.env.DATABASE_MIGRATION_URL,
    process.env.DATABASE_DIRECT_URL,
    process.env.DATABASE_URL,
    process.env.DATABASE_PRIVATE_URL,
    process.env.DATABASE_PUBLIC_URL,
    process.env.URL_DO_BANCO_DE_DADOS,
    process.env.POSTGRES_URL,
    process.env.POSTGRESQL_URL,
  );

  if (databaseUrl) {
    const sanitizedDatabaseUrl = stripSslModeFromConnectionString(databaseUrl);
    return {
      url: sanitizedDatabaseUrl,
      target: describeDatabaseTarget(sanitizedDatabaseUrl),
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
  getHostnameFromDatabaseConfig,
  isSupabaseHost,
  isTlsCertificateError,
  parseBooleanFlag,
  resolveDatabaseConfig,
  resolveSslConfig,
  stripSslModeFromConnectionString,
};
