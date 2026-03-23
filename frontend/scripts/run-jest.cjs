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
applyDefault('CI', 'true');
applyDefault('NEXT_TELEMETRY_DISABLED', '1');
applyDefault('NEXT_PUBLIC_API_URL', 'http://localhost:3001');
applyDefault('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
applyDefault('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');

const jestBin = require.resolve('jest-cli/bin/jest');
const result = spawnSync(process.execPath, [jestBin, ...args], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
