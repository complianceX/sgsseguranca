/**
 * Smoke test controlado de emissão de DDS em produção (empresa Gandra).
 *
 * Fluxo validado (espelha o app real):
 *   1. Cria DDS operacional (POST /dds)
 *   2. Assina o participante (PUT /dds/:id/signatures)
 *   3. Publica o DDS (PATCH /dds/:id/status → publicado)
 *   4. Inicializa fluxo de aprovação com etapa única do perfil do usuário
 *      (POST /dds/:id/approvals/initialize)
 *   5. Aprova a etapa com PIN (POST /dds/:id/approvals/:approvalId/approve)
 *      → status vira "auditado" automaticamente
 *   6. Anexa PDF final governado (POST /dds/:id/file)
 *   7. Confere acesso ao PDF (GET /dds/:id/pdf), estado do banco
 *      (dds + document_registry) e validação pública
 *      (GET /public/documents/validate?code=...)
 *
 * Salvaguardas idênticas aos smokes de PT/APR: exige env de teste seguro
 * (temp/prod-safe-test-gandra.env), prefixo TESTE-GANDRA-, máx. 1 documento.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const argon2 = require('argon2');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
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

const IS_LOADTEST_TARGET =
  process.env.APP_ENV === 'loadtest' || API_BASE_URL === 'http://127.0.0.1:3001';
const EXPECTED_TEST_COMPANY_NAME = IS_LOADTEST_TARGET
  ? 'SGS_LOADTEST_SYNTHETIC Empresa'
  : 'Gandra Tecnologia';

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

// Perfil que satisfaz a etapa única de aprovação do smoke e o PIN de decisão.
const TARGET_PROFILE_NAME = 'Administrador da Empresa';
const SMOKE_USER_NAME = 'K6 TESTE GANDRA DDS CONTROLADO';
const SMOKE_USER_EMAIL = 'k6.gandra.dds.smoke@invalid.local';
const SMOKE_USER_FUNCTION = 'TST Smoke Controlado';
const SMOKE_USER_BASE_CPF = '987654319';
const SMOKE_PIN = '1234';
const UA = 'sgs-prod-gandra-dds-smoke/1.0';

function assertSafeMode() {
  if (!TEST_COMPANY_ID) throw new Error('TEST_COMPANY_ID ausente. Abortando.');
  if (TEST_COMPANY_NAME !== EXPECTED_TEST_COMPANY_NAME)
    throw new Error(`TEST_COMPANY_NAME inesperado (${TEST_COMPANY_NAME}).`);
  if (IS_LOADTEST_TARGET && API_BASE_URL !== 'http://127.0.0.1:3001')
    throw new Error('Alvo loadtest deve usar a API local do container. Abortando.');
  if (!IS_LOADTEST_TARGET && API_BASE_URL !== 'https://api.sgsseguranca.com.br')
    throw new Error('Alvo fora do loadtest não é a API de produção autorizada. Abortando.');
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
  let d1 = 11 - (digits.reduce((a, d, i) => a + d * (10 - i), 0) % 11);
  if (d1 >= 10) d1 = 0;
  let d2 =
    11 - ([...digits, d1].reduce((a, d, i) => a + d * (11 - i), 0) % 11);
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
  const email = String(value || '')
    .trim()
    .toLowerCase();
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
    const trimmed = String(chunk).trim();
    if (trimmed.toLowerCase().startsWith(`${cookieName.toLowerCase()}=`)) {
      const cookie = trimmed.split(';', 1)[0];
      if (cookie.slice(cookieName.length + 1).trim()) last = cookie;
    }
  }
  return last;
}

function buildSmokeTema() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${TEST_DOCUMENT_PREFIX}${stamp}-DDS-001`;
}

function getReportPaths(tema) {
  const safeName = tema.replace(/[^A-Z0-9_-]/gi, '_');
  const tempDir = path.resolve(__dirname, '../temp');
  fs.mkdirSync(tempDir, { recursive: true });
  return {
    tempDir,
    pdfPath: path.join(tempDir, `${safeName}.pdf`),
    jsonPath: path.join(tempDir, `${safeName}.json`),
  };
}

async function getMutationCsrfHeaders() {
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
  if (!csrfRes.ok || !csrfToken || !csrfCookie) {
    throw new Error(`Falha ao obter CSRF para mutação. status=${csrfRes.status}`);
  }
  return { 'x-csrf-token': csrfToken, Cookie: csrfCookie };
}

async function requestJson(pathname, accessToken, options = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': UA,
    ...(options.headers || {}),
  };
  if (options.includeCsrf) {
    Object.assign(headers, await getMutationCsrfHeaders());
  }
  if (options.companyId) {
    headers['x-company-id'] = options.companyId;
  }
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
  const csrf = await getMutationCsrfHeaders();
  const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      ...csrf,
    },
    body: JSON.stringify({ cpf, password }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok || typeof loginBody?.accessToken !== 'string') {
    throw new Error(
      `Falha no login. status=${loginRes.status} body=${JSON.stringify(loginBody)}`,
    );
  }
  return { accessToken: loginBody.accessToken, user: loginBody.user || null };
}

async function assertTargetCompany(client) {
  const companyRes = await client.query(
    `SELECT id, razao_social, status, account_status
       FROM companies
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [TEST_COMPANY_ID],
  );
  if (companyRes.rows.length !== 1)
    throw new Error(`Empresa alvo não encontrada (${maskId(TEST_COMPANY_ID)}).`);
  const company = companyRes.rows[0];
  if (String(company.razao_social).trim() !== TEST_COMPANY_NAME)
    throw new Error('Empresa do ID informado não corresponde ao nome esperado.');
  return company;
}

async function pickTargetSite(client) {
  const siteRes = await client.query(
    `SELECT id, nome
       FROM sites
      WHERE company_id = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
      LIMIT 1`,
    [TEST_COMPANY_ID],
  );
  if (!siteRes.rows.length)
    throw new Error('Nenhum site ativo encontrado para a empresa de teste.');
  return siteRes.rows[0];
}

async function resolveProfileId(client) {
  const profileRes = await client.query(
    `SELECT id FROM profiles WHERE nome = $1 LIMIT 1`,
    [TARGET_PROFILE_NAME],
  );
  if (!profileRes.rows.length)
    throw new Error(`Perfil não encontrado: ${TARGET_PROFILE_NAME}`);
  return profileRes.rows[0].id;
}

async function findResumableDds(client, tema) {
  const rows = await client.query(
    `SELECT id, tema, status, pdf_file_key
       FROM dds
      WHERE company_id = $1
        AND deleted_at IS NULL
        AND is_modelo = false
        AND tema LIKE $2
      ORDER BY created_at DESC`,
    [TEST_COMPANY_ID, `${TEST_DOCUMENT_PREFIX}%`],
  );
  if (rows.rows.length >= MAX_TEST_DOCUMENTS) {
    const exact = rows.rows.find((row) => row.tema === tema);
    if (rows.rows.length === 1 && exact) return exact;
    throw new Error(
      `Já existe ${rows.rows.length} DDS de teste com prefixo ${TEST_DOCUMENT_PREFIX}. Abortando.`,
    );
  }
  return rows.rows.find((row) => row.tema === tema) || null;
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
    const existingRes = await client.query(
      `SELECT id, company_id FROM users
        WHERE lower(email) = lower($1) OR cpf_hash = $2
        LIMIT 1`,
      [SMOKE_USER_EMAIL, cpfPayload.cpf_hash],
    );

    let userId = null;
    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      if (existing.company_id !== TEST_COMPANY_ID) {
        throw new Error(
          `Usuário smoke já existe em outro tenant (${maskId(existing.company_id)}).`,
        );
      }
      userId = existing.id;
      await client.query(
        `UPDATE users
            SET nome = $2, cpf = NULL, cpf_hash = $3, cpf_ciphertext = $4,
                email = $5, funcao = $6, password = $7, status = true,
                ai_processing_consent = false, company_id = $8, site_id = $9,
                profile_id = $10, deleted_at = NULL, updated_at = now()
          WHERE id = $1`,
        [
          userId,
          SMOKE_USER_NAME,
          cpfPayload.cpf_hash,
          cpfPayload.cpf_ciphertext,
          SMOKE_USER_EMAIL,
          SMOKE_USER_FUNCTION,
          passwordHash,
          TEST_COMPANY_ID,
          siteId,
          profileId,
        ],
      );
    } else {
      userId = crypto.randomUUID();
      await client.query(
        `INSERT INTO users (
            id, nome, cpf, cpf_hash, cpf_ciphertext, email, funcao, password,
            status, ai_processing_consent, company_id, site_id, profile_id,
            created_at, updated_at
         ) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,true,false,$8,$9,$10,now(),now())`,
        [
          userId,
          SMOKE_USER_NAME,
          cpfPayload.cpf_hash,
          cpfPayload.cpf_ciphertext,
          SMOKE_USER_EMAIL,
          SMOKE_USER_FUNCTION,
          passwordHash,
          TEST_COMPANY_ID,
          siteId,
          profileId,
        ],
      );
    }

    await client.query(
      `INSERT INTO user_sites (user_id, site_id, company_id, created_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT DO NOTHING`,
      [userId, siteId, TEST_COMPANY_ID],
    );

    // PIN de assinatura (necessário para approve com PIN e assinaturas hmac).
    const pinHash = await argon2.hash(SMOKE_PIN, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await client.query(
      `UPDATE users SET signature_pin_hash = $2, signature_pin_salt = $3 WHERE id = $1`,
      [userId, pinHash, crypto.randomBytes(32).toString('hex')],
    );

    await client.query('COMMIT');

    // Invalida cache RBAC para releitura imediata de roles.
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
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function buildSmokePdfBuffer(params) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 40,
    y: 760,
    width: 515,
    height: 48,
    color: rgb(0.95, 0.97, 1),
  });
  page.drawText('SGS - DDS Smoke Test Controlado', {
    x: 52,
    y: 788,
    size: 18,
    font: bold,
    color: rgb(0.1, 0.2, 0.45),
  });
  page.drawText('NAO UTILIZAR OPERACIONALMENTE', {
    x: 52,
    y: 770,
    size: 12,
    font: bold,
    color: rgb(0.75, 0.1, 0.1),
  });

  const lines = [
    `Empresa: ${TEST_COMPANY_NAME}`,
    `Tema: ${params.tema}`,
    `DDS ID: ${params.ddsId}`,
    `Site ID mascarado: ${maskId(params.siteId)}`,
    `Usuario tecnico: ${maskEmail(SMOKE_USER_EMAIL)}`,
    'Conteudo: teste controlado sem assinatura real e sem integracoes externas.',
    'Observacao: documento persistido apenas para validacao tecnica.',
  ];

  let y = 720;
  for (const line of lines) {
    page.drawText(line, {
      x: 52,
      y,
      size: 12,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
    y -= 24;
  }

  return Buffer.from(await pdf.save());
}

async function attachPdf(accessToken, ddsId, pdfBuffer, fileName) {
  const csrfHeaders = await getMutationCsrfHeaders();
  const form = new FormData();
  form.set('file', new File([pdfBuffer], fileName, { type: 'application/pdf' }));
  const response = await fetch(`${API_BASE_URL}/dds/${ddsId}/file`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': UA,
      'x-company-id': TEST_COMPANY_ID,
      ...csrfHeaders,
    },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, body };
}

async function verifyDatabaseState(client, ddsId) {
  const ddsRes = await client.query(
    `SELECT d.id, d.tema, d.status, d.company_id, d.site_id,
            d.facilitador_id, d.auditado_por_id, d.pdf_file_key,
            d.document_code, d.final_pdf_hash_sha256,
            s.company_id AS site_company_id
       FROM dds d
       JOIN sites s ON s.id = d.site_id
      WHERE d.id = $1 AND d.deleted_at IS NULL`,
    [ddsId],
  );
  if (ddsRes.rows.length !== 1)
    throw new Error('DDS criado não encontrado para verificação final.');

  const registryRes = await client.query(
    `SELECT id, company_id, module, entity_id, document_code, file_key,
            file_hash, original_name, status
       FROM document_registry
      WHERE module = 'dds' AND entity_id = $1
      ORDER BY created_at DESC`,
    [ddsId],
  );

  const dds = ddsRes.rows[0];
  if (dds.company_id !== TEST_COMPANY_ID)
    throw new Error('DDS persistido fora do tenant esperado.');
  if (dds.site_company_id !== TEST_COMPANY_ID)
    throw new Error('Site do DDS não pertence ao tenant esperado.');
  if (registryRes.rows.length !== 1)
    throw new Error(
      `Esperado 1 registro governado para o DDS; encontrado ${registryRes.rows.length}.`,
    );
  if (registryRes.rows[0].company_id !== TEST_COMPANY_ID)
    throw new Error('Registro governado pertence a tenant incorreto.');

  return { dds, registry: registryRes.rows[0] };
}

async function validatePublicly(documentCode, token) {
  const params = new URLSearchParams({ code: documentCode });
  if (token) params.set('token', token);
  const response = await fetch(
    `${API_BASE_URL}/public/dds/validate?${params.toString()}`,
    { headers: { 'User-Agent': UA } },
  );
  const body = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, body };
}

async function run() {
  assertSafeMode();
  const conn = await connectRuntimePgClient();
  const client = conn.client;
  const tema = buildSmokeTema();
  const warnings = [];

  try {
    await client.query(
      `SELECT
         set_config('app.current_company_id', $1, false),
         set_config('app.current_company', $1, false),
         set_config('app.is_super_admin', 'true', false)`,
      [TEST_COMPANY_ID],
    );
    const company = await assertTargetCompany(client);
    const site = await pickTargetSite(client);
    let resumable = await findResumableDds(client, tema);
    if (resumable)
      warnings.push(
        `resuming_existing_dds:${maskId(resumable.id)} status=${resumable.status}`,
      );

    const smokeUser = await reconcileSmokeUser(client, site.id);
    const session = await login(smokeUser.smokeCpf, smokeUser.smokePassword);

    const me = await requestJson('/auth/me', session.accessToken, {
      companyId: TEST_COMPANY_ID,
    });
    if (!me.ok) throw new Error(`/auth/me falhou. status=${me.status}`);

    // 1. Criação
    let ddsId = resumable?.id || null;
    let currentStatus = resumable?.status || null;
    let hasPdfAlready = Boolean(resumable?.pdf_file_key);

    if (!ddsId) {
      const created = await requestJson('/dds', session.accessToken, {
        method: 'POST',
        companyId: TEST_COMPANY_ID,
        includeCsrf: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tema,
          conteudo:
            'Documento de teste controlado em produção. Sem assinatura real. Sem integração externa. Dados sintéticos.',
          data: new Date().toISOString(),
          site_id: site.id,
          facilitador_id: smokeUser.userId,
          participants: [smokeUser.userId],
        }),
      });
      if (!created.ok || !created.body?.id) {
        throw new Error(
          `Criação do DDS falhou. status=${created.status} body=${JSON.stringify(created.body)}`,
        );
      }
      ddsId = created.body.id;
      currentStatus = created.body.status || 'rascunho';
    }

    // 2. Assinatura do participante (necessária antes do PDF final)
    let signatures = null;
    if (!hasPdfAlready) {
      signatures = await requestJson(
        `/dds/${ddsId}/signatures`,
        session.accessToken,
        {
          method: 'PUT',
          companyId: TEST_COMPANY_ID,
          includeCsrf: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participant_signatures: [
              {
                user_id: smokeUser.userId,
                signature_data: 'SMOKE-TEST-CONTROLADO-SEM-VALOR-JURIDICO',
                type: 'hmac',
                pin: SMOKE_PIN,
              },
            ],
          }),
        },
      );
      if (!signatures.ok) {
        throw new Error(
          `Assinatura do participante falhou. status=${signatures.status} body=${JSON.stringify(signatures.body)}`,
        );
      }
    }

    // 3. Publicar (rascunho → publicado) — pré-requisito do fluxo de aprovação
    if (currentStatus === 'rascunho') {
      const published = await requestJson(
        `/dds/${ddsId}/status`,
        session.accessToken,
        {
          method: 'PATCH',
          companyId: TEST_COMPANY_ID,
          includeCsrf: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'publicado' }),
        },
      );
      if (!published.ok) {
        throw new Error(
          `Publicação do DDS falhou. status=${published.status} body=${JSON.stringify(published.body)}`,
        );
      }
      currentStatus = 'publicado';
    }

    // 4. Fluxo de aprovação com etapa única do perfil do smoke user
    let approvalFlow = await requestJson(
      `/dds/${ddsId}/approvals`,
      session.accessToken,
      { companyId: TEST_COMPANY_ID },
    );

    const flowSteps = approvalFlow.body?.steps || [];
    if (currentStatus !== 'auditado' && flowSteps.length === 0) {
      const initialized = await requestJson(
        `/dds/${ddsId}/approvals/initialize`,
        session.accessToken,
        {
          method: 'POST',
          companyId: TEST_COMPANY_ID,
          includeCsrf: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            steps: [
              {
                title: 'Etapa única de smoke controlado',
                approver_role: TARGET_PROFILE_NAME,
              },
            ],
          }),
        },
      );
      if (!initialized.ok) {
        throw new Error(
          `Inicialização do fluxo de aprovação falhou. status=${initialized.status} body=${JSON.stringify(initialized.body)}`,
        );
      }
      approvalFlow = initialized;
    }

    // 5. Aprovar cada etapa pendente
    if (currentStatus !== 'auditado') {
      let pendingSteps = (approvalFlow.body?.steps || []).filter(
        (step) => step.status === 'pending' && step.pending_record_id,
      );
      // fallback: recarrega o fluxo se o shape veio diferente
      if (!pendingSteps.length) {
        const reloaded = await requestJson(
          `/dds/${ddsId}/approvals`,
          session.accessToken,
          { companyId: TEST_COMPANY_ID },
        );
        pendingSteps = (reloaded.body?.steps || []).filter(
          (step) => step.status === 'pending' && step.pending_record_id,
        );
      }
      if (!pendingSteps.length) {
        throw new Error(
          `Nenhuma etapa pendente encontrada no fluxo de aprovação. body=${JSON.stringify(approvalFlow.body)}`,
        );
      }
      for (const step of pendingSteps) {
        const approved = await requestJson(
          `/dds/${ddsId}/approvals/${step.pending_record_id}/approve`,
          session.accessToken,
          {
            method: 'POST',
            companyId: TEST_COMPANY_ID,
            includeCsrf: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reason: 'Smoke test controlado em produção. Sem valor operacional.',
              pin: SMOKE_PIN,
            }),
          },
        );
        if (!approved.ok) {
          throw new Error(
            `Aprovação da etapa falhou. status=${approved.status} body=${JSON.stringify(approved.body)}`,
          );
        }
      }
      currentStatus = 'auditado';
    } else {
      warnings.push('dds_already_auditado');
    }

    // 6. Anexo do PDF final governado
    const artifactPaths = getReportPaths(tema);
    const pdfBuffer = await buildSmokePdfBuffer({
      ddsId,
      siteId: site.id,
      tema,
    });
    fs.writeFileSync(artifactPaths.pdfPath, pdfBuffer);

    let attachment = null;
    if (!hasPdfAlready) {
      attachment = await attachPdf(
        session.accessToken,
        ddsId,
        pdfBuffer,
        `${tema}.pdf`,
      );
      if (!attachment.ok) {
        throw new Error(
          `Anexo do PDF falhou. status=${attachment.status} body=${JSON.stringify(attachment.body)}`,
        );
      }
    } else {
      warnings.push('dds_pdf_already_attached');
    }

    // 7. Acesso ao PDF + verificação de banco + validação pública
    const pdfAccess = await requestJson(
      `/dds/${ddsId}/pdf`,
      session.accessToken,
      { companyId: TEST_COMPANY_ID },
    );
    if (!pdfAccess.ok) {
      throw new Error(
        `Consulta do PDF final falhou. status=${pdfAccess.status} body=${JSON.stringify(pdfAccess.body)}`,
      );
    }

    const db = await verifyDatabaseState(client, ddsId);

    // Round-trip de validação: o app emite código+token pelo
    // validation-context e o portal público confere com o grant ativo.
    const validationContext = await requestJson(
      `/dds/${ddsId}/validation-context`,
      session.accessToken,
      { companyId: TEST_COMPANY_ID },
    );
    const contextCode = validationContext.body?.documentCode || null;
    const contextToken = validationContext.body?.token || null;

    if (
      contextCode &&
      db.registry?.document_code &&
      contextCode !== db.registry.document_code
    ) {
      warnings.push(
        `validation_code_mismatch: context=${contextCode} registry=${db.registry.document_code}`,
      );
    }

    const publicValidation =
      contextCode && contextToken
        ? await validatePublicly(contextCode, contextToken)
        : { status: validationContext.status, ok: false, body: null };

    const publicValidationValid =
      publicValidation.body?.valid ?? publicValidation.body?.isValid ?? false;
    if (!publicValidation.ok || publicValidationValid !== true) {
      throw new Error(
        `Validação pública do DDS falhou. status=${publicValidation.status} ` +
          `body=${JSON.stringify({
            valid: publicValidation.body?.valid,
            isValid: publicValidation.body?.isValid,
            message: publicValidation.body?.message,
            module: publicValidation.body?.module,
            code: publicValidation.body?.code,
          })}`,
      );
    }

    const invalidPublicValidation = await validatePublicly(
      contextCode,
      'invalid.invalid.invalid',
    );
    const invalidPublicValidationAccepted =
      invalidPublicValidation.body?.valid === true ||
      invalidPublicValidation.body?.isValid === true;
    if (invalidPublicValidationAccepted) {
      throw new Error('Token público inválido foi aceito pelo endpoint DDS.');
    }

    const crossTenantRead = await requestJson(
      `/dds/${ddsId}`,
      session.accessToken,
      { companyId: '00000000-0000-4000-8000-000000000099' },
    );
    if (crossTenantRead.ok) {
      throw new Error('Leitura DDS cross-tenant foi aceita pelo endpoint.');
    }

    const forensicTrace = await client.query(
      `SELECT COUNT(*)::int AS count
         FROM forensic_trail_events
        WHERE company_id = $1
          AND module = 'dds_public_validation'
          AND entity_id = $2
          AND event_type = 'PUBLIC_VALIDATION_ATTEMPT'`,
      [TEST_COMPANY_ID, contextCode],
    );
    const forensicTraceCount = Number(forensicTrace.rows[0]?.count || 0);
    if (forensicTraceCount < 1) {
      throw new Error('Trace forense da validação pública não foi persistido.');
    }

    const report = {
      apiBaseUrl: API_BASE_URL,
      warnings,
      company: {
        name: TEST_COMPANY_NAME,
        id: maskId(company.id),
        siteId: maskId(site.id),
      },
      smokeUser: {
        id: maskId(smokeUser.userId),
        profile: TARGET_PROFILE_NAME,
        email: maskEmail(SMOKE_USER_EMAIL),
      },
      dds: {
        id: maskId(ddsId),
        tema,
        status: currentStatus,
        resumed: Boolean(resumable),
      },
      attachment: {
        status: attachment?.status || null,
        fileKey: maskId(attachment?.body?.fileKey),
      },
      storage: {
        pdfAccessStatus: pdfAccess.status,
        availability: pdfAccess.body?.availability || null,
        hasFinalPdf: Boolean(pdfAccess.body?.hasFinalPdf),
      },
      database: {
        ddsId: maskId(db.dds.id),
        ddsStatus: db.dds.status,
        ddsCompanyId: maskId(db.dds.company_id),
        siteCompanyId: maskId(db.dds.site_company_id),
        auditadoPorId: maskId(db.dds.auditado_por_id),
        hasPdfKey: Boolean(db.dds.pdf_file_key),
        hasFinalPdfHash: Boolean(db.dds.final_pdf_hash_sha256),
        documentRegistryId: maskId(db.registry?.id),
        documentRegistryCompanyId: maskId(db.registry?.company_id),
        documentCode: db.registry?.document_code || null,
        registryHasHash: Boolean(db.registry?.file_hash),
        registryStatus: db.registry?.status || null,
      },
      validationContext: {
        status: validationContext.status,
        documentCode: contextCode,
        tokenIssued: Boolean(contextToken),
        matchesRegistryCode: contextCode === (db.registry?.document_code || null),
      },
      publicValidation: {
        status: publicValidation.status,
        valid: publicValidationValid,
        moduleReturned: publicValidation.body?.module || null,
      },
      adversarial: {
        invalidPublicTokenRejected:
          !invalidPublicValidationAccepted,
        crossTenantReadRejected: !crossTenantRead.ok,
        forensicTraceCount,
      },
      artifacts: {
        pdfPath: artifactPaths.pdfPath,
        jsonPath: artifactPaths.jsonPath,
      },
      safeguards: {
        productionSafeTestMode: PRODUCTION_SAFE_TEST_MODE,
        disableExternalNotifications: DISABLE_EXTERNAL_NOTIFICATIONS,
        cleanupTestData: CLEANUP_TEST_DATA,
        maxTestDocuments: MAX_TEST_DOCUMENTS,
      },
    };

    fs.writeFileSync(
      artifactPaths.jsonPath,
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
