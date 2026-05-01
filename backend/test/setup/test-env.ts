import * as dotenv from 'dotenv';
import * as path from 'path';

let bootstrapped = false;

function applyDefault(key: string, value: string) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

function applyForced(key: string, value: string) {
  process.env[key] = value;
}

export function bootstrapBackendTestEnvironment() {
  if (bootstrapped) {
    return;
  }

  dotenv.config({
    path: path.resolve(__dirname, '../.env'),
    override: false,
  });

  applyDefault('NODE_ENV', 'test');
  applyDefault('TZ', 'UTC');
  applyDefault('LOG_LEVEL', 'error');
  applyDefault('OTEL_ENABLED', 'false');
  applyDefault('NEW_RELIC_ENABLED', 'false');
  applyForced('SEED_ON_BOOTSTRAP', 'false');
  applyForced('DISABLE_AUTO_CONSENT_SEED', 'true');
  applyForced('API_CRONS_DISABLED', 'true');
  applyForced('CACHE_WARMING_ENABLED', 'false');
  applyForced('TENANT_VALIDATION_WARMUP_ENABLED', 'false');
  applyForced('RBAC_WARMUP_ENABLED', 'false');
  applyForced('DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_ENABLED', 'false');
  applyForced('WORKER_HEARTBEAT_ENABLED', 'false');
  applyForced(
    'DOCUMENT_DOWNLOAD_TOKEN_SECRET',
    'test-document-download-secret-0123456789',
  );

  // E2E: usa autenticação local (password em `users`) para evitar depender do fallback Supabase.
  applyForced('LEGACY_PASSWORD_AUTH_ENABLED', 'true');

  // JWT — valores de teste, min 32 chars para passar validação Joi
  applyForced('JWT_SECRET', 'test-jwt-secret-for-e2e-testing-only-0123456789');
  applyForced(
    'JWT_REFRESH_SECRET',
    'test-refresh-secret-for-e2e-testing-only-0123456789',
  );

  // bcrypt: 4 rounds = rápido em testes
  applyDefault('BCRYPT_SALT_ROUNDS', '4');

  // Throttle: limites altos para não interferir nos testes
  applyDefault('THROTTLE_LIMIT', '10000');
  applyDefault('THROTTLE_TTL', '60000');
  applyForced('LOGIN_THROTTLE_LIMIT', '10000');
  applyForced('FORGOT_PASSWORD_THROTTLE_LIMIT', '10000');
  applyForced('CHANGE_PASSWORD_THROTTLE_LIMIT', '10000');
  applyDefault('DISABLE_LOGIN_THROTTLE_IN_DEV', 'true');

  // Força testes e2e/integration a usarem DB host/port explícitos do ambiente de teste,
  // evitando herdar DATABASE_URL de shells locais (ex.: Railway) e conectar em 5432 por engano.
  applyForced('DATABASE_HOST', process.env.E2E_DATABASE_HOST || '127.0.0.1');
  applyForced('DATABASE_PORT', process.env.E2E_DATABASE_PORT || '5433');
  applyForced('DATABASE_USER', process.env.E2E_DATABASE_USER || 'postgres');
  applyForced(
    'DATABASE_PASSWORD',
    process.env.E2E_DATABASE_PASSWORD || 'postgres123',
  );
  applyForced('DATABASE_NAME', process.env.E2E_DATABASE_NAME || 'sst_test');
  applyForced('REDIS_HOST', process.env.E2E_REDIS_HOST || '127.0.0.1');
  applyForced('REDIS_PORT', process.env.E2E_REDIS_PORT || '6379');
  applyForced('CLAMAV_HOST', process.env.E2E_CLAMAV_HOST || '127.0.0.1');
  applyForced('CLAMAV_PORT', process.env.E2E_CLAMAV_PORT || '3310');
  applyForced(
    'REDIS_AUTH_URL',
    process.env.E2E_REDIS_AUTH_URL ||
      process.env.REDIS_AUTH_URL ||
      `redis://${process.env.E2E_REDIS_HOST || '127.0.0.1'}:${process.env.E2E_REDIS_PORT || '6379'}`,
  );
  applyForced(
    'REDIS_CACHE_URL',
    process.env.E2E_REDIS_CACHE_URL ||
      process.env.REDIS_CACHE_URL ||
      `redis://${process.env.E2E_REDIS_HOST || '127.0.0.1'}:${process.env.E2E_REDIS_PORT || '6379'}`,
  );
  applyForced(
    'REDIS_QUEUE_URL',
    process.env.E2E_REDIS_QUEUE_URL ||
      process.env.REDIS_QUEUE_URL ||
      `redis://${process.env.E2E_REDIS_HOST || '127.0.0.1'}:${process.env.E2E_REDIS_PORT || '6379'}`,
  );

  applyForced('DATABASE_URL', '');
  applyForced('DATABASE_PRIVATE_URL', '');
  applyForced('DATABASE_PUBLIC_URL', '');
  applyForced('DATABASE_DIRECT_URL', '');
  applyForced('URL_DO_BANCO_DE_DADOS', '');
  applyForced('DATABASE_SSL', 'false');
  applyForced('DATABASE_SSL_ALLOW_INSECURE', 'false');
  applyForced('DATABASE_SSL_ALLOW_INSECURE_FORCE', 'false');
  applyForced('DATABASE_SSL_ALLOW_SUPABASE_CERT_FALLBACK', 'false');
  applyForced('BANCO_DE_DADOS_SSL', 'false');

  // Telemetria desabilitada em testes
  applyDefault('REDIS_DISABLED', 'false');

  bootstrapped = true;
}

bootstrapBackendTestEnvironment();
