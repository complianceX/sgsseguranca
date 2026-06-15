const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git']);

function findFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal -- entry.name é um único segmento retornado por readdirSync (sem separadores de path); script dev one-off sobre o próprio repo
      if (!IGNORE_DIRS.has(entry.name)) results.push(...findFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal -- entry.name é um único segmento retornado por readdirSync (sem separadores de path); script dev one-off sobre o próprio repo
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

let modifiedCount = 0;

const HOOK_MAP = {
  useAuthUser: ['user'],
  useAuthPermissions: ['permissions', 'roles', 'isAdminGeral', 'hasPermission'],
  useAuthActions: ['login', 'finalizeLogin', 'logout'],
  useAuthLoading: ['loading'],
};

function getNeededHooks(props) {
  const needed = [];
  for (const [hook, hprops] of Object.entries(HOOK_MAP)) {
    if (props.some(p => hprops.includes(p))) needed.push(hook);
  }
  return needed;
}

/**
 * Parse a destructure entry like "loading: authLoading" or "hasPermission"
 * Returns: { propName: "loading", alias: "authLoading" | null, fullEntry: "loading: authLoading" }
 */
function parseEntry(entry) {
  const parts = entry.trim().split(/\s*:\s*/);
  if (parts.length > 1) {
    return { propName: parts[0].trim(), alias: parts.slice(1).join(':').trim(), fullEntry: entry.trim() };
  }
  return { propName: parts[0].trim(), alias: null, fullEntry: parts[0].trim() };
}

for (const dirName of ['src', 'app']) {
  const fullDir = path.join(ROOT, dirName);
  if (!fs.existsSync(fullDir)) continue;
  const files = findFiles(fullDir);

  for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');

    // Skip if already migrated (uses one of the new hooks)
    const userHooks = Object.keys(HOOK_MAP).filter(h => content.includes(`${h}(`));
    if (userHooks.length > 0) continue;

    // Find import line for useAuth
    const importPattern = /import\s+\{[^}]*\buseAuth\b[^}]*\}\s+from\s+['"]@\/context\/AuthContext['"];?\s*\n?/;
    const importMatch = content.match(importPattern);
    if (!importMatch) continue;

    // Find destructure: `const { ... } = useAuth();`
    const destructurePattern = /const\s*\{([^}]+)\}\s*=\s*useAuth\(\s*\)\s*;?/;
    const destructureMatch = content.match(destructurePattern);
    if (!destructureMatch) continue;

    // Parse entries preserving aliases
    const entries = destructureMatch[1].split(',').map(parseEntry);
    const props = [...new Set(entries.map(e => e.propName))];
    const hooks = getNeededHooks(props);
    if (hooks.length === 0) continue;

    // 1. Replace the import line
    const newImport = `import { ${hooks.join(', ')} } from '@/context/AuthContext';\n`;
    content = content.replace(importMatch[0], newImport);

    // 2. Replace the destructure line with one line per hook
    const indent = destructureMatch[0].match(/^(\s*)/)[1];
    const destructureLines = [];

    for (const hook of hooks) {
      const hookPropNames = HOOK_MAP[hook];
      // Find entries that belong to this hook, preserving aliases
      const matchingEntries = entries.filter(e => hookPropNames.includes(e.propName));
      if (matchingEntries.length > 0) {
        const inner = matchingEntries.map(e => e.fullEntry).join(', ');
        destructureLines.push(`${indent}const { ${inner} } = ${hook}();`);
      }
    }

    content = content.replace(destructureMatch[0], destructureLines.join('\n'));

    fs.writeFileSync(file, content, 'utf-8');
    modifiedCount++;
    console.log(`  ✓ ${path.relative(ROOT, file)}`);
  }
}

console.log(`\nModified: ${modifiedCount} files`);
