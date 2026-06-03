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

const env = { ...process.env };

const result = spawnSync(
  process.execPath,
  [eslintBin, ".", "--max-warnings=0"],
  {
    stdio: "inherit",
    env,
    cwd: frontendRoot,
  },
);

process.exit(result.status ?? 1);
