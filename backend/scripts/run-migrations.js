require('reflect-metadata');
const path = require('path');

function loadDataSource() {
  // Prefer compiled dist datasource (works in production containers)
  const distPath = path.join(__dirname, '..', 'dist', 'data-source.js');
  try {
    return require(distPath).default;
  } catch (err) {
    // Fallback to TS datasource via ts-node (dev/local)
    try {
      require('ts-node/register');
      require('tsconfig-paths/register');
      return require('../src/data-source').default;
    } catch (inner) {
      console.error('[MIGRATIONS] Could not load data-source. Ensure dist build or ts-node are available.', inner);
      throw inner;
    }
  }
}

async function main() {
  const dataSource = loadDataSource();
  try {
    await dataSource.initialize();
    const hasPending = await dataSource.showMigrations();
    if (!hasPending) {
      console.log('[MIGRATIONS] No pending migrations.');
      return;
    }
    console.log('[MIGRATIONS] Applying pending migrations...');
    const applied = await dataSource.runMigrations({ transaction: 'all' });
    console.log(`[MIGRATIONS] Applied ${applied.length} migration(s).`);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main().catch((err) => {
  console.error('[MIGRATIONS] Failed:', err.message || err);
  process.exit(1);
});
