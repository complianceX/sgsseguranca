const { spawnSync } = require('node:child_process');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  CI: process.env.CI || 'true',
  NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || '1',
  TZ: process.env.TZ || 'UTC',
};

// __NEXT_PRIVATE_STANDALONE_CONFIG is set at runtime by Next.js standalone
// output or by previous builds. It serializes the config as JSON (stripping
// functions like generateBuildId), which causes builds to fail. It must never
// leak into the build process.
delete env.__NEXT_PRIVATE_STANDALONE_CONFIG;

if (process.platform === 'win32') {
  // Em Windows, o Next 15 está falhando de forma intermitente ao spawnar
  // workers na geração estática. Esse flag mantém o build reproduzível.
  env.NEXT_DISABLE_SPAWN = '1';
}

const nextBin = require.resolve('next/dist/bin/next');
const result = spawnSync(process.execPath, [nextBin, 'build'], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  if (result.error.code === 'EPERM') {
    console.error(
      '[build] Next.js build falhou com EPERM ao criar subprocessos. ' +
        'Isso costuma indicar restrição do ambiente/runner, não erro funcional da aplicação.',
    );
  }
  throw result.error;
}

process.exit(result.status ?? 1);
