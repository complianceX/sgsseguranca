const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const frontendRoot = path.resolve(__dirname, "..", "..", "..", "frontend");
const eslintBin = path.join(
  frontendRoot,
  "node_modules",
  "eslint",
  "bin",
  "eslint.js",
);
if (!fs.existsSync(eslintBin)) {
  console.error(`ESLint bin não encontrado em: ${eslintBin}`);
  process.exit(1);
}

// ESLint v9 defaults to flat config — force legacy mode so .eslintrc.cjs is used
// and ignorePatterns (including .vercel/**) is honoured.
const env = { ...process.env, ESLINT_USE_FLAT_CONFIG: "false" };

const result = spawnSync(
  process.execPath,
  [
    eslintBin,
    ".",
    "--max-warnings=0",
    "--ignore-pattern", ".vercel/**",
    "--ignore-pattern", ".next/**",
    "--ignore-pattern", "out/**",
    "--ignore-pattern", "build/**",
  ],
  {
    stdio: "inherit",
    env,
    cwd: frontendRoot,
  },
);

process.exit(result.status ?? 1);
