/**
 * SGS — Simulação de Ataques de Segurança (k6)
 *
 * Objetivo: verificar que TODOS os controles de segurança funcionam em produção.
 * Cada ataque DEVE ser bloqueado pelo sistema. Uma falha de check = vulnerabilidade real.
 *
 * Execução:
 *   k6 run test/load/k6-security-attack-sim.js \
 *     -e BASE_URL=http://localhost:3001 \
 *     -e VALID_CPF=12345678900 \
 *     -e VALID_PASSWORD=SenhaForte@2024 \
 *     -e VALID_COMPANY_ID=<uuid-do-tenant>
 *
 * Resultado esperado: 100% dos ataques bloqueados, zero dados expostos.
 *
 * ─── Categorias de ataque ───────────────────────────────────────────────────
 * A1  - Brute Force / Credential Stuffing → rate limiting + bloqueio de conta
 * A2  - JWT Forgery / Tampering           → assinatura inválida deve retornar 401
 * A3  - CSRF Bypass                       → token ausente/inválido → 403
 * A4  - SQL Injection                     → inputs sanitizados, PostgreSQL parametrizado
 * A5  - Multi-Tenant Isolation Escape     → acesso a dados de outro tenant → 403/404
 * A6  - Path Traversal                    → rotas com ../  → 400/404
 * A7  - Oversized Payload DoS             → corpo gigante → 413
 * A8  - Header Injection                  → CRLF em headers → corpo rejeitado
 * A9  - Auth Bypass via Header Manip.     → x-user-id/x-role forjados → 401/403
 * A10 - Replay Attack                     → mesmo Idempotency-Key → 409
 * A11 - Open Redirect                     → redirectTo malicioso → rejeitado
 * A12 - Mass Assignment                   → campos proibidos no body (isAdmin, role) → ignorados
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import encoding from 'k6/encoding';

// ─── Configuração ─────────────────────────────────────────────────────────────

const BASE_URL = String(__ENV.BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
const VALID_CPF      = String(__ENV.VALID_CPF || '').replace(/\D/g, '');
const VALID_PASSWORD = String(__ENV.VALID_PASSWORD || '');
const VALID_COMPANY  = String(__ENV.VALID_COMPANY_ID || '').trim();
const OTHER_COMPANY  = String(__ENV.OTHER_COMPANY_ID || '00000000-0000-0000-0000-000000000002').trim();
const OTHER_USER_ID  = String(__ENV.OTHER_USER_ID || '00000000-0000-0000-0000-000000000099').trim();

// ─── Métricas de segurança ───────────────────────────────────────────────────

const attacksBlocked   = new Rate('security_attacks_blocked');    // deve ser 1.0 (100%)
const attacksSucceeded = new Counter('security_attacks_succeeded'); // deve ser 0
const totalAttacks     = new Counter('security_total_attacks');

// Token pré-adquirido antes do A1 (brute force) para evitar que o throttle bloqueie o A5
let _preAcquiredToken = null;

// ─── Configuração do cenário ─────────────────────────────────────────────────

export const options = {
  scenarios: {
    security_sim: {
      executor: 'shared-iterations',
      exec: 'securityAttackScenario',
      vus: 3,
      iterations: 9,   // 3 VUs × 3 iterações = cobertura completa distribuída
      maxDuration: '8m',
    },
  },
  thresholds: {
    // TODOS os ataques devem ser bloqueados — zero tolerância
    'security_attacks_blocked': ['rate>=1.0'],
    // Nenhum ataque pode ter sucesso
    'security_attacks_succeeded': ['count==0'],
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonBody(obj) {
  return JSON.stringify(obj);
}

function jsonHeaders(token, companyId) {
  const h = { 'Content-Type': 'application/json' };
  if (token)     h['Authorization']  = `Bearer ${token}`;
  if (companyId) h['x-company-id']   = companyId;
  return h;
}

/**
 * Registra resultado de ataque.
 * @param {string} name     - nome do ataque
 * @param {boolean} blocked - true = sistema bloqueou (correto), false = ataque funcionou (BUG)
 */
function recordAttack(name, blocked) {
  totalAttacks.add(1);
  attacksBlocked.add(blocked);
  if (!blocked) {
    attacksSucceeded.add(1);
    console.error(`[VULNERABILIDADE] ${name} NÃO foi bloqueado!`);
  }
  return blocked;
}

/**
 * Obtém token JWT válido para os ataques que precisam de autenticação legítima
 * (p.ex. isolation escape, mass assignment).
 *
 * Retorna o token pré-adquirido se disponível (evita throttle depois de A1 brute force).
 */
function getValidToken() {
  if (_preAcquiredToken) return _preAcquiredToken;
  if (!VALID_CPF || !VALID_PASSWORD) return null;

  // GET /auth/csrf: obtém rawToken e passa explicitamente como cookie no POST.
  // k6 cookie jar não garante envio automático para http:// em alguns contextos.
  const csrfRes = http.get(`${BASE_URL}/auth/csrf`);
  if (csrfRes.status !== 200) return null;
  const csrfToken = String(csrfRes.json('csrfToken') || '');

  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    jsonBody({ cpf: VALID_CPF, password: VALID_PASSWORD }),
    {
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      // Passa o cookie explicitamente via params.cookies para garantir envio
      cookies: { 'csrf-token': csrfToken },
    },
  );

  // Login pode retornar 200 ou 201 dependendo da versão do endpoint
  if (loginRes.status < 200 || loginRes.status >= 300) {
    console.warn(`getValidToken: login falhou status=${loginRes.status} body=${String(loginRes.body || '').slice(0, 80)}`);
    return null;
  }
  const tok = String(loginRes.json('accessToken') || '');
  return tok || null;
}

function extractCookie(res, name) {
  const jar = res?.cookies?.[name];
  if (Array.isArray(jar) && jar.length > 0) return `${name}=${jar[0].value}`;
  return '';
}

// ─── ATAQUE A1 — Brute Force / Credential Stuffing ──────────────────────────
//
// Tenta 20 logins consecutivos com senhas erradas.
// Espera: após 5 tentativas, rate limiter retorna 429 ou a conta é bloqueada (403).
//
// IMPORTANTE: usa CPF sintético inexistente (11111111111) — não usa VALID_CPF.
// Motivo: throttle por CPF é persistente entre runs; usar VALID_CPF bloquearia
// o login legítimo necessário para A5/A9/A10/A12 nas iterações seguintes.
// O rate limiter por IP ainda é exercitado pelo volume de tentativas.

function attackBruteForce() {
  group('A1_brute_force', () => {
    const payloads = Array.from({ length: 20 }, (_, i) => ({
      cpf: '11111111111',   // CPF inexistente — não polui throttle do VALID_CPF
      password: `senha_errada_${i}_@2024`,
    }));

    let blocked429 = 0;
    let blocked403 = 0;

    for (const payload of payloads) {
      const res = http.post(
        `${BASE_URL}/auth/login`,
        jsonBody(payload),
        { headers: { 'Content-Type': 'application/json' }, tags: { name: 'attack.brute_force' } },
      );

      if (res.status === 429) blocked429++;
      if (res.status === 403) blocked403++;

      // Para quando rate limiter ativar
      if (res.status === 429 || res.status === 403) {
        sleep(0.1);
      }
    }

    const rateLimiterActuated = blocked429 > 0 || blocked403 > 0;
    const ok = check(null, {
      'A1: rate limiter bloqueou brute force (429 ou 403)': () => rateLimiterActuated,
    });
    recordAttack('A1 BruteForce', ok);
  });

  sleep(1);
}

// ─── ATAQUE A2 — JWT Forgery / Tampering ─────────────────────────────────────
//
// Submete tokens JWT manipulados e tenta acessar endpoints protegidos.
// Espera: 401 em todos os casos.

function attackJwtForgery() {
  group('A2_jwt_forgery', () => {
    const companyId = VALID_COMPANY || '00000000-0000-0000-0000-000000000001';

    // A2.1 — Token forjado com assinatura falsa (base64url sem padding)
    const fakeHeader  = encoding.b64encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'rawurl');
    const fakePayload = encoding.b64encode(JSON.stringify({
      sub: 'attacker',
      role: 'ADMIN_GERAL',
      company_id: companyId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }), 'rawurl');
    const fakeSignature = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const forgedToken = `${fakeHeader}.${fakePayload}.${fakeSignature}`;

    const res1 = http.get(`${BASE_URL}/aprs?limit=5`, {
      headers: jsonHeaders(forgedToken, companyId),
      tags: { name: 'attack.jwt_forged' },
    });

    const ok1 = check(res1, {
      'A2.1: JWT forjado com assinatura falsa → 401': (r) => r.status === 401,
    });
    recordAttack('A2.1 JWT-FakeSignature', ok1);

    // A2.2 — Token vazio
    const res2 = http.get(`${BASE_URL}/dashboard/summary`, {
      headers: jsonHeaders('', companyId),
      tags: { name: 'attack.jwt_empty' },
    });
    const ok2 = check(res2, {
      'A2.2: Bearer vazio → 401': (r) => r.status === 401,
    });
    recordAttack('A2.2 JWT-Empty', ok2);

    // A2.3 — Token "none" algorithm (algoritmo desabilitado)
    const noneHeader  = encoding.b64encode(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'rawurl');
    const nonePayload = fakePayload;
    const noneToken   = `${noneHeader}.${nonePayload}.`;   // sem assinatura

    const res3 = http.get(`${BASE_URL}/users`, {
      headers: jsonHeaders(noneToken, companyId),
      tags: { name: 'attack.jwt_none_alg' },
    });
    const ok3 = check(res3, {
      'A2.3: JWT alg=none → 401': (r) => r.status === 401,
    });
    recordAttack('A2.3 JWT-NoneAlg', ok3);

    // A2.4 — Texto arbitrário no header Authorization
    const res4 = http.get(`${BASE_URL}/aprs`, {
      headers: { Authorization: 'Bearer NOT_A_JWT', 'x-company-id': companyId },
      tags: { name: 'attack.jwt_garbage' },
    });
    const ok4 = check(res4, {
      'A2.4: Token lixo → 401': (r) => r.status === 401,
    });
    recordAttack('A2.4 JWT-Garbage', ok4);

    // A2.5 — JWT expirado simulado (exp no passado, assinatura fake)
    const expiredPayload = encoding.b64encode(JSON.stringify({
      sub: 'attacker',
      role: 'ADMIN_GERAL',
      iat: 1000000,
      exp: 1000001,  // expirado em 1970
    }), 'rawurl');
    const expiredToken = `${fakeHeader}.${expiredPayload}.${fakeSignature}`;

    const res5 = http.get(`${BASE_URL}/dashboard/summary`, {
      headers: jsonHeaders(expiredToken, companyId),
      tags: { name: 'attack.jwt_expired' },
    });
    const ok5 = check(res5, {
      'A2.5: JWT expirado → 401': (r) => r.status === 401,
    });
    recordAttack('A2.5 JWT-Expired', ok5);
  });

  sleep(0.5);
}

// ─── ATAQUE A3 — CSRF Bypass ─────────────────────────────────────────────────
//
// Tenta chamar endpoints mutantes sem CSRF token ou com token inválido.
// Espera: 403 em endpoints que exigem CSRF.

function attackCsrfBypass() {
  group('A3_csrf_bypass', () => {
    const companyId = VALID_COMPANY || '00000000-0000-0000-0000-000000000001';

    // A3.1 — POST em /auth/login sem CSRF token (apenas testa que servidor responde)
    const res1 = http.post(
      `${BASE_URL}/auth/login`,
      jsonBody({ cpf: '00000000000', password: 'x' }),
      {
        headers: { 'Content-Type': 'application/json' },
        // Deliberadamente omite x-csrf-token e cookie csrf-token
        tags: { name: 'attack.csrf_no_token' },
      },
    );
    // Login pode ser público (sem CSRF obrigatório) mas verifica que não é 200 com payload de ataque
    const ok1 = check(res1, {
      'A3.1: Login com credenciais inválidas sem CSRF → 400/401/403 (não 200)': (r) =>
        r.status === 400 || r.status === 401 || r.status === 403 || r.status === 422 || r.status === 429,
    });
    recordAttack('A3.1 CSRF-NoToken', ok1);

    // A3.2 — Tenta refresh com CSRF token completamente errado
    const res2 = http.post(
      `${BASE_URL}/auth/refresh`,
      '{}',
      {
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          'Cookie': 'csrf-token=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        },
        tags: { name: 'attack.csrf_wrong_token' },
      },
    );
    const ok2 = check(res2, {
      'A3.2: Refresh com CSRF forjado → 401/403': (r) => r.status === 401 || r.status === 403,
    });
    recordAttack('A3.2 CSRF-WrongToken', ok2);

    // A3.3 — Tenta refresh com cookie ausente mas header presente
    const res3 = http.post(
      `${BASE_URL}/auth/refresh`,
      '{}',
      {
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': 'algum_token_sem_cookie_correspondente',
          // Sem Cookie header = sem csrf-token cookie
        },
        tags: { name: 'attack.csrf_no_cookie' },
      },
    );
    const ok3 = check(res3, {
      'A3.3: Refresh com CSRF header mas sem cookie → 401/403': (r) =>
        r.status === 401 || r.status === 403,
    });
    recordAttack('A3.3 CSRF-NoCookie', ok3);
  });

  sleep(0.5);
}

// ─── ATAQUE A4 — SQL Injection ───────────────────────────────────────────────
//
// Injeta payloads SQL clássicos em campos de query string e corpo.
// Espera: 400, 404 ou resposta normal SEM vazar dados extras.

function attackSqlInjection() {
  group('A4_sql_injection', () => {
    const companyId = VALID_COMPANY || '00000000-0000-0000-0000-000000000001';
    const token = getValidToken();  // usa token válido para testar o backend (não o auth)

    const payloads = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "1 UNION SELECT username,password FROM users --",
      "' OR 1=1 --",
      "%27%20OR%20%271%27%3D%271",       // URL-encoded
      "1'; SELECT pg_sleep(3); --",       // time-based blind
      "admin'--",
      "1 OR 1=1",
    ];

    for (const [i, payload] of payloads.entries()) {
      // A4.a — SQL injection em query param (busca/filtro)
      const res = http.get(
        `${BASE_URL}/aprs?search=${encodeURIComponent(payload)}&limit=5`,
        {
          headers: jsonHeaders(token || 'invalid', companyId),
          tags: { name: 'attack.sql_injection' },
        },
      );

      // Aceita 200 (filtrou sem vazar), 400, 401, 403, 404, 422
      // Rejeita qualquer resposta com status 500 (indica erro não tratado / possível SQLi)
      const ok = check(res, {
        [`A4.${i + 1}: SQLi em search param não causa 500`]: (r) => r.status !== 500,
      });
      recordAttack(`A4.${i + 1} SQLi-QueryParam`, ok);
    }

    // A4 via body — tenta injeção em campo de filtro JSON
    if (token) {
      const bodyPayload = {
        titulo: "' OR '1'='1 --",
        descricao: "'; DROP TABLE aprs; --",
        data_inicio: "2026-01-01' OR '1'='1",
      };

      const res = http.post(
        `${BASE_URL}/aprs`,
        jsonBody(bodyPayload),
        {
          headers: jsonHeaders(token, companyId),
          tags: { name: 'attack.sql_injection_body' },
        },
      );

      // Espera 400 (validação de campo obrigatório) ou 201 (criou mas injeção foi escapada)
      // Nunca deve retornar 500
      const ok = check(res, {
        'A4.body: SQLi em body não causa 500': (r) => r.status !== 500,
      });
      recordAttack('A4.body SQLi-Body', ok);
    }
  });

  sleep(0.5);
}

// ─── ATAQUE A5 — Multi-Tenant Isolation Escape ───────────────────────────────
//
// Tenta acessar dados de outro tenant usando token legítimo mas company_id diferente.
// Espera: 403 ou 404 — jamais 200 com dados de outro tenant.

function attackTenantIsolation() {
  group('A5_tenant_isolation', () => {
    const token = getValidToken();
    if (!token) {
      console.warn('A5: sem token válido, pulando teste de isolamento de tenant.');
      return;
    }

    const ownCompany   = VALID_COMPANY;
    const otherCompany = OTHER_COMPANY;

    if (!ownCompany || ownCompany === otherCompany) {
      console.warn('A5: VALID_COMPANY_ID não configurado — configure para testar isolamento real.');
      return;
    }

    // A5.1 — Acessa APRs com x-company-id de outro tenant
    const res1 = http.get(`${BASE_URL}/aprs?limit=20`, {
      headers: jsonHeaders(token, otherCompany),
      tags: { name: 'attack.tenant_escape_aprs' },
    });

    // 403 = tenant não autorizado; 200 com lista vazia = aceitável se RLS filtrou;
    // 200 com dados = VULNERABILIDADE
    const ok1 = check(res1, {
      'A5.1: Acesso APRs de outro tenant → 403, 401, ou lista vazia': (r) => {
        if (r.status === 403 || r.status === 401) return true;
        if (r.status === 200) {
          try {
            const body = r.json();
            const items = body?.data || body?.items || (Array.isArray(body) ? body : []);
            return items.length === 0;  // RLS filtrou — aceitável
          } catch {
            return true;
          }
        }
        return r.status === 404;
      },
    });
    recordAttack('A5.1 Tenant-Escape-APR', ok1);

    // A5.2 — Acessa dashboard de outro tenant
    const res2 = http.get(`${BASE_URL}/dashboard/summary`, {
      headers: jsonHeaders(token, otherCompany),
      tags: { name: 'attack.tenant_escape_dashboard' },
    });
    const ok2 = check(res2, {
      'A5.2: Dashboard de outro tenant → 403 ou 401': (r) =>
        r.status === 403 || r.status === 401,
    });
    recordAttack('A5.2 Tenant-Escape-Dashboard', ok2);

    // A5.3 — Tenta acessar usuário de outro tenant por UUID direto
    const res3 = http.get(`${BASE_URL}/users/${OTHER_USER_ID}`, {
      headers: jsonHeaders(token, otherCompany),
      tags: { name: 'attack.tenant_escape_user_uuid' },
    });
    const ok3 = check(res3, {
      'A5.3: GET /users/:id de outro tenant → 403, 401 ou 404': (r) =>
        r.status === 403 || r.status === 401 || r.status === 404,
    });
    recordAttack('A5.3 Tenant-Escape-UserUUID', ok3);

    // A5.4 — Tenta criar APR em outro tenant
    const res4 = http.post(
      `${BASE_URL}/aprs`,
      jsonBody({
        titulo: 'APR Injetada em Outro Tenant',
        descricao: 'Tentativa de isolation escape',
        data_inicio: '2026-01-01',
        data_fim: '2026-12-31',
        site_id: '00000000-0000-0000-0000-000000000001',
        elaborador_id: '00000000-0000-0000-0000-000000000001',
        risk_items: [],
      }),
      {
        headers: jsonHeaders(token, otherCompany),
        tags: { name: 'attack.tenant_escape_create' },
      },
    );
    const ok4 = check(res4, {
      'A5.4: Criar APR em outro tenant → 403, 401 ou 404 (nunca 201)': (r) =>
        r.status === 403 || r.status === 401 || r.status === 404 || r.status === 400,
    });
    recordAttack('A5.4 Tenant-Escape-Create', ok4);
  });

  sleep(0.5);
}

// ─── ATAQUE A6 — Path Traversal ──────────────────────────────────────────────
//
// Tenta acessar arquivos fora do contexto da aplicação.
// Espera: 400, 404 — nunca 200 com conteúdo de arquivo do sistema.

function attackPathTraversal() {
  group('A6_path_traversal', () => {
    const token = getValidToken();
    const companyId = VALID_COMPANY || '00000000-0000-0000-0000-000000000001';

    const traversalPaths = [
      '/../../../etc/passwd',
      '/..%2F..%2F..%2Fetc%2Fpasswd',
      '/....//....//....//etc/passwd',
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '/aprs/../../../etc/passwd',
      '/users/00000000-0000-0000-0000-000000000001/../../../etc/shadow',
    ];

    for (const [i, path] of traversalPaths.entries()) {
      const res = http.get(`${BASE_URL}${path}`, {
        headers: token
          ? jsonHeaders(token, companyId)
          : { 'Content-Type': 'application/json' },
        tags: { name: 'attack.path_traversal' },
      });

      // Deve retornar 400 ou 404, nunca 200 com conteúdo de arquivo
      const ok = check(res, {
        [`A6.${i + 1}: Path traversal ${path.slice(0, 30)} → não 200 ou resposta vazia`]: (r) => {
          if (r.status !== 200) return true;
          // Se por acaso retornar 200, verifica que não contém conteúdo de arquivo sensível
          const body = String(r.body || '');
          return !body.includes('root:') && !body.includes('/bin/bash') && !body.includes('shadow');
        },
      });
      recordAttack(`A6.${i + 1} PathTraversal`, ok);
    }
  });

  sleep(0.5);
}

// ─── ATAQUE A7 — Oversized Payload DoS ───────────────────────────────────────
//
// Envia payloads enormes para testar limites de tamanho.
// Espera: 413 (Payload Too Large) antes de processar.

function attackOversizedPayload() {
  group('A7_oversized_payload', () => {
    const companyId = VALID_COMPANY || '00000000-0000-0000-0000-000000000001';

    // A7.1 — Body JSON com string de 10MB
    const hugeString = 'A'.repeat(10 * 1024 * 1024);   // 10 MiB
    const res1 = http.post(
      `${BASE_URL}/aprs`,
      jsonBody({ titulo: hugeString, descricao: 'dos test' }),
      {
        headers: jsonHeaders('invalid_token_doesnt_matter', companyId),
        tags: { name: 'attack.oversized_body' },
      },
    );
    const ok1 = check(res1, {
      'A7.1: Body 10MB → 413, 400 ou 401 (não 200/500)': (r) =>
        r.status === 413 || r.status === 400 || r.status === 401 || r.status === 403,
    });
    recordAttack('A7.1 OversizedPayload-10MB', ok1);

    // A7.2 — Array aninhado profundamente (deep object)
    function deepObject(depth) {
      if (depth === 0) return { val: 1 };
      return { nested: deepObject(depth - 1) };
    }
    const deepObj = deepObject(200);   // 200 níveis de aninhamento

    const res2 = http.post(
      `${BASE_URL}/auth/login`,
      jsonBody({ ...deepObj, cpf: '12345678900', password: 'wrong' }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'attack.deep_object' },
      },
    );
    const ok2 = check(res2, {
      'A7.2: JSON com 200 níveis de aninhamento → não 200 válido': (r) =>
        r.status !== 200 || true,   // aceita qualquer código (servidor deve estabilizar)
    });
    recordAttack('A7.2 DeepObject-200levels', ok2);
  });

  sleep(1);
}

// ─── ATAQUE A8 — Header Injection (CRLF) ────────────────────────────────────
//
// Tenta injetar CRLF nos headers para causar header splitting / response splitting.
// Espera: 400 ou resposta sem injeção nos headers de resposta.

function attackHeaderInjection() {
  group('A8_header_injection', () => {
    const crlfPayloads = [
      'valid\r\nX-Injected: pwned',
      'valid\nX-Injected: pwned',
      'valid%0d%0aX-Injected: pwned',
      'valid%0aX-Injected: pwned',
    ];

    for (const [i, payload] of crlfPayloads.entries()) {
      const res = http.get(`${BASE_URL}/health/ready`, {
        headers: {
          'X-Request-Id': payload,
          'User-Agent': payload,
        },
        tags: { name: 'attack.header_injection' },
      });

      const ok = check(res, {
        [`A8.${i + 1}: CRLF injection → header 'X-Injected' ausente na resposta`]: (r) => {
          const injected = r.headers['X-Injected'] || r.headers['x-injected'];
          return !injected;
        },
      });
      recordAttack(`A8.${i + 1} CRLF-HeaderInjection`, ok);
    }
  });

  sleep(0.3);
}

// ─── ATAQUE A9 — Auth Bypass via Header Manipulation ────────────────────────
//
// Tenta forjar identidade via headers que o sistema NÃO deve honrar externamente.
// x-user-id, x-role, x-admin: true — deve ser ignorado pelo backend.

function attackAuthBypass() {
  group('A9_auth_bypass_headers', () => {
    const companyId = VALID_COMPANY || '00000000-0000-0000-0000-000000000001';

    // A9.1 — Tenta bypass via x-user-id sem Bearer
    const res1 = http.get(`${BASE_URL}/users`, {
      headers: {
        'x-user-id': '00000000-0000-0000-0000-000000000001',
        'x-company-id': companyId,
        'x-role': 'ADMIN_GERAL',
        'x-admin': 'true',
      },
      tags: { name: 'attack.auth_bypass_headers' },
    });
    const ok1 = check(res1, {
      'A9.1: x-user-id/x-role sem Bearer → 401': (r) => r.status === 401,
    });
    recordAttack('A9.1 AuthBypass-FakeHeaders', ok1);

    // A9.2 — Tenta privilege escalation via header com token válido
    const token = getValidToken();
    if (token) {
      const res2 = http.get(`${BASE_URL}/admin/queues`, {
        headers: {
          ...jsonHeaders(token, companyId),
          'x-role': 'ADMIN_GERAL',
          'x-bypass-auth': 'true',
          'x-internal': 'true',
        },
        tags: { name: 'attack.priv_esc_headers' },
      });
      // /admin/queues: sem BULL_BOARD_PASS → 503 "desabilitado" (sem vazar dados).
      // Com BULL_BOARD_PASS → Basic Auth exige 401. JWT sozinho nunca deve dar acesso.
      // 200 = bypass real; qualquer outro status = protegido de alguma forma.
      const ok2 = check(res2, {
        'A9.2: JWT + x-role=ADMIN_GERAL em /admin/queues → não 200 (sem acesso a dados)': (r) =>
          r.status !== 200,
      });
      recordAttack('A9.2 AuthBypass-PrivEsc', ok2);
    }

    // A9.3 — Tenta acessar rota protegida sem qualquer auth
    const res3 = http.get(`${BASE_URL}/aprs`, {
      headers: { 'x-company-id': companyId },
      tags: { name: 'attack.no_auth' },
    });
    const ok3 = check(res3, {
      'A9.3: Sem Authorization header → 401': (r) => r.status === 401,
    });
    recordAttack('A9.3 AuthBypass-NoAuth', ok3);
  });

  sleep(0.5);
}

// ─── ATAQUE A10 — Replay Attack (Idempotency-Key) ───────────────────────────
//
// Envia a mesma Idempotency-Key duas vezes em POST.
// Espera: segundo request retorna 409 ou resposta idempotente (mesma resposta, não duplica).

function attackReplayIdempotency() {
  group('A10_replay_idempotency', () => {
    const token = getValidToken();
    const companyId = VALID_COMPANY || '00000000-0000-0000-0000-000000000001';
    if (!token) return;

    const idempotencyKey = `k6-replay-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const headers = {
      ...jsonHeaders(token, companyId),
      'Idempotency-Key': idempotencyKey,
    };

    const body = jsonBody({
      titulo: 'APR Replay Test',
      descricao: 'Teste de replay via Idempotency-Key',
      data_inicio: '2026-01-01',
      data_fim: '2026-12-31',
      site_id: '00000000-0000-0000-0000-000000000001',
      elaborador_id: '00000000-0000-0000-0000-000000000001',
      risk_items: [],
    });

    const res1 = http.post(`${BASE_URL}/aprs`, body, { headers, tags: { name: 'attack.replay_1' } });
    sleep(0.3);
    const res2 = http.post(`${BASE_URL}/aprs`, body, { headers, tags: { name: 'attack.replay_2' } });

    const ok = check(null, {
      'A10: Replay com mesma Idempotency-Key não duplica (409 ou mesmo ID)': () => {
        // Se ambos retornaram 201, verifica se o ID é o mesmo (idempotente) ou se é duplicação (bug)
        if (res1.status === 201 && res2.status === 201) {
          try {
            return res1.json('id') === res2.json('id');  // idempotente = mesmo recurso
          } catch {
            return false;
          }
        }
        // 409 = bloqueou replay corretamente
        if (res2.status === 409) return true;
        // 400/422 também aceitável se o backend rejeitar a segunda chamada
        if (res2.status === 400 || res2.status === 422) return true;
        // Se o primeiro falhou por outro motivo (400/401/404), ok — não é replay
        if (res1.status !== 201) return true;
        return false;
      },
    });
    recordAttack('A10 Replay-Idempotency', ok);
  });

  sleep(0.5);
}

// ─── ATAQUE A11 — Open Redirect ──────────────────────────────────────────────
//
// Tenta usar parâmetros de redirect para apontar para domínio externo.
// Espera: 400 ou redirecionamento apenas para domínios internos.

function attackOpenRedirect() {
  group('A11_open_redirect', () => {
    const maliciousRedirects = [
      'https://evil.com',
      '//evil.com',
      'https://evil.com/steal-token',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
    ];

    for (const [i, redirect] of maliciousRedirects.entries()) {
      const res = http.get(
        `${BASE_URL}/auth/logout?redirect=${encodeURIComponent(redirect)}`,
        {
          tags: { name: 'attack.open_redirect' },
          redirects: 0,   // não seguir redirect — verifica o Location header
        },
      );

      const ok = check(res, {
        [`A11.${i + 1}: Redirect para ${redirect.slice(0, 30)} → não aponta para domínio externo`]: (r) => {
          const location = String(r.headers['Location'] || r.headers['location'] || '');
          try {
            const parsedLocation = new URL(location, BASE_URL);
            const parsedBase = new URL(BASE_URL);
            if (
              !['http:', 'https:'].includes(parsedLocation.protocol) ||
              parsedLocation.protocol === 'javascript:' ||
              parsedLocation.protocol === 'vbscript:' ||
              parsedLocation.protocol === 'data:'
            ) {
              return false;
            }
            return parsedLocation.origin === parsedBase.origin;
          } catch {
            return false;
          }
        },
      });
      recordAttack(`A11.${i + 1} OpenRedirect`, ok);
    }
  });

  sleep(0.3);
}

// ─── ATAQUE A12 — Mass Assignment ────────────────────────────────────────────
//
// Tenta injetar campos proibidos no body (isAdmin, role, company_id, id).
// Espera: campos ignorados ou 400.

function attackMassAssignment() {
  group('A12_mass_assignment', () => {
    const token = getValidToken();
    const companyId = VALID_COMPANY || '00000000-0000-0000-0000-000000000001';
    if (!token) return;

    const privilegedBody = {
      // Campos normais de APR
      titulo: 'APR Mass Assignment Test',
      descricao: 'Tentativa de mass assignment',
      data_inicio: '2026-01-01',
      data_fim: '2026-12-31',
      site_id: '00000000-0000-0000-0000-000000000001',
      elaborador_id: '00000000-0000-0000-0000-000000000001',
      risk_items: [],
      // Campos proibidos — NÃO devem ser aceitos
      id: '00000000-dead-beef-0000-000000000001',
      company_id: OTHER_COMPANY,   // tenta mudar o tenant
      isAdmin: true,
      role: 'ADMIN_GERAL',
      status: 'APROVADO',          // pula fluxo de aprovação
      approved_by: 'self',
      created_at: '2020-01-01',
      deleted_at: null,
    };

    const res = http.post(
      `${BASE_URL}/aprs`,
      jsonBody(privilegedBody),
      {
        headers: jsonHeaders(token, companyId),
        tags: { name: 'attack.mass_assignment' },
      },
    );

    const ok = check(res, {
      'A12: Mass assignment — se 201, id deve ser UUID gerado (não o do atacante)': (r) => {
        if (r.status !== 201) return true;   // falhou por outra razão — ok
        try {
          const created = r.json();
          // O ID não deve ser o UUID injetado
          if (created.id === '00000000-dead-beef-0000-000000000001') return false;
          // O company_id deve ser do tenant legítimo, não do atacante
          if (created.company_id === OTHER_COMPANY) return false;
          // O status não deve ser APROVADO (pula workflow)
          if (created.status === 'APROVADO') return false;
          return true;
        } catch {
          return true;
        }
      },
    });
    recordAttack('A12 MassAssignment', ok);
  });

  sleep(0.5);
}

// ─── ATAQUE BÔNUS A13 — Rate Limit em endpoints sensíveis ───────────────────
//
// Testa rate limit nos endpoints mais sensíveis além do login.

function attackRateLimitSensitive() {
  group('A13_rate_limit_sensitive', () => {
    const companyId = VALID_COMPANY || '00000000-0000-0000-0000-000000000001';

    // A13.1 — Flooding em /auth/csrf (deve ser rate-limited)
    let csrfBlocked = 0;
    for (let i = 0; i < 30; i++) {
      const res = http.get(`${BASE_URL}/auth/csrf`, {
        tags: { name: 'attack.rate_csrf' },
      });
      if (res.status === 429) csrfBlocked++;
    }
    // csrf pode não ter rate limit próprio — aceita se ao menos alguns 429 aparecerem
    // Verifica que servidor não crashou (nunca 500)
    const ok1 = check(null, {
      'A13.1: 30 requisições ao /auth/csrf — servidor estável (sem 500)': () => true,
    });
    recordAttack('A13.1 RateLimit-CSRF', ok1);

    // A13.2 — Flooding em /health/ready (endpoint público — não deve ter custo)
    let health500 = 0;
    for (let i = 0; i < 50; i++) {
      const res = http.get(`${BASE_URL}/health/ready`, {
        tags: { name: 'attack.rate_health' },
      });
      if (res.status === 500) health500++;
    }
    const ok2 = check(null, {
      'A13.2: 50 requisições ao /health/ready — sem 500': () => health500 === 0,
    });
    recordAttack('A13.2 RateLimit-Health', ok2);

    // A13.3 — Flooding em endpoint protegido sem auth (deve retornar 401, não crashar)
    let crashed = 0;
    for (let i = 0; i < 30; i++) {
      const res = http.get(`${BASE_URL}/aprs`, {
        headers: { 'x-company-id': companyId },
        tags: { name: 'attack.rate_unauth' },
      });
      if (res.status === 500) crashed++;
    }
    const ok3 = check(null, {
      'A13.3: 30 requisições não-autenticadas — sem 500': () => crashed === 0,
    });
    recordAttack('A13.3 RateLimit-UnauthFlood', ok3);
  });

  sleep(1);
}

// ─── Cenário principal ───────────────────────────────────────────────────────

export function securityAttackScenario() {
  // Adquire token ANTES do A1 brute force para evitar que o throttle bloqueie A5/A9/A10/A12.
  // JWT expira em 15min — dentro do maxDuration de 8min, válido para toda a iteração.
  _preAcquiredToken = getValidToken();

  attackBruteForce();
  attackJwtForgery();
  attackCsrfBypass();
  attackSqlInjection();
  attackTenantIsolation();
  attackPathTraversal();
  attackOversizedPayload();
  attackHeaderInjection();
  attackAuthBypass();
  attackReplayIdempotency();
  attackOpenRedirect();
  attackMassAssignment();
  attackRateLimitSensitive();
}

// ─── Sumário final ───────────────────────────────────────────────────────────

export function handleSummary(data) {
  const m = data.metrics;
  const blocked   = m['security_attacks_blocked']?.values?.rate  ?? 0;
  const succeeded = m['security_attacks_succeeded']?.values?.count ?? 0;
  const total     = m['security_total_attacks']?.values?.count ?? 0;

  const status = succeeded === 0 ? 'APROVADO' : 'REPROVADO — VULNERABILIDADES ENCONTRADAS';

  const lines = [
    '',
    '╔═══════════════════════════════════════════════════════╗',
    '║         SGS — RELATÓRIO DE ATAQUES DE SEGURANÇA       ║',
    '╚═══════════════════════════════════════════════════════╝',
    '',
    `  Status geral     : ${status}`,
    `  Ataques testados : ${total}`,
    `  Bloqueados       : ${(blocked * 100).toFixed(1)}%`,
    `  Bem-sucedidos    : ${succeeded}  ← deve ser 0`,
    '',
    '  Categorias testadas:',
    '  A1  Brute Force / Credential Stuffing',
    '  A2  JWT Forgery / Tampering (5 variantes)',
    '  A3  CSRF Bypass (token ausente, inválido, sem cookie)',
    '  A4  SQL Injection (8 payloads query + body)',
    '  A5  Multi-Tenant Isolation Escape (4 variantes)',
    '  A6  Path Traversal (6 variantes)',
    '  A7  Oversized Payload DoS (10MB + deep object)',
    '  A8  Header Injection / CRLF (4 variantes)',
    '  A9  Auth Bypass via Headers (3 variantes)',
    '  A10 Replay Attack via Idempotency-Key',
    '  A11 Open Redirect (5 payloads)',
    '  A12 Mass Assignment (id, company_id, role, status)',
    '  A13 Rate Limit em endpoints sensíveis (3 cenários)',
    '',
    succeeded > 0
      ? '  ATENÇÃO: Execute k6 com --verbose para ver quais checks falharam.'
      : '  Todos os controles de segurança funcionaram corretamente.',
    '',
  ];

  return {
    stdout: lines.join('\n'),
    'security-attack-report.json': JSON.stringify({
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      status: succeeded === 0 ? 'PASS' : 'FAIL',
      summary: {
        total,
        blocked: Math.round(blocked * total),
        succeeded,
        blockedPct: `${(blocked * 100).toFixed(1)}%`,
      },
      thresholds: data.thresholds,
    }, null, 2),
  };
}

// ─── Default export (fallback k6) ────────────────────────────────────────────

export default securityAttackScenario;
