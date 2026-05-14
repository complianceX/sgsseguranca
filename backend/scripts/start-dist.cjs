#!/usr/bin/env node

const { existsSync } = require('fs');
const { spawn, spawnSync } = require('child_process');
const path = require('path');

const entryArg = process.argv[2] || 'dist/main.js';
const entryPath = path.resolve(process.cwd(), entryArg);

function runBuild() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['run', 'build'], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(entryPath)) {
  console.warn(
    `[start-dist] ${entryArg} ausente. Executando build antes de iniciar o processo.`,
  );
  runBuild();
}

if (!existsSync(entryPath)) {
  console.error(`[start-dist] ${entryArg} continua ausente após o build.`);
  process.exit(1);
}

const child = spawn(process.execPath, [entryPath], {
  stdio: 'inherit',
  env: process.env,
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));
process.on('SIGHUP', () => forwardSignal('SIGHUP'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('[start-dist] Falha ao iniciar o processo:', error);
  process.exit(1);
});
