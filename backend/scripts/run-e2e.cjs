const { spawnSync } = require('child_process');
const path = require('path');

const composeFile = path.resolve(
  __dirname,
  '..',
  '..',
  'ops/test/compose/docker-compose.e2e.yml',
);

function runDocker(args) {
  const result = spawnSync('docker', args, {
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed`);
  }
}

function runNpm(args) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(executable, args, {
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} failed`);
  }
}

let testFailed = false;

try {
  runDocker(['compose', '-f', composeFile, 'up', '-d']);
  runNpm([
    'run',
    'test:e2e',
    '--',
    '--detectOpenHandles',
    '--testTimeout=90000',
  ]);
} catch (error) {
  testFailed = true;
  console.error(
    error instanceof Error ? error.message : 'E2E execution failed',
  );
} finally {
  try {
    runDocker([
      'compose',
      '-f',
      composeFile,
      'down',
      '-v',
      '--remove-orphans',
    ]);
  } catch (downError) {
    console.error(
      downError instanceof Error
        ? downError.message
        : 'Failed to teardown e2e infra',
    );
    testFailed = true;
  }
}

process.exit(testFailed ? 1 : 0);
