const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

const API_BASE_URL = String(
  process.env.PROD_SMOKE_API_BASE_URL ||
    process.env.API_PUBLIC_URL ||
    'https://api.sgsseguranca.com.br',
).replace(/\/$/, '');

const COMPANY_NAME = String(
  process.env.PROD_SMOKE_COMPANY_NAME || 'SGS Smoke Monitoring',
);
const COMPANY_CNPJ = String(
  process.env.PROD_SMOKE_COMPANY_CNPJ || '99000000000191',
).trim();
const USER_EMAIL = String(
  process.env.PROD_SMOKE_USER_EMAIL || 'smoke-dashboard@sgsseguranca.com.br',
)
  .trim()
  .toLowerCase();
const USER_NAME = String(
  process.env.PROD_SMOKE_USER_NAME || 'Smoke Dashboard',
).trim();
const USER_ROLE_NAME = String(
  process.env.PROD_SMOKE_PROFILE_NAME || 'Administrador da Empresa',
).trim();
const USER_PASSWORD = String(
  process.env.PROD_SMOKE_PASSWORD || 'SgsSmokeDash2026!',
).trim();

function digitsOnly(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .trim();
}

function computeCpfCheckDigits(baseNineDigits) {
  const digits = digitsOnly(baseNineDigits).split('').map(Number);
  if (digits.length !== 9) {
    throw new Error('Base de CPF invalida para geracao do smoke.');
  }

  let firstDigit =
    11 -
    (digits.reduce((acc, digit, index) => acc + digit * (10 - index), 0) % 11);
  if (firstDigit >= 10) {
    firstDigit = 0;
  }

  let secondDigit =
    11 -
    ([...digits, firstDigit].reduce(
      (acc, digit, index) => acc + digit * (11 - index),
      0,
    ) %
      11);
  if (secondDigit >= 10) {
    secondDigit = 0;
  }

  return `${digits.join('')}${firstDigit}${secondDigit}`;
}

function isValidCpf(value) {
  const cpf = digitsOnly(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  return computeCpfCheckDigits(cpf.slice(0, 9)) === cpf;
}

const USER_CPF = (() => {
  const rawCpf = digitsOnly(process.env.PROD_SMOKE_USER_CPF);
  if (!rawCpf) {
    return computeCpfCheckDigits('123456789');
  }
  if (!isValidCpf(rawCpf)) {
    throw new Error('PROD_SMOKE_USER_CPF invalido. Informe um CPF valido.');
  }
  return rawCpf;
})();

function assertEnv() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL ausente no ambiente do runtime.');
  }
  if (!USER_PASSWORD) {
    throw new Error('PROD_SMOKE_PASSWORD inválido.');
  }
}

async function reconcileSmokePrincipal() {
  const runtimeConnection = await connectRuntimePgClient();
  const client = runtimeConnection.client;
  try {
    await client.query(
      `SELECT set_config('app.is_super_admin', 'true', false)`,
    );
    await client.query('BEGIN');

    const profileRes = await client.query(
      `SELECT id FROM profiles WHERE nome = $1 LIMIT 1`,
      [USER_ROLE_NAME],
    );
    if (!profileRes.rows.length) {
      throw new Error(`Perfil não encontrado: ${USER_ROLE_NAME}`);
    }
    const profileId = profileRes.rows[0].id;

    let companyId;
    const companyRes = await client.query(
      `SELECT id
         FROM companies
        WHERE cnpj = $1
           OR lower(razao_social) = lower($2)
        LIMIT 1`,
      [COMPANY_CNPJ, COMPANY_NAME],
    );

    if (!companyRes.rows.length) {
      companyId = crypto.randomUUID();
      await client.query(
        `INSERT INTO companies (
           id, razao_social, cnpj, endereco, responsavel, email_contato,
           status, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           true, now(), now()
         )`,
        [
          companyId,
          COMPANY_NAME,
          COMPANY_CNPJ,
          'Tenant técnico isolado para smoke de produção',
          'Operação SGS',
          USER_EMAIL,
        ],
      );
    } else {
      companyId = companyRes.rows[0].id;
      await client.query(
        `UPDATE companies
            SET razao_social = $2,
                endereco = $3,
                responsavel = $4,
                email_contato = $5,
                status = true,
                deleted_at = NULL,
                updated_at = now()
          WHERE id = $1`,
        [
          companyId,
          COMPANY_NAME,
          'Tenant técnico isolado para smoke de produção',
          'Operação SGS',
          USER_EMAIL,
        ],
      );
    }

    const passwordHash = bcrypt.hashSync(USER_PASSWORD, 10);
    const userRes = await client.query(
      `SELECT id
         FROM users
        WHERE lower(email) = lower($1)
           OR cpf = $2
        LIMIT 1`,
      [USER_EMAIL, USER_CPF],
    );

    let userId;
    if (!userRes.rows.length) {
      userId = crypto.randomUUID();
      await client.query(
        `INSERT INTO users (
           id, nome, cpf, email, funcao, password,
           status, ai_processing_consent, company_id, site_id, profile_id,
           created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           true, false, $7, NULL, $8,
           now(), now()
         )`,
        [
          userId,
          USER_NAME,
          USER_CPF,
          USER_EMAIL,
          'Monitoramento Técnico',
          passwordHash,
          companyId,
          profileId,
        ],
      );
    } else {
      userId = userRes.rows[0].id;
      await client.query(
        `UPDATE users
            SET nome = $2,
                cpf = $3,
                email = $4,
                funcao = $5,
                password = $6,
                status = true,
                ai_processing_consent = false,
                company_id = $7,
                site_id = NULL,
                profile_id = $8,
                deleted_at = NULL,
                updated_at = now()
          WHERE id = $1`,
        [
          userId,
          USER_NAME,
          USER_CPF,
          USER_EMAIL,
          'Monitoramento Técnico',
          passwordHash,
          companyId,
          profileId,
        ],
      );
    }

    await client.query('COMMIT');
    return {
      companyId,
      userId,
      warnings: runtimeConnection.warnings,
      usedInsecureFallback: runtimeConnection.usedInsecureFallback,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

function extractCookie(setCookieHeader, cookieName) {
  if (!setCookieHeader) return '';
  const chunks = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : String(setCookieHeader).split(/,(?=[^;]+?=)/g);

  let lastNonEmptyCookie = '';
  for (const chunk of chunks) {
    const trimmed = String(chunk).trim();
    if (trimmed.toLowerCase().startsWith(`${cookieName.toLowerCase()}=`)) {
      const cookie = trimmed.split(';', 1)[0];
      const value = cookie.slice(cookieName.length + 1).trim();
      if (value) {
        lastNonEmptyCookie = cookie;
      }
    }
  }
  return lastNonEmptyCookie;
}

async function login() {
  const csrfRes = await fetch(`${API_BASE_URL}/auth/csrf`, {
    headers: { 'User-Agent': 'sgs-prod-dashboard-smoke/1.0' },
  });
  const csrfBody = await csrfRes.json().catch(() => ({}));
  const csrfToken =
    typeof csrfBody?.csrfToken === 'string' ? csrfBody.csrfToken.trim() : '';
  const csrfCookie = extractCookie(
    csrfRes.headers.get('set-cookie'),
    'csrf-token',
  );

  if (!csrfRes.ok || !csrfToken || !csrfCookie) {
    throw new Error(
      `Falha ao obter CSRF. status=${csrfRes.status} token=${Boolean(
        csrfToken,
      )} cookie=${Boolean(csrfCookie)}`,
    );
  }

  const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'sgs-prod-dashboard-smoke/1.0',
      'x-csrf-token': csrfToken,
      Cookie: csrfCookie,
    },
    body: JSON.stringify({
      cpf: USER_CPF,
      password: USER_PASSWORD,
    }),
  });

  const loginBody = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok || typeof loginBody?.accessToken !== 'string') {
    throw new Error(
      `Falha no login. status=${loginRes.status} body=${JSON.stringify(
        loginBody,
      )}`,
    );
  }

  return {
    accessToken: loginBody.accessToken,
    user: loginBody.user || null,
  };
}

async function requestJson(path, accessToken) {
  const startedAt = Date.now();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'sgs-prod-dashboard-smoke/1.0',
    },
  });
  const body = await response.json().catch(() => ({}));
  return {
    path,
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    body,
  };
}

function summarizeDocumentPendencies(body) {
  return {
    degraded: Boolean(body?.degraded),
    failedSources: Array.isArray(body?.failedSources) ? body.failedSources : [],
    total: body?.summary?.total ?? null,
    items: Array.isArray(body?.items) ? body.items.length : null,
  };
}

function summarizeMeta(body) {
  const meta = body?.meta;
  return meta && typeof meta === 'object'
    ? {
        generatedAt: meta.generatedAt || null,
        stale: Boolean(meta.stale),
        source: meta.source || null,
      }
    : null;
}

async function run() {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });

  assertEnv();

  const principal = await reconcileSmokePrincipal();
  const session = await login();

  const checks = await Promise.all([
    requestJson('/dashboard/summary', session.accessToken),
    requestJson('/dashboard/kpis', session.accessToken),
    requestJson('/dashboard/pending-queue', session.accessToken),
    requestJson('/dashboard/document-pendencies', session.accessToken),
  ]);

  const failures = checks.filter((item) => !item.ok);
  const report = {
    apiBaseUrl: API_BASE_URL,
    warnings: [
      ...(Array.isArray(principal.warnings) ? principal.warnings : []),
      ...(principal.usedInsecureFallback
        ? ['Conexão executada com fallback TLS (rejectUnauthorized=false).']
        : []),
    ],
    smokePrincipal: {
      companyId: principal.companyId,
      userId: principal.userId,
      userEmail: USER_EMAIL,
      userCpf: USER_CPF,
      profile: USER_ROLE_NAME,
    },
    auth: {
      userId: session.user?.id || null,
      companyId: session.user?.company_id || null,
    },
    endpoints: checks.map((item) => {
      if (item.path === '/dashboard/document-pendencies') {
        return {
          path: item.path,
          status: item.status,
          durationMs: item.durationMs,
          summary: summarizeDocumentPendencies(item.body),
        };
      }

      return {
        path: item.path,
        status: item.status,
        durationMs: item.durationMs,
        meta: summarizeMeta(item.body),
      };
    }),
  };

  console.log(JSON.stringify(report, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
