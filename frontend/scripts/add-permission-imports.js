/* eslint-disable */
const fs = require('fs');
const path = require('path');
const process = require('process');

function walk(dir) {
  const results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of list) {
    if (ent.isDirectory()) {
      if (['node_modules', '.next', 'dist', '.git'].includes(ent.name)) continue;
      results.push(...walk(path.join(dir, ent.name)));
    } else if (ent.isFile()) {
      if (/\.(ts|tsx|js|jsx)$/.test(ent.name)) results.push(path.join(dir, ent.name));
    }
  }
  return results;
}

(function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const files = walk(path.join(repoRoot));
  const changed = [];
  for (const f of files) {
    let text = fs.readFileSync(f, 'utf8');
    if (!/\bPermission\./.test(text)) continue;
    if (/import\s+\{?\s*Permission\s*\}?\s+from\s+['\"]/.test(text)) continue;

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
})();