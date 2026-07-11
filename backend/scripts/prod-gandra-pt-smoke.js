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

const TARGET_PROFILE_NAME = 'Técnico de Segurança do Trabalho (TST)';
const SMOKE_USER_NAME = 'K6 TESTE GANDRA PT CONTROLADO';
const SMOKE_USER_EMAIL = 'k6.gandra.pt.smoke@invalid.local';
const SMOKE_USER_FUNCTION = 'TST Smoke Controlado';
const SMOKE_USER_BASE_CPF = '987654321';

function assertSafeMode() {
  if (!TEST_COMPANY_ID) {
    throw new Error('TEST_COMPANY_ID ausente. Abortando.');
  }
  if (TEST_COMPANY_NAME !== 'Gandra Tecnologia') {
    throw new Error(
      `TEST_COMPANY_NAME inesperado (${TEST_COMPANY_NAME}). Abortando.`,
    );
  }
  if (!PRODUCTION_SAFE_TEST_MODE) {
    throw new Error('PRODUCTION_SAFE_TEST_MODE=false. Abortando.');
  }
  if (!DISABLE_EXTERNAL_NOTIFICATIONS) {
    throw new Error('DISABLE_EXTERNAL_NOTIFICATIONS=false. Abortando.');
  }
  if (CLEANUP_TEST_DATA) {
    throw new Error('CLEANUP_TEST_DATA=true. Abortando.');
  }
  if (!Number.isFinite(MAX_TEST_DOCUMENTS) || MAX_TEST_DOCUMENTS !== 1) {
    throw new Error('MAX_TEST_DOCUMENTS deve ser exatamente 1.');
  }
}

function digitsOnly(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .trim();
}

function computeCpfCheckDigits(baseNineDigits) {
  const digits = digitsOnly(baseNineDigits).split('').map(Number);
  if (digits.length !== 9) {
    throw new Error('Base de CPF inválida.');
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

function maskId(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 6)}***${text.slice(-4)}`;
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

function buildSmokeDocumentNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${TEST_DOCUMENT_PREFIX}${stamp}-001`;
}

function getReportPaths(documentNumber) {
  const safeName = documentNumber.replace(/[^A-Z0-9_-]/gi, '_');
  const tempDir = path.resolve(__dirname, '../temp');
  fs.mkdirSync(tempDir, { recursive: true });
  return {
    tempDir,
    pdfPath: path.join(tempDir, `${safeName}.pdf`),
    jsonPath: path.join(tempDir, `${safeName}.json`),
  };
}

async function requestJson(pathname, accessToken, options = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'sgs-prod-gandra-pt-smoke/1.0',
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

  return {
    status: response.status,
    ok: response.ok,
    body,
    headers: response.headers,
  };
}

async function login(cpf, password) {
  const csrfRes = await fetch(`${API_BASE_URL}/auth/csrf`, {
    headers: { 'User-Agent': 'sgs-prod-gandra-pt-smoke/1.0' },
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
      'User-Agent': 'sgs-prod-gandra-pt-smoke/1.0',
      'x-csrf-token': csrfToken,
      Cookie: csrfCookie,
    },
    body: JSON.stringify({ cpf, password }),
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

async function getMutationCsrfHeaders() {
  const csrfRes = await fetch(`${API_BASE_URL}/auth/csrf`, {
    headers: { 'User-Agent': 'sgs-prod-gandra-pt-smoke/1.0' },
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
      `Falha ao obter CSRF para mutação. status=${csrfRes.status} token=${Boolean(
        csrfToken,
      )} cookie=${Boolean(csrfCookie)}`,
    );
  }

  return {
    'x-csrf-token': csrfToken,
    Cookie: csrfCookie,
  };
}

async function pickTargetSite(client) {
  const siteRes = await client.query(
    `
      SELECT id, nome
        FROM sites
       WHERE company_id = $1
         AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC
       LIMIT 1
    `,
    [TEST_COMPANY_ID],
  );

  if (!siteRes.rows.length) {
    throw new Error('Nenhum site ativo encontrado para a empresa de teste.');
  }

  return siteRes.rows[0];
}

async function resolveProfileId(client) {
  const profileRes = await client.query(
    `
      SELECT id
        FROM profiles
       WHERE nome = $1
       LIMIT 1
    `,
    [TARGET_PROFILE_NAME],
  );

  if (!profileRes.rows.length) {
    throw new Error(`Perfil não encontrado: ${TARGET_PROFILE_NAME}`);
  }

  return profileRes.rows[0].id;
}

async function assertTargetCompany(client) {
  const hasTenantIdRes = await client.query(
    `
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'companies'
         AND column_name = 'tenant_id'
       LIMIT 1
    `,
  );
  const hasTenantId = hasTenantIdRes.rows.length > 0;
  const companyRes = await client.query(
    `
      SELECT
        id,
        razao_social,
        ${hasTenantId ? 'tenant_id' : 'NULL::text AS tenant_id'},
        status,
        account_status
        FROM companies
       WHERE id = $1
         AND deleted_at IS NULL
       LIMIT 1
    `,
    [TEST_COMPANY_ID],
  );

  if (companyRes.rows.length !== 1) {
    throw new Error(
      `Empresa alvo não encontrada pelo ID informado (${TEST_COMPANY_ID}).`,
    );
  }

  const company = companyRes.rows[0];
  if (String(company.razao_social).trim() !== TEST_COMPANY_NAME) {
    throw new Error(
      `Empresa do ID informado não corresponde ao nome esperado (${TEST_COMPANY_NAME}).`,
    );
  }

  return company;
}

async function findResumableTestDocument(client, documentNumber) {
  const activePts = await client.query(
    `
      SELECT id, numero, status, pdf_file_key
        FROM pts
       WHERE company_id = $1
         AND deleted_at IS NULL
         AND numero LIKE $2
       ORDER BY created_at DESC
    `,
    [TEST_COMPANY_ID, `${TEST_DOCUMENT_PREFIX}%`],
  );

  if (activePts.rows.length >= MAX_TEST_DOCUMENTS) {
    const exactMatch = activePts.rows.find((row) => row.numero === documentNumber);
    if (activePts.rows.length === 1 && exactMatch) {
      return exactMatch;
    }
    throw new Error(
      `Já existe ${activePts.rows.length} PT(s) ativa(s) com prefixo ${TEST_DOCUMENT_PREFIX}. Abortando para evitar duplicidade.`,
    );
  }

  return activePts.rows.find((row) => row.numero === documentNumber) || null;
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
      `
        SELECT id, company_id
          FROM users
         WHERE lower(email) = lower($1)
            OR cpf_hash = $2
         LIMIT 1
      `,
      [SMOKE_USER_EMAIL, cpfPayload.cpf_hash],
    );

    let userId = null;
    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      if (existing.company_id !== TEST_COMPANY_ID) {
        throw new Error(
          `Usuário técnico já existe em outro tenant (${maskId(existing.company_id)}). Abortando.`,
        );
      }
      userId = existing.id;
      await client.query(
        `
          UPDATE users
             SET nome = $2,
                 cpf = NULL,
                 cpf_hash = $3,
                 cpf_ciphertext = $4,
                 email = $5,
                 funcao = $6,
                 password = $7,
                 status = true,
                 ai_processing_consent = false,
                 company_id = $8,
                 site_id = $9,
                 profile_id = $10,
                 deleted_at = NULL,
                 updated_at = now()
           WHERE id = $1
        `,
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
        `
          INSERT INTO users (
            id,
            nome,
            cpf,
            cpf_hash,
            cpf_ciphertext,
            email,
            funcao,
            password,
            status,
            ai_processing_consent,
            company_id,
            site_id,
            profile_id,
            created_at,
            updated_at
          ) VALUES (
            $1,
            $2,
            NULL,
            $3,
            $4,
            $5,
            $6,
            $7,
            true,
            false,
            $8,
            $9,
            $10,
            now(),
            now()
          )
        `,
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
      `
        INSERT INTO user_sites (user_id, site_id, company_id, created_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT DO NOTHING
      `,
      [userId, siteId, TEST_COMPANY_ID],
    );

    await client.query('COMMIT');
    return {
      userId,
      smokeCpf,
      smokePassword,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function buildCreatePtPayload(siteId, userId, documentNumber) {
  const now = new Date();
  const start = new Date(now.getTime() + 10 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    numero: documentNumber,
    titulo: `${documentNumber} PT smoke controlado`,
    descricao:
      'Documento de teste controlado em produção. Sem assinatura real. Sem integração externa. Dados sintéticos.',
    data_hora_inicio: start.toISOString(),
    data_hora_fim: end.toISOString(),
    site_id: siteId,
    responsavel_id: userId,
    executantes: [],
    trabalho_altura: false,
    espaco_confinado: false,
    trabalho_quente: false,
    eletricidade: false,
    escavacao: false,
    probability: 1,
    severity: 1,
    exposure: 1,
    residual_risk: 'LOW',
    control_evidence: false,
    epis_obrigatorios: ['CAPACETE TESTE', 'OCULOS TESTE'],
    contato_emergencia: 'TESTE CONTROLADO - NAO ACIONAR',
    plano_resgate: 'SMOKE TEST CONTROLADO - SEM EXECUCAO OPERACIONAL REAL',
    ponto_encontro: 'PONTO DE TESTE SGS',
    analise_risco_rapida_observacoes:
      'SMOKE TEST CONTROLADO. CONTEUDO EXCLUSIVO PARA VALIDACAO TECNICA.',
    recomendacoes_gerais_checklist: [
      {
        id: 'teste-recomendacao-1',
        pergunta: 'Teste controlado em producao identificado visualmente',
        resposta: 'Ciente',
        justificativa: 'Documento criado para validacao tecnica interna',
      },
    ],
    analise_risco_rapida_checklist: [
      {
        id: 'teste-risco-1',
        pergunta: 'Area isolada para smoke test documental',
        secao: 'basica',
        resposta: 'Sim',
      },
    ],
  };
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
  page.drawText('SGS - PT Smoke Test Controlado', {
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
    `Documento: ${params.documentNumber}`,
    `Codigo documental: ${params.documentCode || 'indisponivel'}`,
    `PT ID: ${params.ptId}`,
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

  page.drawText(
    'Este PDF foi gerado localmente para anexacao governada e contem apenas dados sinteticos.',
    {
      x: 52,
      y: 520,
      size: 11,
      font,
      color: rgb(0.2, 0.2, 0.2),
      maxWidth: 470,
    },
  );

  return Buffer.from(await pdf.save());
}

async function attachPdf(accessToken, companyId, ptId, pdfBuffer, fileName) {
  const csrfHeaders = await getMutationCsrfHeaders();
  const form = new FormData();
  form.set(
    'file',
    new File([pdfBuffer], fileName, { type: 'application/pdf' }),
  );

  const response = await fetch(`${API_BASE_URL}/pts/${ptId}/file`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'sgs-prod-gandra-pt-smoke/1.0',
      'x-company-id': companyId,
      ...csrfHeaders,
    },
    body: form,
  });

  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

async function verifyDatabaseState(client, ptId, smokeUserId) {
  const ptRes = await client.query(
    `
      SELECT
        pt.id,
        pt.numero,
        pt.status,
        pt.company_id,
        pt.site_id,
        pt.responsavel_id,
        pt.aprovado_por_id,
        pt.pdf_file_key,
        pt.pdf_folder_path,
        pt.pdf_original_name,
        pt.final_pdf_hash_sha256,
        s.company_id AS site_company_id,
        u.company_id AS responsavel_company_id,
        au.company_id AS aprovador_company_id
      FROM pts pt
      JOIN sites s
        ON s.id = pt.site_id
      JOIN users u
        ON u.id = pt.responsavel_id
      LEFT JOIN users au
        ON au.id = pt.aprovado_por_id
      WHERE pt.id = $1
        AND pt.deleted_at IS NULL
    `,
    [ptId],
  );

  if (ptRes.rows.length !== 1) {
    throw new Error('PT criada não encontrada para verificação final.');
  }

  const documentRes = await client.query(
    `
      SELECT
        id,
        company_id,
        module,
        entity_id,
        document_code,
        file_key,
        file_hash,
        original_name,
        created_by
      FROM document_registry
      WHERE module = 'pt'
        AND entity_id = $1
      ORDER BY created_at DESC
    `,
    [ptId],
  );

  const pt = ptRes.rows[0];
  if (pt.company_id !== TEST_COMPANY_ID) {
    throw new Error('PT persistida fora do tenant esperado.');
  }
  if (pt.site_company_id !== TEST_COMPANY_ID) {
    throw new Error('Site da PT não pertence ao tenant esperado.');
  }
  if (pt.responsavel_company_id !== TEST_COMPANY_ID) {
    throw new Error('Responsável da PT não pertence ao tenant esperado.');
  }
  if (pt.aprovador_company_id && pt.aprovador_company_id !== TEST_COMPANY_ID) {
    throw new Error('Aprovador da PT não pertence ao tenant esperado.');
  }
  if (pt.responsavel_id !== smokeUserId || pt.aprovado_por_id !== smokeUserId) {
    throw new Error('Usuário técnico reconciliado não foi usado em todo o fluxo.');
  }
  if (documentRes.rows.length !== 1) {
    throw new Error(
      `Esperado 1 registro governado para a PT; encontrado ${documentRes.rows.length}.`,
    );
  }
  if (documentRes.rows[0].company_id !== TEST_COMPANY_ID) {
    throw new Error('Registro governado pertence a tenant incorreto.');
  }

  return {
    pt,
    document: documentRes.rows[0],
  };
}

async function getPtState(client, ptId) {
  const res = await client.query(
    `
      SELECT id, status, aprovado_por_id, pdf_file_key
        FROM pts
       WHERE id = $1
       LIMIT 1
    `,
    [ptId],
  );

  return res.rows[0] || null;
}

function summarizeReport(report) {
  return {
    apiBaseUrl: report.apiBaseUrl,
    warnings: report.warnings,
    company: report.company,
    smokeUser: report.smokeUser,
    notifications: report.notifications,
    pt: report.pt,
    validation: report.validation,
    attachment: report.attachment,
    storage: report.storage,
    database: report.database,
    artifacts: report.artifacts,
    safeguards: report.safeguards,
  };
}

async function run() {
  assertSafeMode();

  const runtimeConnection = await connectRuntimePgClient();
  const client = runtimeConnection.client;
  const documentNumber = buildSmokeDocumentNumber();
  const warnings = [];

  try {
    await client.query(`SELECT set_config('app.is_super_admin', 'true', false)`);
    const company = await assertTargetCompany(client);
    const site = await pickTargetSite(client);
    let resumablePt = await findResumableTestDocument(client, documentNumber);
    if (resumablePt) {
      warnings.push(
        `resuming_existing_test_pt:${maskId(resumablePt.id)} status=${resumablePt.status}`,
      );
    }

    const smokeUser = await reconcileSmokeUser(client, site.id);
    const session = await login(smokeUser.smokeCpf, smokeUser.smokePassword);

    const me = await requestJson('/auth/me', session.accessToken, {
      companyId: TEST_COMPANY_ID,
    });
    if (!me.ok) {
      throw new Error(`/auth/me falhou com status ${me.status}.`);
    }

    const notificationsUnread = await requestJson(
      '/notifications/unread-count',
      session.accessToken,
      { companyId: TEST_COMPANY_ID },
    );
    const notificationsList = await requestJson(
      '/notifications?page=1&limit=20',
      session.accessToken,
      { companyId: TEST_COMPANY_ID },
    );

    const notificationsKnownDatabaseFailure =
      notificationsUnread.status === 400 &&
      notificationsList.status === 400 &&
      notificationsUnread.body?.error?.code === 'DATABASE_ERROR' &&
      notificationsList.body?.error?.code === 'DATABASE_ERROR';

    if (notificationsKnownDatabaseFailure) {
      warnings.push(
        'notifications_endpoints_live_database_error: correção aplicada no código local, mas ainda não publicada no backend live.',
      );
    } else if (!notificationsUnread.ok || !notificationsList.ok) {
      throw new Error(
        `Endpoints de notificações falharam: unread=${notificationsUnread.status} list=${notificationsList.status}`,
      );
    }

    let created = null;
    let ptId = resumablePt?.id || null;
    let currentStatus = resumablePt?.status || null;
    let hasPdfAlready = Boolean(resumablePt?.pdf_file_key);

    if (!ptId) {
      const createPayload = buildCreatePtPayload(
        site.id,
        smokeUser.userId,
        documentNumber,
      );
      created = await requestJson('/pts', session.accessToken, {
        method: 'POST',
        companyId: TEST_COMPANY_ID,
        includeCsrf: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });

      if (created.ok && created.body?.id) {
        ptId = created.body.id;
        currentStatus = created.body.status || null;
      } else if (
        created.status === 400 &&
        created.body?.error?.code === 'DATABASE_ERROR'
      ) {
        resumablePt = await findResumableTestDocument(client, documentNumber);
        if (!resumablePt?.id) {
          throw new Error(
            `Criação da PT falhou sem registro recuperável. status=${created.status} body=${JSON.stringify(created.body)}`,
          );
        }
        ptId = resumablePt.id;
        currentStatus = resumablePt.status || null;
        hasPdfAlready = Boolean(resumablePt.pdf_file_key);
        warnings.push(
          'pt_create_live_audit_error_resumed: backend live criou a PT, mas respondeu 400 após falha de auditoria.',
        );
      } else {
        throw new Error(
          `Criação da PT falhou. status=${created.status} body=${JSON.stringify(created.body)}`,
        );
      }
    }

    const validation = await requestJson(
      `/pts/${ptId}/validation-context`,
      session.accessToken,
      { companyId: TEST_COMPANY_ID },
    );
    const validationContextUnavailable = validation.status === 404;
    if (validationContextUnavailable) {
      warnings.push(
        'pt_validation_context_not_deployed_live: rota ausente no backend público atual.',
      );
    } else if (!validation.ok) {
      throw new Error(
        `Validation context falhou. status=${validation.status} body=${JSON.stringify(validation.body)}`,
      );
    }

    let approved = null;
    // Estados em que a PT já passou da aprovação e o anexo do PDF final é
    // permitido (PT_FINAL_PDF_ALLOWED_STATUSES no backend). Uma PT retomada
    // que já expirou (Expirada) não pode ser reaprovada (Expirada → Aprovada é
    // transição inválida); deve seguir direto para o anexo do PDF.
    const PT_PAST_APPROVAL_STATUSES = new Set([
      'Aprovada',
      'Encerrada',
      'Expirada',
    ]);
    if (!PT_PAST_APPROVAL_STATUSES.has(currentStatus)) {
      approved = await requestJson(
        `/pts/${ptId}/approve`,
        session.accessToken,
        {
          method: 'POST',
          companyId: TEST_COMPANY_ID,
          includeCsrf: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason:
              'Smoke test controlado em produção. Sem assinatura real. Sem integração externa.',
          }),
        },
      );
      if (
        !approved.ok &&
        approved.status === 400 &&
        approved.body?.error?.code === 'DATABASE_ERROR'
      ) {
        const recoveredState = await getPtState(client, ptId);
        if (
          recoveredState?.status === 'Aprovada' ||
          recoveredState?.status === 'Encerrada'
        ) {
          currentStatus = recoveredState.status;
          warnings.push(
            'pt_approve_live_audit_error_resumed: backend live aprovou a PT, mas respondeu 400 após falha de auditoria.',
          );
        } else {
          throw new Error(
            `Aprovação da PT falhou sem transição persistida. status=${approved.status} body=${JSON.stringify(approved.body)}`,
          );
        }
      } else if (!approved.ok) {
        throw new Error(
          `Aprovação da PT falhou. status=${approved.status} body=${JSON.stringify(approved.body)}`,
        );
      } else {
        currentStatus = approved.body?.status || currentStatus;
      }
    } else {
      warnings.push(`pt_already_${String(currentStatus).toLowerCase()}`);
    }

    const artifactPaths = getReportPaths(documentNumber);
    const pdfBuffer = await buildSmokePdfBuffer({
      ptId,
      siteId: site.id,
      documentNumber,
      documentCode: validation.body?.documentCode || null,
    });
    fs.writeFileSync(artifactPaths.pdfPath, pdfBuffer);

    let attachment = null;
    if (!hasPdfAlready) {
      attachment = await attachPdf(
        session.accessToken,
        TEST_COMPANY_ID,
        ptId,
        pdfBuffer,
        `${documentNumber}.pdf`,
      );
      if (!attachment.ok) {
        throw new Error(
          `Anexo do PDF falhou. status=${attachment.status} body=${JSON.stringify(attachment.body)}`,
        );
      }
    } else {
      warnings.push('pt_pdf_already_attached');
    }

    const pdfAccess = await requestJson(`/pts/${ptId}/pdf`, session.accessToken, {
      companyId: TEST_COMPANY_ID,
    });
    if (!pdfAccess.ok) {
      throw new Error(
        `Consulta do PDF final falhou. status=${pdfAccess.status} body=${JSON.stringify(pdfAccess.body)}`,
      );
    }

    const database = await verifyDatabaseState(client, ptId, smokeUser.userId);

    const report = summarizeReport({
      apiBaseUrl: API_BASE_URL,
      warnings,
      company: {
        name: TEST_COMPANY_NAME,
        id: maskId(company.id),
        tenantId: maskId(company.tenant_id),
        siteId: maskId(site.id),
      },
      smokeUser: {
        id: maskId(smokeUser.userId),
        profile: TARGET_PROFILE_NAME,
        email: maskEmail(SMOKE_USER_EMAIL),
      },
      notifications: {
        unreadCountStatus: notificationsUnread.status,
        listStatus: notificationsList.status,
        knownLiveDatabaseError: notificationsKnownDatabaseFailure,
      },
      pt: {
        id: maskId(ptId),
        numero: documentNumber,
        status: currentStatus,
        resumed: Boolean(resumablePt),
      },
      validation: {
        status: validation.status,
        documentCode: validation.body?.documentCode || null,
        finalPdfHashBeforeAttach: validation.body?.finalPdfHash || null,
        routeAvailable: !validationContextUnavailable,
      },
      attachment: {
        status: attachment?.status || null,
        fileKey: maskId(attachment?.body?.fileKey),
        folderPath: attachment?.body?.folderPath
          ? String(attachment.body.folderPath)
              .split('/')
              .map((segment, index, arr) =>
                index === 0 || index === arr.length - 1
                  ? segment
                  : maskId(segment),
              )
              .join('/')
          : null,
      },
      storage: {
        pdfAccessStatus: pdfAccess.status,
        availability: pdfAccess.body?.availability || null,
        hasFinalPdf: Boolean(pdfAccess.body?.hasFinalPdf),
      },
      database: {
        ptId: maskId(database.pt.id),
        ptCompanyId: maskId(database.pt.company_id),
        siteCompanyId: maskId(database.pt.site_company_id),
        responsavelCompanyId: maskId(database.pt.responsavel_company_id),
        aprovadorCompanyId: maskId(database.pt.aprovador_company_id),
        documentRegistryId: maskId(database.document.id),
        documentRegistryCompanyId: maskId(database.document.company_id),
        documentCode: database.document.document_code,
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
    });

    fs.writeFileSync(artifactPaths.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
