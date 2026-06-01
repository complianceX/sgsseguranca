import { Permission } from '@/lib/permissions';
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const process = require('process');
const path = require('path');

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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
}

(function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const permFile = path.join(repoRoot, 'lib', 'permissions.ts');
  if (!fs.existsSync(permFile)) {
    console.error('permissions.ts not found at', permFile);
    process.exit(1);
  }

  const permContent = fs.readFileSync(permFile, 'utf8');
  const map = [];
  const re = /(\w+)\s*:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(permContent))) {
    map.push({ key: m[1], val: m[2] });
  }

  const files = walk(path.join(repoRoot));
  const changed = [];
  for (const f of files) {
    if (f.endsWith('permissions.ts')) continue;
    let text = fs.readFileSync(f, 'utf8');
    const orig = text;

    for (const entry of map) {
      const k = entry.key;
      const v = entry.val;
      const ev = escapeRegex(v);

      // hasPermission('can_x') -> hasPermission(Permission.CAN_X)
      text = text.replace(new RegExp(`hasPermission\\(\\s*(['\"])${ev}\\1\\s*\\)`, 'g'), `hasPermission(Permission.${k})`);

      // permission: 'can_x' -> permission: Permission.CAN_X
      text = text.replace(new RegExp(`permission\\s*:\\s*(['\"])${ev}\\1`, 'g'), `permission: Permission.${k}`);

      // JSX prop permission='can_x' -> permission={Permission.CAN_X}
      text = text.replace(new RegExp(`permission\\s*=\\s*(['\"])${ev}\\1`, 'g'), `permission={Permission.${k}}`);

      // hasPermission("can_x") handled by first regex
    }

    if (text !== orig) {
      fs.writeFileSync(f, text, 'utf8');
      changed.push(f);
    }
  }

  if (changed.length === 0) {
    console.log('NO_CHANGES');
    process.exit(0);
  }

  console.log('CHANGED_FILES');
  for (const c of changed) console.log(c);
  process.exit(0);
})();