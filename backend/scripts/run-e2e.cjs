const { spawnSync } = require('child_process');

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

let testFailed = false;

try {
  run('docker', ['compose', '-f', 'docker-compose.test.yml', 'up', '-d']);
  run('npm', ['run', 'test:e2e']);
} catch (error) {
  testFailed = true;
  console.error(
    error instanceof Error ? error.message : 'E2E execution failed',
  );
} finally {
  try {
    run('docker', [
      'compose',
      '-f',
      'docker-compose.test.yml',
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

