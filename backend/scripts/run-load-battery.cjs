#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backendRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(backendRoot, 'test', 'load', 'fixtures');
const reportsRoot = path.join(backendRoot, 'test', 'load', 'reports');

const argv = process.argv.slice(2);
const mode = readArgValue('--mode') || 'smoke';
const baseUrl = process.env.BASE_URL || readArgValue('--base-url') || 'http://localhost:3001';
const usersFileArg = process.env.LOGIN_USERS_FILE || readArgValue('--users-file') || '';
const includeSoak = hasFlag('--soak');
const skipLogin = hasFlag('--skip-login');
const skipEnterprise = hasFlag('--skip-enterprise');
const skipMulti = hasFlag('--skip-multi');
const stopOnFailure = !hasFlag('--continue-on-failure');

async function main() {
  ensureDir(reportsRoot);

  const selectedUsersFile = resolveUsersFile(usersFileArg);
  const credentials = loadFirstCredential(selectedUsersFile);
  const targetStatus = await probeBaseUrl(baseUrl);

  if (!targetStatus.ok) {
    console.error(
      `[load-battery] alvo indisponível em ${baseUrl}: ${targetStatus.reason}`,
    );
    process.exit(2);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(reportsRoot, `battery-${mode}-${timestamp}`);
  ensureDir(runDir);

  const sharedEnv = {
    ...process.env,
    BASE_URL: baseUrl,
    LOGIN_USERS_FILE: toRelativeFromBackend(selectedUsersFile),
    LOGIN_CPF: process.env.LOGIN_CPF || credentials.cpf || '',
    LOGIN_PASSWORD: process.env.LOGIN_PASSWORD || credentials.password || '',
    LOGIN_COMPANY_ID: process.env.LOGIN_COMPANY_ID || credentials.companyId || '',
    K6_LOGIN_CPF: process.env.K6_LOGIN_CPF || credentials.cpf || '',
    K6_LOGIN_PASSWORD: process.env.K6_LOGIN_PASSWORD || credentials.password || '',
    K6_COMPANY_ID: process.env.K6_COMPANY_ID || credentials.companyId || '',
    CALL_AUTH_ME: process.env.CALL_AUTH_ME || 'true',
    SEND_COMPANY_HEADER: process.env.SEND_COMPANY_HEADER || 'false',
    EXPECT_REFRESH_COOKIES: process.env.EXPECT_REFRESH_COOKIES || 'true',
    CLIENT_FINGERPRINT_MODE:
      process.env.CLIENT_FINGERPRINT_MODE || 'per-iteration',
  };

  const sequence = buildSequence({ mode, includeSoak, skipLogin, skipEnterprise, skipMulti });
  const results = [];

  console.log(`[load-battery] modo=${mode}`);
  console.log(`[load-battery] baseUrl=${baseUrl}`);
  console.log(`[load-battery] usersFile=${toRelativeFromBackend(selectedUsersFile)}`);
  console.log(`[load-battery] runDir=${runDir}`);

  for (const step of sequence) {
    const startedAt = new Date().toISOString();
    console.log(`\n[load-battery] >>> ${step.name}`);
    const outcome = runStep(step, sharedEnv, runDir);
    results.push({
      name: step.name,
      command: formatCommand(step.command, step.args),
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: outcome.exitCode,
      ok: outcome.exitCode === 0,
      logFile: path.relative(backendRoot, outcome.logFile),
      artifacts: outcome.artifacts.map((artifact) => path.relative(backendRoot, artifact)),
    });

    if (outcome.exitCode !== 0 && stopOnFailure) {
      writeManifest(runDir, {
        mode,
        baseUrl,
        usersFile: path.relative(backendRoot, selectedUsersFile),
        ok: false,
        stoppedOnFailure: true,
        results,
      });
      process.exit(outcome.exitCode || 1);
    }
  }

  const ok = results.every((result) => result.ok);
  writeManifest(runDir, {
    mode,
    baseUrl,
    usersFile: path.relative(backendRoot, selectedUsersFile),
    ok,
    stoppedOnFailure: false,
    results,
  });

  console.log(
    `\n[load-battery] concluído: ${ok ? 'SUCESSO' : 'COM FALHAS'} (${results.filter((r) => r.ok).length}/${results.length})`,
  );

  process.exit(ok ? 0 : 1);
}

function buildSequence({ mode, includeSoak, skipLogin, skipEnterprise, skipMulti }) {
  const steps = [];

  const add = (name, command, args, artifactPatterns) => {
    steps.push({ name, command, args, artifactPatterns });
  };

  const addSmoke = () => {
    if (!skipLogin) {
      add('login-smoke', 'k6', ['run', 'test/load/login-smoke.js'], [
        'test/load/login-smoke-summary.json',
        'test/load/login-smoke-report.txt',
      ]);
    }
    if (!skipEnterprise) {
      add('enterprise-smoke', 'k6', [
        'run',
        'test/load/k6-enterprise-scale.js',
        '-e',
        'K6_SCENARIO_PROFILE=smoke',
      ], ['summary.json']);
    }
    if (!skipMulti) {
      add('multi-tenant-smoke', 'k6', [
        'run',
        'test/load/k6-load-test.js',
        '-e',
        'K6_SCENARIO_PROFILE=smoke',
      ], ['load-test-summary.json']);
    }
  };

  const addBaseline = () => {
    if (!skipLogin) {
      add('login-progressive', 'k6', ['run', 'test/load/login-load.js'], [
        'test/load/login-load-summary.json',
        'test/load/login-load-report.txt',
      ]);
    }
    if (!skipEnterprise) {
      add('enterprise-baseline', 'k6', [
        'run',
        'test/load/k6-enterprise-scale.js',
        '-e',
        'K6_SCENARIO_PROFILE=baseline',
      ], ['summary.json']);
    }
    if (!skipMulti) {
      add('multi-tenant-baseline', 'k6', [
        'run',
        'test/load/k6-load-test.js',
        '-e',
        'K6_SCENARIO_PROFILE=baseline',
      ], ['load-test-summary.json']);
    }
  };

  const addStress = () => {
    if (!skipLogin) {
      add('login-progressive-stress', 'k6', ['run', 'test/load/login-load.js'], [
        'test/load/login-load-summary.json',
        'test/load/login-load-report.txt',
      ]);
    }
    if (!skipEnterprise) {
      add('enterprise-stress', 'k6', [
        'run',
        'test/load/k6-enterprise-scale.js',
        '-e',
        'K6_SCENARIO_PROFILE=stress',
      ], ['summary.json']);
    }
    if (!skipMulti) {
      add('multi-tenant-stress', 'k6', [
        'run',
        'test/load/k6-load-test.js',
        '-e',
        'K6_SCENARIO_PROFILE=stress',
      ], ['load-test-summary.json']);
    }
    if (includeSoak && !skipLogin) {
      add('login-soak', 'k6', ['run', 'test/load/login-soak.js'], [
        'test/load/login-soak-summary.json',
        'test/load/login-soak-report.txt',
      ]);
    }
  };

  switch (mode) {
    case 'smoke':
      addSmoke();
      break;
    case 'baseline':
      addBaseline();
      break;
    case 'stress':
      addStress();
      break;
    case 'full':
      addSmoke();
      addBaseline();
      addStress();
      break;
    default:
      throw new Error(
        `Modo inválido: ${mode}. Use smoke, baseline, stress ou full.`,
      );
  }

  return steps;
}

function runStep(step, env, runDir) {
  cleanupArtifacts(step.artifactPatterns);
  const safeName = step.name.replace(/[^a-z0-9-]+/gi, '_').toLowerCase();
  const logFile = path.join(runDir, `${safeName}.log`);
  const output = spawnSync(step.command, step.args, {
    cwd: backendRoot,
    env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 1024 * 1024 * 16,
  });

  const stdout = output.stdout || '';
  const stderr = output.stderr || '';
  const combined = [
    `[command] ${formatCommand(step.command, step.args)}`,
    `[exitCode] ${output.status ?? 'null'}`,
    '',
    stdout,
    stderr ? `\n[stderr]\n${stderr}` : '',
  ].join('\n');

  fs.writeFileSync(logFile, combined, 'utf8');

  const artifacts = archiveArtifacts(step.artifactPatterns, runDir, safeName);
  return {
    exitCode: output.status ?? 1,
    logFile,
    artifacts,
  };
}

function archiveArtifacts(patterns, runDir, stepName) {
  const copied = [];
  for (const relative of patterns) {
    const source = path.join(backendRoot, relative);
    if (!fs.existsSync(source)) {
      continue;
    }
    const fileName = `${stepName}--${path.basename(relative)}`;
    const target = path.join(runDir, fileName);
    fs.copyFileSync(source, target);
    copied.push(target);
  }
  return copied;
}

function cleanupArtifacts(patterns) {
  for (const relative of patterns) {
    const file = path.join(backendRoot, relative);
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
    }
  }
}

function writeManifest(runDir, payload) {
  fs.writeFileSync(
    path.join(runDir, 'manifest.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        ...payload,
      },
      null,
      2,
    ),
    'utf8',
  );
}

function resolveUsersFile(explicit) {
  const candidates = [
    explicit,
    path.join(fixturesDir, 'login-users.auth.valid.local.generated.json'),
    path.join(fixturesDir, 'login-users.local.generated.json'),
    path.join(fixturesDir, 'login-users.120.json'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const absolute = path.isAbsolute(candidate)
      ? candidate
      : path.join(backendRoot, candidate);
    if (fs.existsSync(absolute)) {
      return absolute;
    }
  }

  throw new Error(
    'Nenhum arquivo de credenciais encontrado. Defina LOGIN_USERS_FILE ou gere massa em backend/test/load/fixtures.',
  );
}

function loadFirstCredential(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error(`Arquivo de credenciais vazio: ${file}`);
  }

  const first = parsed.find((item) => item && item.cpf && item.password) || parsed[0];
  return {
    cpf: String(first.cpf || '').trim(),
    password: String(first.password || '').trim(),
    companyId: String(first.companyId || '').trim(),
  };
}

async function probeBaseUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toRelativeFromBackend(file) {
  return path.relative(backendRoot, file).replace(/\\/g, '/');
}

function formatCommand(command, args) {
  return [command, ...args].join(' ');
}

function readArgValue(flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return '';
  }
  return argv[index + 1] || '';
}

function hasFlag(flag) {
  return argv.includes(flag);
}

main().catch((error) => {
  console.error(`[load-battery] falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
