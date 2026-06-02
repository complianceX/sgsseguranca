const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const frontendRoot = path.resolve(__dirname, "..", "..", "..", "frontend");
const binName = process.platform === "win32" ? "eslint.cmd" : "eslint";
const eslintBin = path.join(frontendRoot, "node_modules", ".bin", binName);
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
      cwd: frontendRoot,
    })
    : spawnSync(eslintBin, [".", "--max-warnings=0"], {
        stdio: "inherit",
        env,
        cwd: frontendRoot,
      });

process.exit(result.status ?? 1);
