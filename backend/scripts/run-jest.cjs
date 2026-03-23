const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const env = { ...process.env };

function applyDefault(key, value) {
  if (!env[key]) {
    env[key] = value;
  }
}

applyDefault('NODE_ENV', 'test');
applyDefault('TZ', 'UTC');
applyDefault('LOG_LEVEL', 'error');
applyDefault('OTEL_ENABLED', 'false');
applyDefault('NEW_RELIC_ENABLED', 'false');
applyDefault('JWT_SECRET', 'test-jwt-secret');
applyDefault('JWT_REFRESH_SECRET', 'test-refresh-secret');
applyDefault('BCRYPT_SALT_ROUNDS', '4');

const jestBin = require.resolve('jest-cli/bin/jest');
const result = spawnSync(process.execPath, [jestBin, ...args], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
