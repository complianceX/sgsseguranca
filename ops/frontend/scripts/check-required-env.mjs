import fs from 'node:fs';
import path from 'node:path';
import { readFrontendEnvironment } from './public-env.mjs';

const phase = process.argv[2] || 'unknown';
const protectedPhases = new Set(['build', 'start']);
const shouldRequireExplicitUrls = protectedPhases.has(phase);
const nodeEnv = process.env.NODE_ENV || (shouldRequireExplicitUrls ? 'production' : 'development');
const projectRoot = process.cwd();
const initialEnvKeys = new Set(Object.keys(process.env));

function loadEnvFile(fileName) {
  const fullPath = path.join(projectRoot, fileName);
  if (!fs.existsSync(fullPath)) {
    return;
  }

  const contents = fs.readFileSync(fullPath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    if (!key || initialEnvKeys.has(key)) {
      continue;
    }

    let value = normalized.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

for (const fileName of [
  '.env',
  `.env.${nodeEnv}`,
  '.env.local',
  `.env.${nodeEnv}.local`,
]) {
  loadEnvFile(fileName);
}

try {
  readFrontendEnvironment({
    requireExplicitApiUrl: shouldRequireExplicitUrls,
    requireExplicitAppUrl: shouldRequireExplicitUrls,
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n[env] ${message}\n`);
  process.exit(1);
}
