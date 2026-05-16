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

const isE2EConfig = args.some((arg) => /jest-e2e/i.test(arg));
if (isE2EConfig) {
  const nodeOptions = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ` : '';
  if (!/--experimental-vm-modules\b/.test(nodeOptions)) {
    env.NODE_OPTIONS = `${nodeOptions}--experimental-vm-modules`.trim();
  }
}

// jest-cli/bin/jest was the path in jest v28 and below.
// In jest v29+ the binary moved to jest/bin/jest.
// Try both to support either version.
let jestBin;
try {
  jestBin = require.resolve('jest/bin/jest');
} catch {
  jestBin = require.resolve('jest-cli/bin/jest');
}
const result = spawnSync(process.execPath, [jestBin, ...args], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
