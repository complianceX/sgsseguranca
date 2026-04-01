const { Client } = require('pg');
const {
  resolveDatabaseConfig,
  resolveSslConfig,
} = require('../database-runtime.config');

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

function isSupabaseHost(hostname) {
  if (typeof hostname !== 'string') return false;
  const host = hostname.toLowerCase();
  return (
    host.includes('supabase.co') ||
    host.includes('pooler.supabase.com') ||
    host.includes('.supabase.')
  );
}

function getHostnameFromDatabaseConfig(databaseConfig) {
  if (!databaseConfig) return '';
  if (databaseConfig.url) {
    try {
      return new URL(databaseConfig.url).hostname;
    } catch {
      return '';
    }
  }
  return databaseConfig.host || '';
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

function buildClientConfig(databaseConfig, sslConfig) {
  if (databaseConfig.url) {
    return {
      connectionString: stripSslModeFromConnectionString(databaseConfig.url),
      ssl: sslConfig,
    };
  }

  return {
    host: databaseConfig.host,
    port: databaseConfig.port,
    user: databaseConfig.username,
    password: databaseConfig.password,
    database: databaseConfig.database,
    ssl: sslConfig,
  };
}

async function connectRuntimePgClient(options = {}) {
  const databaseConfig = resolveDatabaseConfig();
  const warnings = [];
  const hostname = getHostnameFromDatabaseConfig(databaseConfig);
  const baseSsl = resolveSslConfig();
  const forceAllowInsecure =
    options.forceAllowInsecure === true || process.env.DB_FORCE_INSECURE === 'true';
  const sslConfig = forceAllowInsecure
    ? { rejectUnauthorized: false }
    : baseSsl;

  let client = new Client(buildClientConfig(databaseConfig, sslConfig));
  try {
    await client.connect();
    return {
      client,
      databaseConfig,
      warnings,
      usedInsecureFallback: forceAllowInsecure,
    };
  } catch (error) {
    if (
      !forceAllowInsecure &&
      isSupabaseHost(hostname) &&
      isTlsCertificateError(error)
    ) {
      warnings.push(
        'Conexão TLS strict falhou para Supabase. Repetindo com rejectUnauthorized=false para validação operacional.',
      );
      try {
        await client.end();
      } catch {
        // noop
      }

      client = new Client(
        buildClientConfig(databaseConfig, { rejectUnauthorized: false }),
      );
      await client.connect();
      return {
        client,
        databaseConfig,
        warnings,
        usedInsecureFallback: true,
      };
    }

    throw error;
  }
}

module.exports = {
  connectRuntimePgClient,
  getHostnameFromDatabaseConfig,
  isSupabaseHost,
  stripSslModeFromConnectionString,
};

