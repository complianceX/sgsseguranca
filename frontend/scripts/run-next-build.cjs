const { spawnSync } = require('node:child_process');

const env = { ...process.env };

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
  throw result.error;
}

process.exit(result.status ?? 1);
