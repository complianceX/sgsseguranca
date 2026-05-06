const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const binName = process.platform === "win32" ? "eslint.cmd" : "eslint";
const eslintBin = path.join(__dirname, "..", "node_modules", ".bin", binName);
if (!fs.existsSync(eslintBin)) {
  console.error(`ESLint bin não encontrado em: ${eslintBin}`);
  process.exit(1);
}

const env = { ...process.env };

const result =
  process.platform === "win32"
    ? spawnSync("cmd.exe", ["/c", eslintBin, ".", "--max-warnings=0"], {
        stdio: "inherit",
        env,
      })
    : spawnSync(eslintBin, [".", "--max-warnings=0"], {
        stdio: "inherit",
        env,
      });

process.exit(result.status ?? 1);
