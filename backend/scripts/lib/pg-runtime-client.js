const { Client } = require('pg');
const {
  resolveDatabaseConfig,
  resolveRuntimeDatabaseConfig,
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
  const databaseConfig =
    options.useAdministrativeConfig === true
      ? resolveDatabaseConfig()
      : resolveRuntimeDatabaseConfig();
  const warnings = [];
  const sslConfig = resolveSslConfig();

  let client = new Client(buildClientConfig(databaseConfig, sslConfig));
  try {
    await client.connect();
    return {
      client,
      databaseConfig,
      warnings,
      usedInsecureFallback: false,
    };
  } catch (error) {
    throw error;
  }
}

module.exports = {
  connectRuntimePgClient,
  getHostnameFromDatabaseConfig,
  stripSslModeFromConnectionString,
};
