/**
 * Smoke test controlado do relatório mensal em produção (empresa Gandra).
 *
 * Diferente dos demais documentos, o relatório mensal é gerado SERVER-SIDE:
 * a API enfileira um job na fila pdf-generation (BullMQ) e o Worker o processa
 * com Puppeteer — este smoke valida, portanto, também o Worker em produção.
 *
 * Fluxo validado:
 *   1. Enfileira a geração (POST /reports/generate {ano, mes})
 *   2. Poll de GET /reports/status/:jobId até "completed"
 *   3. Localiza o relatório persistido (tabela reports) do mês/ano
 *   4. Confere acesso ao PDF (GET /reports/:id/pdf) e o registro governado
 *      (document_registry module='report' com hash)
 *
 * Não cria documento operacional sintético: o relatório agrega dados reais
 * do mês anterior — é o mesmo artefato que o produto emite mensalmente.
 *
 * Salvaguardas idênticas aos smokes de PT/APR/DDS.
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

const TARGET_PROFILE_NAME = 'Administrador da Empresa';
const SMOKE_USER_NAME = 'K6 TESTE GANDRA REPORT CONTROLADO';
const SMOKE_USER_EMAIL = 'k6.gandra.report.smoke@invalid.local';
const SMOKE_USER_FUNCTION = 'TST Smoke Controlado';
const SMOKE_USER_BASE_CPF = '987654310';
const UA = 'sgs-prod-gandra-monthly-report-smoke/1.0';

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

function buildSmokeTitulo() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${TEST_DOCUMENT_PREFIX}${stamp}-REL-001`;
}

function getReportPaths(titulo) {
  const safeName = titulo.replace(/[^A-Z0-9_-]/gi, '_');
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
    `SELECT id, razao_social FROM companies
      WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
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
    `SELECT id, nome FROM sites
      WHERE company_id = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC LIMIT 1`,
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

async function findResumableDid(client, titulo) {
  const rows = await client.query(
    `SELECT id, titulo, pdf_file_key
       FROM audits
      WHERE company_id = $1 AND deleted_at IS NULL AND titulo LIKE $2
      ORDER BY created_at DESC`,
    [TEST_COMPANY_ID, `${TEST_DOCUMENT_PREFIX}%`],
  );
  if (rows.rows.length >= MAX_TEST_DOCUMENTS) {
    // Com o limite de 1 documento de teste, retoma o existente mesmo que o
    // número tenha sido gerado em outro dia (o smoke é resumível).
    if (rows.rows.length === 1) return rows.rows[0];
    throw new Error(
      `Já existe ${rows.rows.length} CAT de teste com prefixo ${TEST_DOCUMENT_PREFIX}. Abortando.`,
    );
  }
  return rows.rows.find((row) => row.titulo === titulo) || null;
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
        WHERE lower(email) = lower($1) OR cpf_hash = $2 LIMIT 1`,
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

    await client.query('COMMIT');

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
  page.drawText('SGS - Auditoria Smoke Test Controlado', {
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
    `Titulo: ${params.titulo}`,
    `Auditoria ID: ${params.auditId}`,
    `Site ID mascarado: ${maskId(params.siteId)}`,
    `Usuario tecnico: ${maskEmail(SMOKE_USER_EMAIL)}`,
    'Conteudo: teste controlado sem assinatura real e sem integracoes externas.',
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

async function attachPdf(accessToken, auditId, pdfBuffer, fileName) {
  const csrfHeaders = await getMutationCsrfHeaders();
  const form = new FormData();
  form.set('file', new File([pdfBuffer], fileName, { type: 'application/pdf' }));
  const response = await fetch(`${API_BASE_URL}/audits/${auditId}/file`, {
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

async function verifyDatabaseState(client, auditId) {
  const auditRes = await client.query(
    `SELECT d.id, d.titulo, d.company_id, d.site_id,
            d.pdf_file_key,
            s.company_id AS site_company_id
       FROM audits d
       JOIN sites s ON s.id = d.site_id
      WHERE d.id = $1 AND d.deleted_at IS NULL`,
    [auditId],
  );
  if (auditRes.rows.length !== 1)
    throw new Error('Auditoria criada não encontrada para verificação final.');

  const registryRes = await client.query(
    `SELECT id, company_id, module, entity_id, document_code, file_key,
            file_hash, original_name, status
       FROM document_registry
      WHERE module = 'audit' AND entity_id = $1
      ORDER BY created_at DESC`,
    [auditId],
  );

  const cat = auditRes.rows[0];
  if (cat.company_id !== TEST_COMPANY_ID)
    throw new Error('Auditoria persistida fora do tenant esperado.');
  if (cat.site_company_id !== TEST_COMPANY_ID)
    throw new Error('Site da auditoria não pertence ao tenant esperado.');
  if (registryRes.rows.length !== 1)
    throw new Error(
      `Esperado 1 registro governado para a auditoria; encontrado ${registryRes.rows.length}.`,
    );
  if (registryRes.rows[0].company_id !== TEST_COMPANY_ID)
    throw new Error('Registro governado pertence a tenant incorreto.');

  return { audit: cat, registry: registryRes.rows[0] };
}

const JOB_POLL_INTERVAL_MS = 5_000;
const JOB_POLL_TIMEOUT_MS = 5 * 60_000;

async function run() {
  assertSafeMode();
  const conn = await connectRuntimePgClient();
  const client = conn.client;
  const warnings = [];

  // Relatório do mês anterior (padrão do produto): dados reais agregados,
  // não cria documento operacional sintético — apenas o artefato mensal.
  const now = new Date();
  let mes = now.getUTCMonth(); // 0-11 → mês anterior em 1-12
  let ano = now.getUTCFullYear();
  if (mes === 0) {
    mes = 12;
    ano -= 1;
  }
  const label = `${TEST_DOCUMENT_PREFIX}${ano}${String(mes).padStart(2, '0')}-REL-001`;

  try {
    await client.query(`SELECT set_config('app.is_super_admin','true',false)`);
    const company = await assertTargetCompany(client);
    const site = await pickTargetSite(client);

    const smokeUser = await reconcileSmokeUser(client, site.id);
    const session = await login(smokeUser.smokeCpf, smokeUser.smokePassword);

    const me = await requestJson('/auth/me', session.accessToken, {
      companyId: TEST_COMPANY_ID,
    });
    if (!me.ok) throw new Error(`/auth/me falhou. status=${me.status}`);

    // 1. Enfileira a geração do relatório mensal (processado pelo Worker)
    const enqueued = await requestJson('/reports/generate', session.accessToken, {
      method: 'POST',
      companyId: TEST_COMPANY_ID,
      includeCsrf: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ano, mes }),
    });
    if (!enqueued.ok || !enqueued.body?.jobId) {
      throw new Error(
        `Enfileiramento do relatório falhou. status=${enqueued.status} body=${JSON.stringify(enqueued.body)}`,
      );
    }
    const jobId = String(enqueued.body.jobId);

    // 2. Poll do job até completar (valida o Worker + Puppeteer em produção)
    const startedAt = Date.now();
    let jobState = null;
    let jobResult = null;
    while (Date.now() - startedAt < JOB_POLL_TIMEOUT_MS) {
      const status = await requestJson(
        `/reports/status/${encodeURIComponent(jobId)}`,
        session.accessToken,
        { companyId: TEST_COMPANY_ID },
      );
      if (status.ok) {
        jobState = status.body?.state || null;
        jobResult = status.body?.result || null;
        if (jobState === 'completed') break;
        if (jobState === 'failed') {
          throw new Error(
            `Job de relatório falhou no Worker. result=${JSON.stringify(jobResult)}`,
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
    }
    if (jobState !== 'completed') {
      throw new Error(
        `Job de relatório não completou em ${JOB_POLL_TIMEOUT_MS / 1000}s (último estado: ${jobState}).`,
      );
    }

    // 3. Localiza o relatório persistido do mês
    const reportRow = await client.query(
      `SELECT id, titulo, mes, ano, company_id, pdf_file_key, pdf_file_hash
         FROM reports
        WHERE company_id = $1 AND mes = $2 AND ano = $3
        ORDER BY created_at DESC
        LIMIT 1`,
      [TEST_COMPANY_ID, mes, ano],
    );
    if (!reportRow.rows.length) {
      throw new Error('Relatório mensal não encontrado no banco após o job.');
    }
    const monthly = reportRow.rows[0];
    if (monthly.company_id !== TEST_COMPANY_ID) {
      throw new Error('Relatório persistido fora do tenant esperado.');
    }

    // 4. Acesso ao PDF final + registro governado
    const pdfAccess = await requestJson(
      `/reports/${monthly.id}/pdf`,
      session.accessToken,
      { companyId: TEST_COMPANY_ID },
    );
    if (!pdfAccess.ok) {
      throw new Error(
        `Consulta do PDF do relatório falhou. status=${pdfAccess.status} body=${JSON.stringify(pdfAccess.body)}`,
      );
    }

    const registryRes = await client.query(
      `SELECT id, company_id, module, entity_id, document_code, file_hash, status
         FROM document_registry
        WHERE module = 'report' AND entity_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [monthly.id],
    );
    const registry = registryRes.rows[0] || null;
    if (registry && registry.company_id !== TEST_COMPANY_ID) {
      throw new Error('Registro governado pertence a tenant incorreto.');
    }
    if (!registry) {
      warnings.push('report_registry_entry_missing');
    }

    const artifactPaths = getReportPaths(label);
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
      job: {
        id: maskId(jobId),
        state: jobState,
      },
      monthlyReport: {
        id: maskId(monthly.id),
        titulo: monthly.titulo,
        mes: monthly.mes,
        ano: monthly.ano,
      },
      storage: {
        pdfAccessStatus: pdfAccess.status,
        availability: pdfAccess.body?.availability || null,
        hasFinalPdf: Boolean(pdfAccess.body?.hasFinalPdf),
      },
      database: {
        reportCompanyId: maskId(monthly.company_id),
        hasPdfKey: Boolean(monthly.pdf_file_key),
        hasPdfHash: Boolean(monthly.pdf_file_hash),
        documentRegistryId: maskId(registry?.id),
        documentRegistryCompanyId: maskId(registry?.company_id),
        documentCode: registry?.document_code || null,
        registryHasHash: Boolean(registry?.file_hash),
        registryStatus: registry?.status || null,
      },
      publicValidation: {
        status: null,
        valid: null,
        note: 'not_applicable: relatório mensal não possui portal de validação pública com grant.',
      },
      artifacts: {
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
