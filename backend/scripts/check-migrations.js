const fs = require('fs');
const path = require('path');

const migrationsDir = path.resolve(__dirname, '..', 'src', 'database', 'migrations');

if (!fs.existsSync(migrationsDir)) {
  console.error(`[CI] Migrations directory not found: ${migrationsDir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
  .map((entry) => entry.name)
  .sort();

if (files.length === 0) {
  console.error('[CI] No TypeORM migration files were found in src/database/migrations.');
  process.exit(1);
}

const duplicateNames = files.filter((name, index) => files.indexOf(name) !== index);
if (duplicateNames.length > 0) {
  console.error(`[CI] Duplicate migration file names found: ${duplicateNames.join(', ')}`);
  process.exit(1);
}

console.log(`[CI] Migration check passed (${files.length} files).`);
