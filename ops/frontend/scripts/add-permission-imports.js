/* eslint-disable */
const fs = require('fs');
const path = require('path');
const process = require('process');
const skippedDirectories = new Set(['node_modules', '.next', 'dist', '.git']);
const frontendRoot = path.resolve(__dirname, '..', '..', '..', 'frontend');

function walk(dir) {
  const results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of list) {
    if (ent.isDirectory()) {
      if (skippedDirectories.has(ent.name)) continue;
      results.push(...walk(path.join(dir, ent.name)));
    } else if (ent.isFile()) {
      if (/\.(ts|tsx|js|jsx)$/.test(ent.name)) results.push(path.join(dir, ent.name));
    }
  }
  return results;
}

function hasPermissionImport(text) {
  return /import\s*\{[^}]*\bPermission\b[^}]*\}\s*from\s*['"][^'"]*permissions['"]/.test(
    text,
  );
}

function shouldSkipFile(file) {
  return path.resolve(file) === path.join(frontendRoot, 'src', 'lib', 'permissions.ts');
}

function main() {
  const files = walk(frontendRoot);
  const changed = [];
  for (const f of files) {
    if (shouldSkipFile(f)) continue;
    let text = fs.readFileSync(f, 'utf8');
    if (!/\bPermission\./.test(text)) continue;
    if (hasPermissionImport(text)) continue;

    // find first import block end
    const importMatch = text.match(/(^[ \t]*import\s+[\s\S]*?from\s+['\"][^'\"]+['\"];?\s*\n)+/m);
    const importStmt = "import { Permission } from '@/lib/permissions';\n";
    if (importMatch) {
      const idx = importMatch.index + importMatch[0].length;
      text = text.slice(0, idx) + importStmt + text.slice(idx);
    } else {
      text = importStmt + text;
    }
    fs.writeFileSync(f, text, 'utf8');
    changed.push(f);
  }

  if (changed.length === 0) {
    console.log('NO_IMPORTS_ADDED');
    process.exit(0);
  }
  console.log('ADDED_IMPORTS');
  changed.forEach(c => console.log(c));
}

if (require.main === module) {
  main();
}

module.exports = { hasPermissionImport, main, shouldSkipFile };
