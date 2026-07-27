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

// Use flat config (eslint.config.mjs) — legacy mode (ESLINT_USE_FLAT_CONFIG=false)
// triggers ConfigValidator.validateConfigSchema which serializes eslint-plugin-react
// with JSON.stringify and crashes on its circular reference in configs.flat.plugins.react.
const result = spawnSync(
  process.execPath,
  [eslintBin, ".", "--max-warnings=0"],
  {
    stdio: "inherit",
    cwd: frontendRoot,
  },
);

process.exit(result.status ?? 1);
