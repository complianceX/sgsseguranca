const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.resolve(__dirname, '..', '..', '..', 'frontend');
const canonicalPermissionsFile = path.join(frontendRoot, 'src', 'lib', 'permissions.ts');
const skippedDirectories = new Set(['node_modules', '.next', 'dist', '.git']);

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) files.push(...walk(path.join(dir, entry.name)));
    } else if (entry.isFile() && /\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

const missingImports = [];
for (const file of walk(frontendRoot)) {
  if (path.resolve(file) === canonicalPermissionsFile) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (!/\bPermission\./.test(text)) continue;
  if (/import\s*\{[^}]*\bPermission\b[^}]*\}\s*from\s*['"][^'"]*permissions['"]/.test(text)) continue;
  missingImports.push(path.relative(frontendRoot, file));
}

if (missingImports.length > 0) {
  console.error(`Permission import ausente em:\n${missingImports.join('\n')}`);
  process.exit(1);
}

console.log('PERMISSION_IMPORTS_OK');
