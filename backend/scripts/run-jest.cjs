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
applyDefault('JWT_SECRET', 'test-jwt-secret-unit-tests-only-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
applyDefault('JWT_REFRESH_SECRET', 'test-refresh-secret-unit-tests-only-bbbbbbbbbbbbbbbbbbbbbbbbbbbb');
applyDefault(
  'SECURITY_AUDIT_HMAC_KEY',
  'test-security-audit-hmac-key-only-cccccccccccccccccccccccc',
);
applyDefault('BCRYPT_SALT_ROUNDS', '4');

const isE2EConfig = args.some((arg) => /jest-e2e/i.test(arg));
if (isE2EConfig) {
  // Necessaria para pdf-parse -> pdfjs-dist (ESM real, .mjs) resolver seu
  // "fake worker" em runtime de teste. Sem ela: "A dynamic import callback
  // was invoked without --experimental-vm-modules". O runtime bridge de
  // Puppeteer usa createRequire fora do carregador do Jest.
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
// Forward the parent Node runtime flags to Jest.  The npm scripts deliberately
// set --max-old-space-size for the test workload; dropping that flag here makes
// the child Jest process fall back to Node's smaller default heap and can turn
// a valid E2E suite into an OOM failure on CI.
const result = spawnSync(process.execPath, [...process.execArgv, jestBin, ...args], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
