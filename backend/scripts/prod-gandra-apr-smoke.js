const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const argon2 = require('argon2');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');
const { buildCpfSecurityPayload } = require('./lib/user-cpf-security');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({
  path: path.resolve(__dirname, '../../temp/prod-safe-test-gandra.env'),
});

const API_BASE_URL = String(
  process.env.PROD_SMOKE_API_BASE_URL || 'https://api.sgsseguranca.com.br',
).replace(/\/$/, '');

const TEST_COMPANY_NAME = String(
  process.env.TEST_COMPANY_NAME || 'Gandra Tecnologia',
).trim();
const TEST_COMPANY_ID = String(process.env.TEST_COMPANY_ID || '').trim();
const TEST_DOCUMENT_PREFIX = String(
  process.env.TEST_DOCUMENT_PREFIX || 'TESTE-GANDRA-',
).trim();
const MAX_TEST_DOCUMENTS = Number(process.env.MAX_TEST_DOCUMENTS || 1);
const PRODUCTION_SAFE_TEST_MODE =
  String(process.env.PRODUCTION_SAFE_TEST_MODE || 'true').trim() === 'true';
const DISABLE_EXTERNAL_NOTIFICATIONS =
  String(process.env.DISABLE_EXTERNAL_NOTIFICATIONS || 'true').trim() ===
  'true';
const CLEANUP_TEST_DATA =
  String(process.env.CLEANUP_TEST_DATA || 'false').trim() === 'true';

const TARGET_PROFILE_NAME = 'Técnico de Segurança do Trabalho (TST)';
const SMOKE_USER_NAME = 'K6 TESTE GANDRA APR CONTROLADO';
const SMOKE_USER_EMAIL = 'k6.gandra.apr.smoke@invalid.local';
const SMOKE_USER_FUNCTION = 'TST Smoke Controlado';
const SMOKE_USER_BASE_CPF = '987654320';
const UA = 'sgs-prod-gandra-apr-smoke/1.0';

function assertSafeMode() {
  if (!TEST_COMPANY_ID) throw new Error('TEST_COMPANY_ID ausente. Abortando.');
  if (TEST_COMPANY_NAME !== 'Gandra Tecnologia')
    throw new Error(`TEST_COMPANY_NAME inesperado (${TEST_COMPANY_NAME}).`);
  if (!PRODUCTION_SAFE_TEST_MODE)
    throw new Error('PRODUCTION_SAFE_TEST_MODE=false. Abortando.');
  if (!DISABLE_EXTERNAL_NOTIFICATIONS)
    throw new Error('DISABLE_EXTERNAL_NOTIFICATIONS=false. Abortando.');
  if (CLEANUP_TEST_DATA) throw new Error('CLEANUP_TEST_DATA=true. Abortando.');
  if (!Number.isFinite(MAX_TEST_DOCUMENTS) || MAX_TEST_DOCUMENTS !== 1)
    throw new Error('MAX_TEST_DOCUMENTS deve ser exatamente 1.');
}

function digitsOnly(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .trim();
}

function computeCpfCheckDigits(baseNineDigits) {
  const digits = digitsOnly(baseNineDigits).split('').map(Number);
  if (digits.length !== 9) throw new Error('Base de CPF inválida.');
  let d1 =
    11 - (digits.reduce((a, d, i) => a + d * (10 - i), 0) % 11);
  if (d1 >= 10) d1 = 0;
  let d2 =
    11 -
    ([...digits, d1].reduce((a, d, i) => a + d * (11 - i), 0) % 11);
  if (d2 >= 10) d2 = 0;
  return `${digits.join('')}${d1}${d2}`;
}

function maskId(value) {
  const t = String(value || '').trim();
  if (!t) return null;
  if (t.length <= 8) return `${t.slice(0, 2)}***`;
  return `${t.slice(0, 6)}***${t.slice(-4)}`;
}

function maskEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const visible = Math.min(4, Math.max(2, local.length));
  return `${local.slice(0, visible)}***@${domain}`;
}

function extractCookie(setCookieHeader, cookieName) {
  if (!setCookieHeader) return '';
  const chunks = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : String(setCookieHeader).split(/,(?=[^;]+?=)/g);
  let last = '';
  for (const chunk of chunks) {
    const match = String(chunk)
      .trim()
      .match(new RegExp(`^${cookieName}=([^;]+)`));
    if (match && match[1]) last = `${cookieName}=${match[1]}`;
  }
  return last;
}

function buildSmokeDocumentNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${TEST_DOCUMENT_PREFIX}APR-${stamp}-001`;
}

function getReportPaths(documentNumber) {
  const safeName = documentNumber.replace(/[^A-Z0-9_-]/gi, '_');
  const tempDir = path.resolve(__dirname, '../temp');
  fs.mkdirSync(tempDir, { recursive: true });
  return { tempDir, jsonPath: path.join(tempDir, `${safeName}.json`) };
}

async function getMutationCsrfHeaders() {
  const res = await fetch(`${API_BASE_URL}/auth/csrf`, {
    headers: { 'User-Agent': UA },
  });
  const body = await res.json().catch(() => ({}));
  const token =
    typeof body?.csrfToken === 'string' ? body.csrfToken.trim() : '';
  const cookie = extractCookie(res.headers.get('set-cookie'), 'csrf-token');
  if (!res.ok || !token || !cookie)
    throw new Error(`Falha CSRF mutação. status=${res.status}`);
  return { 'x-csrf-token': token, Cookie: cookie };
}

async function requestJson(pathname, accessToken, options = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': UA,
    ...(options.headers || {}),
  };
  if (options.includeCsrf)
    Object.assign(headers, await getMutationCsrfHeaders());
  if (options.companyId) headers['x-company-id'] = options.companyId;
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text || null;
  }
  return { status: response.status, ok: response.ok, body };
}

async function login(cpf, password) {
  const csrfRes = await fetch(`${API_BASE_URL}/auth/csrf`, {
    headers: { 'User-Agent': UA },
  });
  const csrfBody = await csrfRes.json().catch(() => ({}));
  const csrfToken =
    typeof csrfBody?.csrfToken === 'string' ? csrfBody.csrfToken.trim() : '';
  const csrfCookie = extractCookie(
    csrfRes.headers.get('set-cookie'),
    'csrf-token',
  );
  if (!csrfRes.ok || !csrfToken || !csrfCookie)
    throw new Error(`Falha ao obter CSRF. status=${csrfRes.status}`);
  const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'x-csrf-token': csrfToken,
      Cookie: csrfCookie,
    },
    body: JSON.stringify({ cpf, password }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok || typeof loginBody?.accessToken !== 'string')
    throw new Error(
      `Falha no login. status=${loginRes.status} body=${JSON.stringify(loginBody)}`,
    );
  return { accessToken: loginBody.accessToken, user: loginBody.user || null };
}

async function pickTargetSite(client) {
  const r = await client.query(
    `SELECT id, nome FROM sites WHERE company_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC, id ASC LIMIT 1`,
    [TEST_COMPANY_ID],
  );
  if (!r.rows.length) throw new Error('Nenhum site ativo para a empresa.');
  return r.rows[0];
}

async function resolveProfileId(client) {
  const r = await client.query(
    `SELECT id FROM profiles WHERE nome = $1 LIMIT 1`,
    [TARGET_PROFILE_NAME],
  );
  if (!r.rows.length) throw new Error(`Perfil não encontrado: ${TARGET_PROFILE_NAME}`);
  return r.rows[0].id;
}

async function assertTargetCompany(client) {
  const r = await client.query(
    `SELECT id, razao_social FROM companies WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [TEST_COMPANY_ID],
  );
  if (r.rows.length !== 1)
    throw new Error(`Empresa alvo não encontrada (${TEST_COMPANY_ID}).`);
  if (String(r.rows[0].razao_social).trim() !== TEST_COMPANY_NAME)
    throw new Error(`Empresa não corresponde ao nome (${TEST_COMPANY_NAME}).`);
  return r.rows[0];
}

async function findResumableApr(client, numero) {
  const r = await client.query(
    `SELECT id, status, pdf_file_key FROM aprs WHERE company_id = $1 AND numero = $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [TEST_COMPANY_ID, numero],
  );
  return r.rows[0] || null;
}

async function reconcileSmokeUser(client, siteId) {
  const profileId = await resolveProfileId(client);
  const smokePassword = `Tmp!${crypto.randomUUID()}Aa9`;
  const smokeCpf = computeCpfCheckDigits(SMOKE_USER_BASE_CPF);
  const cpfPayload = buildCpfSecurityPayload(smokeCpf);
  const passwordHash = await argon2.hash(smokePassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await client.query('BEGIN');
  try {
    const existing = await client.query(
      `SELECT id, company_id FROM users WHERE lower(email) = lower($1) OR cpf_hash = $2 LIMIT 1`,
      [SMOKE_USER_EMAIL, cpfPayload.cpf_hash],
    );
    let userId = null;
    if (existing.rows.length > 0) {
      if (existing.rows[0].company_id !== TEST_COMPANY_ID)
        throw new Error('Usuário técnico já existe em outro tenant. Abortando.');
      userId = existing.rows[0].id;
      await client.query(
        `UPDATE users SET nome=$2, cpf=NULL, cpf_hash=$3, cpf_ciphertext=$4, email=$5, funcao=$6, password=$7, status=true, ai_processing_consent=false, company_id=$8, site_id=$9, profile_id=$10, deleted_at=NULL, updated_at=now() WHERE id=$1`,
        [userId, SMOKE_USER_NAME, cpfPayload.cpf_hash, cpfPayload.cpf_ciphertext, SMOKE_USER_EMAIL, SMOKE_USER_FUNCTION, passwordHash, TEST_COMPANY_ID, siteId, profileId],
      );
    } else {
      userId = crypto.randomUUID();
      await client.query(
        `INSERT INTO users (id,nome,cpf,cpf_hash,cpf_ciphertext,email,funcao,password,status,ai_processing_consent,company_id,site_id,profile_id,created_at,updated_at) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,true,false,$8,$9,$10,now(),now())`,
        [userId, SMOKE_USER_NAME, cpfPayload.cpf_hash, cpfPayload.cpf_ciphertext, SMOKE_USER_EMAIL, SMOKE_USER_FUNCTION, passwordHash, TEST_COMPANY_ID, siteId, profileId],
      );
    }
    await client.query(
      `INSERT INTO user_sites (user_id, site_id, company_id, created_at) VALUES ($1,$2,$3,now()) ON CONFLICT DO NOTHING`,
      [userId, siteId, TEST_COMPANY_ID],
    );
    // Sincroniza user_roles a partir do perfil (o fluxo real de criação de
    // usuário chama rbacService.syncUserRoleFromProfileName; o INSERT direto
    // aqui não, então o usuário ficava sem role e caía no fallback de permissões
    // — que não concede can_approve_apr. Espelhamos o comportamento real.
    await client.query(
      `DELETE FROM user_roles WHERE user_id = $1::uuid`,
      [userId],
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
         SELECT $1::uuid, id FROM roles WHERE name = $2 LIMIT 1`,
      [userId, TARGET_PROFILE_NAME],
    );
    await client.query('COMMIT');
    // Invalida o cache RBAC do usuário (rbac:access:<id>, TTL 120s) para que a
    // resolução de permissões releia user_roles imediatamente.
    if (process.env.REDIS_CACHE_URL) {
      try {
        const IORedis = require('ioredis');
        const redis = new IORedis(process.env.REDIS_CACHE_URL, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });
        await redis.connect();
        await redis.del(`rbac:access:${userId}`);
        await redis.quit();
      } catch {
        // best-effort
      }
    }
    return { userId, smokeCpf, smokePassword };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

function buildCreateAprPayload(siteId, userId, numero) {
  const now = new Date();
  const start = new Date(now.getTime() + 10 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    numero,
    titulo: `${numero} APR smoke controlado`,
    descricao:
      'Documento de teste controlado em produção. Sem assinatura real. Sem integração externa. Dados sintéticos.',
    tipo_atividade: 'Teste documental controlado',
    frente_trabalho: 'Frente de teste SGS',
    area_risco: 'Área de validação técnica',
    data_inicio: start.toISOString(),
    data_fim: end.toISOString(),
    site_id: siteId,
    elaborador_id: userId,
    probability: 1,
    severity: 1,
    exposure: 1,
    residual_risk: 'LOW',
    itens_risco: [
      {
        etapa: 'Etapa de teste controlado',
        perigo: 'Perigo sintético para validação documental',
        risco: 'Risco de teste (sem execução operacional)',
        medidas_controle: 'Medida de controle sintética para smoke test',
        probabilidade: 1,
        severidade: 1,
        exposicao: 1,
      },
    ],
  };
}

async function verifyAprDatabaseState(client, aprId) {
  const apr = await client.query(
    `SELECT id, numero, status, company_id, site_id, elaborador_id, aprovado_por_id, pdf_file_key FROM aprs WHERE id = $1`,
    [aprId],
  );
  const site = await client.query(
    `SELECT company_id FROM sites WHERE id = $1`,
    [apr.rows[0]?.site_id],
  );
  const reg = await client.query(
    `SELECT id, company_id, document_code, file_hash IS NOT NULL AS has_hash, status FROM document_registry WHERE module = 'apr' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [aprId],
  );
  return {
    apr: apr.rows[0] || null,
    siteCompanyId: site.rows[0]?.company_id || null,
    registry: reg.rows[0] || null,
  };
}

async function run() {
  assertSafeMode();
  const conn = await connectRuntimePgClient();
  const client = conn.client;
  const numero = buildSmokeDocumentNumber();
  const warnings = [];

  try {
    await client.query(`SELECT set_config('app.is_super_admin','true',false)`);
    const company = await assertTargetCompany(client);
    const site = await pickTargetSite(client);
    let resumable = await findResumableApr(client, numero);
    if (resumable)
      warnings.push(`resuming_existing_apr:${maskId(resumable.id)} status=${resumable.status}`);

    const smokeUser = await reconcileSmokeUser(client, site.id);
    const session = await login(smokeUser.smokeCpf, smokeUser.smokePassword);

    const me = await requestJson('/auth/me', session.accessToken, {
      companyId: TEST_COMPANY_ID,
    });
    if (!me.ok) throw new Error(`/auth/me falhou. status=${me.status}`);

    let aprId = resumable?.id || null;
    let currentStatus = resumable?.status || null;
    let hasPdfAlready = Boolean(resumable?.pdf_file_key);
    let created = null;

    if (!aprId) {
      created = await requestJson('/aprs', session.accessToken, {
        method: 'POST',
        companyId: TEST_COMPANY_ID,
        includeCsrf: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCreateAprPayload(site.id, smokeUser.userId, numero)),
      });
      if (created.ok && created.body?.id) {
        aprId = created.body.id;
        currentStatus = created.body.status || null;
      } else {
        throw new Error(
          `Criação da APR falhou. status=${created.status} body=${JSON.stringify(created.body)}`,
        );
      }
    }

    // Aprovação (Pendente → Aprovada). PATCH é a rota canônica.
    let approved = null;
    const PAST_APPROVAL = new Set(['Aprovada', 'Encerrada']);
    if (!PAST_APPROVAL.has(currentStatus)) {
      approved = await requestJson(`/aprs/${aprId}/approve`, session.accessToken, {
        method: 'PATCH',
        companyId: TEST_COMPANY_ID,
        includeCsrf: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Smoke test controlado em produção. Sem assinatura real.',
        }),
      });
      if (!approved.ok) {
        throw new Error(
          `Aprovação da APR falhou. status=${approved.status} body=${JSON.stringify(approved.body)}`,
        );
      }
      currentStatus = approved.body?.status || currentStatus;
    } else {
      warnings.push(`apr_already_${String(currentStatus).toLowerCase()}`);
    }

    // Geração do PDF final governado (server-side, Puppeteer). Substitui o
    // anexo manual (descontinuado). Passa pela mesma governança/hash/registry.
    let generated = null;
    if (!hasPdfAlready) {
      generated = await requestJson(
        `/aprs/${aprId}/generate-final-pdf`,
        session.accessToken,
        {
          method: 'POST',
          companyId: TEST_COMPANY_ID,
          includeCsrf: true,
          headers: { 'Content-Type': 'application/json' },
        },
      );
      if (!generated.ok) {
        throw new Error(
          `Geração do PDF final da APR falhou. status=${generated.status} body=${JSON.stringify(generated.body)}`,
        );
      }
    } else {
      warnings.push('apr_pdf_already_generated');
    }

    const pdfAccess = await requestJson(`/aprs/${aprId}/pdf`, session.accessToken, {
      companyId: TEST_COMPANY_ID,
    });

    const db = await verifyAprDatabaseState(client, aprId);

    const report = {
      apiBaseUrl: API_BASE_URL,
      warnings,
      company: { name: TEST_COMPANY_NAME, id: maskId(company.id), siteId: maskId(site.id) },
      smokeUser: { id: maskId(smokeUser.userId), profile: TARGET_PROFILE_NAME, email: maskEmail(SMOKE_USER_EMAIL) },
      apr: {
        id: maskId(aprId),
        numero,
        status: currentStatus,
        resumed: Boolean(resumable),
      },
      generation: {
        status: generated?.status || null,
        ok: generated?.ok ?? null,
      },
      storage: {
        pdfAccessStatus: pdfAccess.status,
        availability: pdfAccess.body?.availability || null,
        hasFinalPdf: Boolean(pdfAccess.body?.hasFinalPdf),
      },
      database: {
        aprId: maskId(db.apr?.id),
        aprCompanyId: maskId(db.apr?.company_id),
        siteCompanyId: maskId(db.siteCompanyId),
        aprovadorId: maskId(db.apr?.aprovado_por_id),
        hasPdfKey: Boolean(db.apr?.pdf_file_key),
        documentRegistryId: maskId(db.registry?.id),
        documentRegistryCompanyId: maskId(db.registry?.company_id),
        documentCode: db.registry?.document_code || null,
        registryHasHash: db.registry?.has_hash ?? null,
        registryStatus: db.registry?.status || null,
      },
      safeguards: {
        productionSafeTestMode: PRODUCTION_SAFE_TEST_MODE,
        disableExternalNotifications: DISABLE_EXTERNAL_NOTIFICATIONS,
        cleanupTestData: CLEANUP_TEST_DATA,
        maxTestDocuments: MAX_TEST_DOCUMENTS,
      },
    };

    const paths = getReportPaths(numero);
    fs.writeFileSync(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
