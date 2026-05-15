const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

const API_BASE_URL = String(
  process.env.PROD_SMOKE_API_BASE_URL ||
    process.env.API_PUBLIC_URL ||
    'https://api.sgsseguranca.com.br',
).replace(/\/$/, '');

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

function signAdminAccessToken(user) {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) {
    throw new Error('JWT_SECRET ausente no runtime.');
  }

  const opts = { expiresIn: '5m' };
  const issuer = String(process.env.JWT_ISSUER || '').trim();
  const audience = String(process.env.JWT_AUDIENCE || '').trim();
  if (issuer) opts.issuer = issuer;
  if (audience) opts.audience = audience;

  return jwt.sign(
    {
      sub: user.id,
      app_user_id: user.id,
      auth_uid: user.auth_user_id || undefined,
      company_id: user.company_id,
      site_id: user.site_id || undefined,
      profile: { nome: user.profile_nome },
      isAdminGeral: true,
      jti: crypto.randomUUID(),
    },
    secret,
    opts,
  );
}

async function findActiveAdminGeral() {
  const runtimeConnection = await connectRuntimePgClient();
  const client = runtimeConnection.client;
  try {
    const result = await client.query(`
      SELECT u.id,
             u.auth_user_id,
             u.company_id,
             u.site_id,
             p.nome AS profile_nome
        FROM users u
        JOIN profiles p ON p.id = u.profile_id
       WHERE u.status = true
         AND u.deleted_at IS NULL
         AND u.company_id IS NOT NULL
         AND p.nome IN ('Administrador Geral', 'ADMIN_GERAL')
       ORDER BY u.updated_at DESC NULLS LAST
       LIMIT 1
    `);

    if (!result.rows.length) {
      throw new Error('Nenhum ADMIN_GERAL ativo com company_id encontrado.');
    }

    return {
      ...result.rows[0],
      warnings: runtimeConnection.warnings,
      usedInsecureFallback: runtimeConnection.usedInsecureFallback,
    };
  } finally {
    await client.end();
  }
}

async function requestJson(path, accessToken, companyId) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'sgs-admin-tenant-context-smoke/1.0',
  };
  if (companyId) {
    headers['x-company-id'] = companyId;
  }

  const startedAt = Date.now();
  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  const body = await response.json().catch(() => ({}));

  return {
    path,
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    message: body?.message || body?.error || null,
  };
}

async function logout(accessToken) {
  const csrfRes = await fetch(`${API_BASE_URL}/auth/csrf?adminSmoke=logout`, {
    headers: { 'User-Agent': 'sgs-admin-tenant-context-smoke/1.0' },
  });
  const csrfBody = await csrfRes.json().catch(() => ({}));
  const csrfToken =
    typeof csrfBody?.csrfToken === 'string' ? csrfBody.csrfToken.trim() : '';
  const csrfCookie = extractCookie(
    csrfRes.headers.get('set-cookie'),
    'csrf-token',
  );

  const response = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-csrf-token': csrfToken,
      Cookie: csrfCookie,
      'User-Agent': 'sgs-admin-tenant-context-smoke/1.0',
    },
  });
  const body = await response.json().catch(() => ({}));

  return {
    path: '/auth/logout',
    status: response.status,
    ok: response.ok,
    message: body?.message || body?.error || null,
  };
}

async function run() {
  const admin = await findActiveAdminGeral();
  const accessToken = signAdminAccessToken(admin);
  const companyId = admin.company_id;

  const checks = [
    await requestJson('/auth/me', accessToken),
    await requestJson('/dashboard/summary', accessToken),
    await requestJson('/dashboard/summary', accessToken, companyId),
    await requestJson(
      '/dashboard/pending-queue?dateFrom=2026-05-14&dateTo=2026-05-14',
      accessToken,
      companyId,
    ),
    await requestJson('/notifications/unread-count', accessToken, companyId),
    await requestJson('/notifications?page=1&limit=20', accessToken, companyId),
    await requestJson('/companies?page=1&limit=100', accessToken, companyId),
    await requestJson('/sites?page=1&limit=100', accessToken, companyId),
    await requestJson(`/companies/${companyId}`, accessToken, companyId),
    await logout(accessToken),
  ];

  const hardFailures = checks.filter((check, index) => {
    if (index === 1) {
      return check.status !== 401;
    }
    return !check.ok;
  });

  console.log(
    JSON.stringify(
      {
        apiBaseUrl: API_BASE_URL,
        warnings: [
          ...(Array.isArray(admin.warnings) ? admin.warnings : []),
          ...(admin.usedInsecureFallback
            ? ['Conexão executada com fallback TLS (rejectUnauthorized=false).']
            : []),
        ],
        admin: {
          userId: admin.id,
          companyId,
        },
        expectations: {
          '/dashboard/summary sem x-company-id':
            '401 esperado para preservar tenant explícito do ADMIN_GERAL',
        },
        checks,
      },
      null,
      2,
    ),
  );

  if (hardFailures.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
