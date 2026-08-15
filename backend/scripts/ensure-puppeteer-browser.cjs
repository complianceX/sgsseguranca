const { existsSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const cacheDir = process.env.PUPPETEER_CACHE_DIR || join(__dirname, '..', '.cache', 'puppeteer');
const env = { ...process.env, PUPPETEER_CACHE_DIR: cacheDir };

delete env.PUPPETEER_SKIP_DOWNLOAD;
delete env.PUPPETEER_EXECUTABLE_PATH;

async function main() {
  let executablePath = null;

  try {
    // Puppeteer 25 is ESM-only and executablePath is asynchronous.
    const puppeteer = await import('puppeteer');
    executablePath = await puppeteer.executablePath();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[puppeteer] não foi possível resolver o browser antes do ensure: ${reason}`);
  }

  if (executablePath && existsSync(executablePath)) {
    console.log(`[puppeteer] browser já disponível em ${executablePath}`);
    return;
  }

  console.log(`[puppeteer] instalando browser em cache local: ${cacheDir}`);

  const cliPath = join(
    __dirname,
    '..',
    'node_modules',
    'puppeteer',
    'lib',
    'puppeteer',
    'node',
    'cli.js',
  );
  const install = spawnSync(
    process.execPath,
    [cliPath, 'browsers', 'install', 'chrome'],
    {
      cwd: join(__dirname, '..'),
      env,
      stdio: 'inherit',
    },
  );

  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }
}

main().catch((error) => {
  console.error('[puppeteer] falha inesperada no ensure:', error);
  process.exit(1);
});
