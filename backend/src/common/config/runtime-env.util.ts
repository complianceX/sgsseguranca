const TRIM_SAFE_ENV_KEYS = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'DATABASE_PRIVATE_URL',
  'DATABASE_PUBLIC_URL',
  'URL_DO_BANCO_DE_DADOS',
  'POSTGRES_URL',
  'POSTGRESQL_URL',
  'DATABASE_HOST',
  'PGHOST',
  'POSTGRES_HOST',
  'DATABASE_PORT',
  'PGPORT',
  'POSTGRES_PORT',
  'DATABASE_USER',
  'PGUSER',
  'POSTGRES_USER',
  'DATABASE_NAME',
  'PGDATABASE',
  'POSTGRES_DB',
  'DATABASE_SSL',
  'DATABASE_SSL_ALLOW_INSECURE',
  'BANCO_DE_DADOS_SSL',
  'REDIS_URL',
  'URL_REDIS',
  'REDIS_PUBLIC_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_DISABLED',
  'REDIS_TLS',
  'OTEL_ENABLED',
  'NEW_RELIC_ENABLED',
];

function trimProcessEnvValue(env: NodeJS.ProcessEnv, key: string): void {
  const value = env[key];
  if (typeof value !== 'string') {
    return;
  }

  const trimmed = value.trim();
  if (trimmed !== value) {
    env[key] = trimmed;
  }
}

export function normalizeProcessEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  for (const key of TRIM_SAFE_ENV_KEYS) {
    trimProcessEnvValue(env, key);
  }

  if (typeof env.NODE_ENV === 'string' && env.NODE_ENV.length > 0) {
    env.NODE_ENV = env.NODE_ENV.toLowerCase();
  }

  return env;
}
