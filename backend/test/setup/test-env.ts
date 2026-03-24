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
  applyDefault('LOGIN_THROTTLE_LIMIT', '100');
  applyDefault('FORGOT_PASSWORD_THROTTLE_LIMIT', '100');
  applyDefault('CHANGE_PASSWORD_THROTTLE_LIMIT', '100');
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

  applyForced('DATABASE_URL', '');
  applyForced('DATABASE_PRIVATE_URL', '');
  applyForced('DATABASE_PUBLIC_URL', '');
  applyForced('URL_DO_BANCO_DE_DADOS', '');

  // Telemetria desabilitada em testes
  applyDefault('REDIS_DISABLED', 'false');

  bootstrapped = true;
}

bootstrapBackendTestEnvironment();
