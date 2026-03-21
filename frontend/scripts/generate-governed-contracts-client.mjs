import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const backendRoot = path.resolve(frontendRoot, "..", "backend");
const schemaPath = path.join(
  backendRoot,
  "openapi",
  "governed-contracts.openapi.json",
);
const outputPath = path.join(
  frontendRoot,
  "lib",
  "api",
  "generated",
  "governed-contracts.schema.ts",
);

const cliPath = path.join(
  frontendRoot,
  "node_modules",
  "openapi-typescript",
  "bin",
  "cli.js",
);

if (process.platform === "win32") {
  execFileSync("cmd.exe", ["/c", "npm", "run", "openapi:export:governed"], {
    cwd: backendRoot,
    stdio: "inherit",
  });
} else {
  execFileSync("npm", ["run", "openapi:export:governed"], {
    cwd: backendRoot,
    stdio: "inherit",
  });
}

if (!fs.existsSync(schemaPath)) {
  throw new Error(`Schema OpenAPI não encontrado em ${schemaPath}`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

execFileSync(process.execPath, [cliPath, schemaPath, "-o", outputPath], {
  cwd: frontendRoot,
  stdio: "inherit",
});

process.stdout.write(`Cliente tipado gerado em ${outputPath}\n`);
