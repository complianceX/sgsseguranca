import * as dotenv from 'dotenv';
import * as path from 'path';

let bootstrapped = false;

function applyDefault(key: string, value: string) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
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
  applyDefault('JWT_SECRET', 'test-jwt-secret');
  applyDefault('JWT_REFRESH_SECRET', 'test-refresh-secret');
  applyDefault('BCRYPT_SALT_ROUNDS', '4');

  bootstrapped = true;
}

bootstrapBackendTestEnvironment();
