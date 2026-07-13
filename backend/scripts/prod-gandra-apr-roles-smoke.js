/**
 * Smoke test controlado de emissão de APR em produção POR PAPEL (Gandra).
 *
 * Valida as funções de emissão com os perfis reais do produto:
 *
 * Cenário A — Administrador Geral (emissão solo):
 *   cria → assina participante → approve (privilegiado: todas as etapas)
 *   → generate-final-pdf (server-side/Puppeteer) → registry com hash.
 *
 * Cenário B — Fluxo multi-papel (workflow default de 3 etapas):
 *   TST cria e assina → TST aprova etapa 1 (Validação técnica SST)
 *   → SUPERVISOR aprova etapa 2 (Liberação da supervisão)
 *   → ADMIN_EMPRESA aprova etapa 3 (Aprovação gerencial)
 *   → TST gera o PDF final → registry com hash + 3 etapas com aprovadores
 *   distintos verificadas no banco.
 *
 * Salvaguardas: env de teste seguro obrigatório, números com sufixos
 * -APR-ADM-001/-APR-FLX-001 (máx. 1 documento por cenário, resumível),
 * dados sintéticos, PII mascarada.
 */
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
const PRODUCTION_SAFE_TEST_MODE =
  String(process.env.PRODUCTION_SAFE_TEST_MODE || 'true').trim() === 'true';
const DISABLE_EXTERNAL_NOTIFICATIONS =
  String(process.env.DISABLE_EXTERNAL_NOTIFICATIONS || 'true').trim() ===
  'true';
const CLEANUP_TEST_DATA =
  String(process.env.CLEANUP_TEST_DATA || 'false').trim() === 'true';

const SMOKE_PIN = '1234';
const UA = 'sgs-prod-gandra-apr-roles-smoke/1.0';

// Usuários smoke por papel (um CPF base distinto por perfil).
const SMOKE_USERS = {
  ADMIN_GERAL: {
    profile: 'Administrador Geral',
    name: 'K6 TESTE GANDRA APR ADM GERAL',
    email: 'k6.gandra.apr.admgeral.smoke@invalid.local',
    baseCpf: '987654309',
  },
  TST: {
    profile: 'Técnico de Segurança do Trabalho (TST)',
    name: 'K6 TESTE GANDRA APR TST',
    email: 'k6.gandra.apr.tst.smoke@invalid.local',
    baseCpf: '987654308',
  },
  SUPERVISOR: {
    profile: 'Supervisor / Encarregado',
    name: 'K6 TESTE GANDRA APR SUPERVISOR',
    email: 'k6.gandra.apr.supervisor.smoke@invalid.local',
    baseCpf: '987654307',
  },
  ADMIN_EMPRESA: {
    profile: 'Administrador da Empresa',
    name: 'K6 TESTE GANDRA APR CONTROLADO',
    email: 'k6.gandra.apr.smoke@invalid.local',
    baseCpf: '987654320',
  },
};

function assertSafeMode() {
  if (!TEST_COMPANY_ID) throw new Error('TEST_COMPANY_ID ausente. Abortando.');
  if (TEST_COMPANY_NAME !== 'Gandra Tecnologia')
    throw new Error(`TEST_COMPANY_NAME inesperado (${TEST_COMPANY_NAME}).`);
  if (!PRODUCTION_SAFE_TEST_MODE)
    throw new Error('PRODUCTION_SAFE_TEST_MODE=false. Abortando.');
  if (!DISABLE_EXTERNAL_NOTIFICATIONS)
    throw new Error('DISABLE_EXTERNAL_NOTIFICATIONS=false. Abortando.');
  if (CLEANUP_TEST_DATA) throw new Error('CLEANUP_TEST_DATA=true. Abortando.');
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

function buildNumero(suffix) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${TEST_DOCUMENT_PREFIX}${stamp}-APR-${suffix}`;
}

function getReportPath(name) {
  const tempDir = path.resolve(__dirname, '../temp');
  fs.mkdirSync(tempDir, { recursive: true });
  return path.join(tempDir, `${name.replace(/[^A-Z0-9_-]/gi, '_')}.json`);
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
    throw new Error(`Falha ao obter CSRF. status=${csrfRes.status}`);
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
  headers['x-company-id'] = TEST_COMPANY_ID;
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
  return { accessToken: loginBody.accessToken };
}

async function assertTargetCompany(client) {
  const companyRes = await client.query(
    `SELECT id, razao_social FROM companies
      WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [TEST_COMPANY_ID],
  );
  if (companyRes.rows.length !== 1)
    throw new Error(`Empresa alvo não encontrada (${maskId(TEST_COMPANY_ID)}).`);
  if (String(companyRes.rows[0].razao_social).trim() !== TEST_COMPANY_NAME)
    throw new Error('Empresa do ID informado não corresponde ao nome esperado.');
  return companyRes.rows[0];
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

async function resolveProfileId(client, profileName) {
  const profileRes = await client.query(
    `SELECT id FROM profiles WHERE nome = $1 LIMIT 1`,
    [profileName],
  );
  if (!profileRes.rows.length)
    throw new Error(`Perfil não encontrado: ${profileName}`);
  return profileRes.rows[0].id;
}

async function reconcileSmokeUser(client, siteId, spec) {
  const profileId = await resolveProfileId(client, spec.profile);
  const smokePassword = `Tmp!${crypto.randomUUID()}Aa9`;
  const smokeCpf = computeCpfCheckDigits(spec.baseCpf);
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
      [spec.email, cpfPayload.cpf_hash],
    );

    let userId = null;
    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      if (existing.company_id !== TEST_COMPANY_ID) {
        throw new Error(
          `Usuário smoke ${spec.email} já existe em outro tenant.`,
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
          spec.name,
          cpfPayload.cpf_hash,
          cpfPayload.cpf_ciphertext,
          spec.email,
          'Smoke Controlado',
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
          spec.name,
          cpfPayload.cpf_hash,
          cpfPayload.cpf_ciphertext,
          spec.email,
          'Smoke Controlado',
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

    return { userId, smokeCpf, smokePassword, profile: spec.profile };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function buildCreateAprPayload(siteId, elaboradorId, participants, numero) {
  const now = new Date();
  const start = new Date(now.getTime() + 10 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    numero,
    titulo: `${numero} APR smoke por papel`,
    descricao:
      'Documento de teste controlado em produção. Sem assinatura real. Sem integração externa. Dados sintéticos.',
    tipo_atividade: 'Teste documental controlado',
    frente_trabalho: 'Frente de teste SGS',
    area_risco: 'Área de validação técnica',
    data_inicio: start.toISOString(),
    data_fim: end.toISOString(),
    site_id: siteId,
    elaborador_id: elaboradorId,
    participants,
    probability: 1,
    severity: 1,
    exposure: 1,
    residual_risk: 'LOW',
    risk_items: [
      {
        atividade: 'Atividade de teste controlado (smoke por papel)',
        etapa: 'Etapa de teste controlado',
        condicao_perigosa:
          'Condicao perigosa sintetica para validacao documental (sem execucao real)',
        possiveis_lesoes: 'Lesao hipotetica de teste',
        medidas_prevencao:
          'Medida de controle sintetica para smoke test. Sem execucao operacional.',
        responsavel: 'Smoke Controlado',
        probabilidade: 1,
        severidade: 1,
      },
    ],
  };
}

async function findAprByNumero(client, numero) {
  const res = await client.query(
    `SELECT id, numero, status, pdf_file_key FROM aprs
      WHERE company_id = $1 AND deleted_at IS NULL AND numero = $2
      ORDER BY created_at DESC LIMIT 1`,
    [TEST_COMPANY_ID, numero],
  );
  return res.rows[0] || null;
}

async function signAsParticipant(session, aprId) {
  const signature = await requestJson('/signatures', session.accessToken, {
    method: 'POST',
    includeCsrf: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_id: aprId,
      document_type: 'APR',
      signature_data: 'SMOKE-TEST-CONTROLADO-SEM-VALOR-JURIDICO',
      type: 'hmac',
      pin: SMOKE_PIN,
    }),
  });
  if (!signature.ok) {
    throw new Error(
      `Assinatura do participante falhou. status=${signature.status} body=${JSON.stringify(signature.body)}`,
    );
  }
}

async function approveAs(session, aprId, label) {
  const approved = await requestJson(
    `/aprs/${aprId}/approve`,
    session.accessToken,
    {
      method: 'PATCH',
      includeCsrf: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: `Smoke test controlado — aprovação ${label}.`,
      }),
    },
  );
  if (!approved.ok) {
    throw new Error(
      `Aprovação (${label}) falhou. status=${approved.status} body=${JSON.stringify(approved.body)}`,
    );
  }
  return approved.body;
}

async function generateFinalPdf(session, aprId, label) {
  const generated = await requestJson(
    `/aprs/${aprId}/generate-final-pdf`,
    session.accessToken,
    {
      method: 'POST',
      includeCsrf: true,
      headers: { 'Content-Type': 'application/json' },
    },
  );
  if (!generated.ok) {
    throw new Error(
      `Geração do PDF final (${label}) falhou. status=${generated.status} body=${JSON.stringify(generated.body)}`,
    );
  }
  return generated.body;
}

async function verifyApr(client, aprId, expected) {
  const aprRes = await client.query(
    `SELECT id, numero, status, company_id, pdf_file_key FROM aprs WHERE id = $1`,
    [aprId],
  );
  const apr = aprRes.rows[0];
  if (!apr) throw new Error('APR não encontrada na verificação final.');
  if (apr.company_id !== TEST_COMPANY_ID)
    throw new Error('APR fora do tenant esperado.');
  if (apr.status !== 'Aprovada' && apr.status !== 'Encerrada')
    throw new Error(`APR não aprovada (status=${apr.status}).`);
  if (!apr.pdf_file_key) throw new Error('APR sem PDF final.');

  const registryRes = await client.query(
    `SELECT id, company_id, document_code, file_hash IS NOT NULL AS has_hash, status
       FROM document_registry
      WHERE module = 'apr' AND entity_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [aprId],
  );
  const registry = registryRes.rows[0];
  if (!registry) throw new Error('Registro governado ausente.');
  if (registry.company_id !== TEST_COMPANY_ID)
    throw new Error('Registro governado em tenant incorreto.');

  const stepsRes = await client.query(
    `SELECT level_order, title, approver_role, status, approver_user_id
       FROM apr_approval_steps
      WHERE apr_id = $1
      ORDER BY level_order ASC`,
    [aprId],
  );

  if (expected?.distinctApprovers) {
    const approvers = new Set(
      stepsRes.rows
        .filter((s) => s.status === 'APPROVED' || s.status === 'approved')
        .map((s) => s.approver_user_id)
        .filter(Boolean),
    );
    if (approvers.size < expected.distinctApprovers) {
      throw new Error(
        `Esperados >=${expected.distinctApprovers} aprovadores distintos; encontrados ${approvers.size}.`,
      );
    }
  }

  return {
    status: apr.status,
    documentCode: registry.document_code,
    registryHasHash: registry.has_hash,
    registryStatus: registry.status,
    steps: stepsRes.rows.map((s) => ({
      order: s.level_order,
      title: s.title,
      role: s.approver_role,
      status: s.status,
      approver: maskId(s.approver_user_id),
    })),
  };
}

async function run() {
  assertSafeMode();
  const conn = await connectRuntimePgClient();
  const client = conn.client;
  const warnings = [];

  try {
    await client.query(`SELECT set_config('app.is_super_admin','true',false)`);
    await assertTargetCompany(client);
    const site = await pickTargetSite(client);

    // Reconciliar os 4 usuários smoke (um por papel) e logar
    const users = {};
    const sessions = {};
    for (const [key, spec] of Object.entries(SMOKE_USERS)) {
      users[key] = await reconcileSmokeUser(client, site.id, spec);
      sessions[key] = await login(users[key].smokeCpf, users[key].smokePassword);
    }

    // ─── Cenário A: ADMIN_GERAL emite sozinho ─────────────────────────────
    const numeroAdm = buildNumero('ADM-001');
    let aprAdm = await findAprByNumero(client, numeroAdm);
    if (aprAdm) warnings.push(`resuming_apr_adm:${maskId(aprAdm.id)}`);

    if (!aprAdm) {
      const created = await requestJson('/aprs', sessions.ADMIN_GERAL.accessToken, {
        method: 'POST',
        includeCsrf: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildCreateAprPayload(
            site.id,
            users.ADMIN_GERAL.userId,
            [users.ADMIN_GERAL.userId],
            numeroAdm,
          ),
        ),
      });
      if (!created.ok || !created.body?.id) {
        throw new Error(
          `[A] Criação pela ADMIN_GERAL falhou. status=${created.status} body=${JSON.stringify(created.body)}`,
        );
      }
      aprAdm = { id: created.body.id, status: created.body.status };
    }

    if (aprAdm.status === 'Pendente' || !aprAdm.status) {
      await signAsParticipant(sessions.ADMIN_GERAL, aprAdm.id);
      await approveAs(sessions.ADMIN_GERAL, aprAdm.id, 'ADMIN_GERAL (todas as etapas)');
    }
    if (!aprAdm.pdf_file_key) {
      await generateFinalPdf(sessions.ADMIN_GERAL, aprAdm.id, 'ADMIN_GERAL');
    }
    const admResult = await verifyApr(client, aprAdm.id, {});

    // ─── Cenário B: fluxo multi-papel TST → SUPERVISOR → ADMIN_EMPRESA ────
    const numeroFlx = buildNumero('FLX-001');
    let aprFlx = await findAprByNumero(client, numeroFlx);
    if (aprFlx) warnings.push(`resuming_apr_flx:${maskId(aprFlx.id)}`);

    if (!aprFlx) {
      const created = await requestJson('/aprs', sessions.TST.accessToken, {
        method: 'POST',
        includeCsrf: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildCreateAprPayload(
            site.id,
            users.TST.userId,
            [users.TST.userId],
            numeroFlx,
          ),
        ),
      });
      if (!created.ok || !created.body?.id) {
        throw new Error(
          `[B] Criação pelo TST falhou. status=${created.status} body=${JSON.stringify(created.body)}`,
        );
      }
      aprFlx = { id: created.body.id, status: created.body.status };
    }

    if (aprFlx.status === 'Pendente' || !aprFlx.status) {
      await signAsParticipant(sessions.TST, aprFlx.id);
      await approveAs(sessions.TST, aprFlx.id, 'TST (etapa 1 — validação técnica)');
      await approveAs(
        sessions.SUPERVISOR,
        aprFlx.id,
        'SUPERVISOR (etapa 2 — liberação da supervisão)',
      );
      await approveAs(
        sessions.ADMIN_EMPRESA,
        aprFlx.id,
        'ADMIN_EMPRESA (etapa 3 — aprovação gerencial)',
      );
    }
    if (!aprFlx.pdf_file_key) {
      await generateFinalPdf(sessions.TST, aprFlx.id, 'TST');
    }
    const flxResult = await verifyApr(client, aprFlx.id, {
      distinctApprovers: 3,
    });

    const report = {
      apiBaseUrl: API_BASE_URL,
      warnings,
      company: { name: TEST_COMPANY_NAME, id: maskId(TEST_COMPANY_ID) },
      smokeUsers: Object.fromEntries(
        Object.entries(users).map(([k, u]) => [
          k,
          { id: maskId(u.userId), profile: u.profile, email: maskEmail(SMOKE_USERS[k].email) },
        ]),
      ),
      cenarioA_adminGeral: {
        numero: numeroAdm,
        aprId: maskId(aprAdm.id),
        ...admResult,
      },
      cenarioB_fluxoMultiPapel: {
        numero: numeroFlx,
        aprId: maskId(aprFlx.id),
        ...flxResult,
      },
      safeguards: {
        productionSafeTestMode: PRODUCTION_SAFE_TEST_MODE,
        disableExternalNotifications: DISABLE_EXTERNAL_NOTIFICATIONS,
        cleanupTestData: CLEANUP_TEST_DATA,
      },
    };

    fs.writeFileSync(
      getReportPath(`${TEST_DOCUMENT_PREFIX}APR-ROLES`),
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
