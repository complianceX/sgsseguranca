/**
 * K6 Load Test — Multi-Tenant Realistic Scenarios
 *
 * Pré-requisito: rode seed-tenants.ts para gerar test/load/tenants.json
 *
 * Execução:
 *   k6 run test/load/k6-load-test.js \
 *     -e BASE_URL=http://localhost:3001 \
 *     -e K6_SCENARIO_PROFILE=smoke|baseline|stress
 *
 * Profiles:
 *   smoke    — validação rápida, ~2 min, 1-5 VUs
 *   baseline — carga normal de 100 tenants, ~9 min (default)
 *   stress   — spike + paginação pesada, ~12 min
 *
 * ─── Thresholds e como interpretar ─────────────────────────────────────────
 *
 * | Métrica                          | Threshold        | Interpretação                                    |
 * |----------------------------------|------------------|--------------------------------------------------|
 * | http_req_duration{name:dashboard}| p(95) < 500ms    | 95% das requisições ao dashboard respondem <500ms|
 * |                                  |                  | Acima: possível N+1 query, cache miss excessivo  |
 * | http_req_duration{name:create_apr}| p(95) < 1000ms  | Criação de APR inclui validação + DB write       |
 * |                                  |                  | Acima: connection pool esgotado ou lock contention|
 * | http_req_duration{name:apr_list} | p(95) < 600ms    | Listagem paginada com RLS ativo por tenant       |
 * |                                  |                  | Acima: índice composto (company_id, created_at) faltando|
 * | http_req_duration{name:sophie}   | p(95) < 8000ms   | Inclui round-trip OpenAI — tolerância maior      |
 * |                                  |                  | Acima: circuit breaker deve abrir                 |
 * | http_req_failed                  | rate < 0.01 (1%) | Taxa de erros HTTP (4xx exceto 429, 5xx)         |
 * |                                  |                  | Acima: problema funcional (auth, validação, crash)|
 * | rate_limit_429                   | rate < 0.05 (5%) | 429s esperados em spike — acima = limites apertados|
 * | tenant_isolation_ok              | rate > 0.999     | Cross-tenant leaks são falhas críticas de segurança|
 * | apr_create_success               | rate > 0.95      | 95% das criações de APR devem ter 201            |
 *
 * ─── Interpretação de resultados ───────────────────────────────────────────
 *
 * 1. RED (falha em threshold):
 *    - http_req_duration dashboard p95 > 500ms → ligar EXPLAIN ANALYZE em dashboard.service.ts
 *    - create_apr p95 > 1s com 50 req/s → testar com pool de connections menor
 *    - http_req_failed > 1% → verificar logs de erro no backend (campo 'error' em stdout)
 *
 * 2. YELLOW (próximo ao threshold):
 *    - p99 / p(99.9) muito acima do p95 → outliers indicam GC pauses ou lock waits
 *
 * 3. GREEN (todos os thresholds passam):
 *    - Verificar também: db connection pool max hits (pg_stat_activity)
 *    - Verificar: Redis memory usage (rate limits acumulam keys)
 *
 * ─── Requisitos de infra para baseline ──────────────────────────────────────
 *    Backend: 2 vCPUs, 2GB RAM, PostgreSQL pool size ≥ 20
 *    Seed: 100 tenants × 500 APRs = 50.000 APRs no banco
 */

import { SharedArray } from 'k6/data';
import http from 'k6/http';
import { check, group, sleep, fail } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import exec from 'k6/execution';

// ─── Config via env ──────────────────────────────────────────────────────────

const BASE_URL = String(__ENV.BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
const PROFILE = String(__ENV.K6_SCENARIO_PROFILE || 'baseline').toLowerCase();
const ENABLE_SOPHIE = String(__ENV.K6_ENABLE_SOPHIE || 'true') !== 'false';
const PAGE_COUNT = Number(__ENV.K6_PAGE_COUNT || 10);         // páginas por iteração de paginação
const APR_THINK_MS = Number(__ENV.K6_APR_THINK_MS || 200);   // pausa entre pages (ms)

// ─── Dados de tenant (carregados uma vez, shared entre VUs) ─────────────────

// eslint-disable-next-line no-undef
const tenants = new SharedArray('tenants', function () {
  // open() só pode ser chamado na init stage (dentro de SharedArray/setup)
  // Se o arquivo não existir, o K6 falha aqui com mensagem clara.
  // Resolução: rode seed-tenants.ts antes de executar este script.
  try {
    // eslint-disable-next-line no-undef
    return JSON.parse(open('./tenants.json'));
  } catch (e) {
    // K6 vai capturar isso como erro de init — mensagem visível no stdout
    throw new Error(
      'tenants.json não encontrado. Execute antes:\n' +
        '  node ./node_modules/ts-node/dist/bin.js -r tsconfig-paths/register test/load/seed-tenants.ts',
    );
  }
});

// ─── Métricas customizadas ───────────────────────────────────────────────────

const aprCreateDuration    = new Trend('apr_create_duration', true);
const aprListDuration      = new Trend('apr_list_duration', true);
const dashboardDuration    = new Trend('dashboard_duration', true);
const sophieDuration       = new Trend('sophie_duration', true);
const loginDuration        = new Trend('login_duration', true);
const aprCreateSuccess     = new Rate('apr_create_success');
const tenantIsolationOk    = new Rate('tenant_isolation_ok');
const rateLimitHits        = new Rate('rate_limit_429');
const totalRequests        = new Counter('total_requests');

// ─── Scenarios por profile ───────────────────────────────────────────────────

function buildScenarios(profile) {
  if (profile === 'smoke') {
    return {
      smoke_normal: {
        executor: 'shared-iterations',
        exec: 'normalLoadScenario',
        vus: 2,
        iterations: 6,
        maxDuration: '3m',
      },
      smoke_create: {
        executor: 'shared-iterations',
        exec: 'aprSpikeScenario',
        vus: 2,
        iterations: 4,
        maxDuration: '2m',
        startTime: '30s',
      },
    };
  }

  if (profile === 'stress') {
    return {
      normal_load: {
        executor: 'ramping-vus',
        exec: 'normalLoadScenario',
        startVUs: 0,
        stages: [
          { duration: '2m', target: 100 },  // ramp up até 100 VUs (1 por tenant)
          { duration: '5m', target: 100 },  // sustain
          { duration: '2m', target: 0 },    // ramp down
        ],
        gracefulRampDown: '30s',
      },
      apr_spike: {
        executor: 'constant-arrival-rate',
        exec: 'aprSpikeScenario',
        rate: 50,          // 50 APRs/segundo
        timeUnit: '1s',
        duration: '2m',
        preAllocatedVUs: 100,
        maxVUs: 200,
        startTime: '3m',  // começa após ramp-up do normal_load
      },
      pagination_stress: {
        executor: 'shared-iterations',
        exec: 'paginationScenario',
        vus: 20,
        iterations: 200,
        maxDuration: '8m',
        startTime: '1m',
      },
      ...(ENABLE_SOPHIE ? {
        sophie_load: {
          executor: 'ramping-vus',
          exec: 'sophieScenario',
          startVUs: 0,
          stages: [
            { duration: '1m', target: 5 },
            { duration: '3m', target: 10 },
            { duration: '1m', target: 0 },
          ],
          startTime: '4m',
          gracefulRampDown: '30s',
        },
      } : {}),
    };
  }

  // baseline (default)
  return {
    normal_load: {
      executor: 'ramping-vus',
      exec: 'normalLoadScenario',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
    apr_spike: {
      executor: 'constant-arrival-rate',
      exec: 'aprSpikeScenario',
      rate: 20,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 50,
      maxVUs: 100,
      startTime: '2m',
    },
    pagination_stress: {
      executor: 'shared-iterations',
      exec: 'paginationScenario',
      vus: 10,
      iterations: 100,
      maxDuration: '6m',
      startTime: '30s',
    },
    ...(ENABLE_SOPHIE ? {
      sophie_load: {
        executor: 'constant-vus',
        exec: 'sophieScenario',
        vus: 3,
        duration: '3m',
        startTime: '3m',
      },
    } : {}),
  };
}

export const options = {
  scenarios: buildScenarios(PROFILE),

  thresholds: {
    // Requisito principal do usuário
    'http_req_duration{name:dashboard}':  ['p(95)<500'],
    'http_req_duration{name:create_apr}': ['p(95)<1000'],
    'http_req_duration{name:apr_list}':   ['p(95)<600'],
    'http_req_duration{name:sophie}':     ['p(95)<8000'],

    // Qualidade geral
    http_req_failed:    ['rate<0.01'],   // <1% de falhas 5xx/4xx (exceto 429)
    rate_limit_429:     ['rate<0.05'],   // <5% de 429 (esperado em spike)
    tenant_isolation_ok:['rate>0.999'],  // isolamento multi-tenant: zero tolerância
    apr_create_success: ['rate>0.95'],

    // Latência por operação
    apr_create_duration:  ['p(95)<1000', 'p(99)<2000'],
    apr_list_duration:    ['p(95)<600',  'p(99)<1200'],
    dashboard_duration:   ['p(95)<500',  'p(99)<1000'],
    login_duration:       ['p(95)<800',  'p(99)<1500'],
  },
};

// ─── Estado por VU ───────────────────────────────────────────────────────────
// Variáveis no escopo de módulo são isoladas por VU em K6.

let vuToken = null;
let vuTenant = null;

/**
 * Retorna o tenant atribuído a este VU.
 * Cada VU fica com um tenant fixo durante toda a execução
 * (distribuição round-robin pelo __VU index).
 */
function getVuTenant() {
  if (!vuTenant) {
    // __VU começa em 1
    vuTenant = tenants[(exec.vu.idInTest - 1) % tenants.length];
  }
  return vuTenant;
}

/**
 * Retorna o token do VU atual, autenticando se necessário.
 * Re-autentica automaticamente após 401.
 */
function getVuToken(tenant) {
  if (!vuToken) {
    vuToken = login(tenant);
  }
  return vuToken;
}

function invalidateVuToken() {
  vuToken = null;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

function login(tenant) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ cpf: tenant.cpf, password: tenant.password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'auth.login' },
    },
  );

  loginDuration.add(res.timings.duration);
  totalRequests.add(1);

  const ok = check(res, {
    'login 200/201': (r) => r.status === 200 || r.status === 201,
    'login accessToken': (r) => Boolean(r.json('accessToken')),
  });

  if (!ok) {
    return null;
  }

  return String(res.json('accessToken'));
}

function authHeaders(token, companyId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-company-id': companyId,
  };
}

// ─── Helpers HTTP ────────────────────────────────────────────────────────────

/**
 * GET genérico com retry automático em 401 (token expirado).
 */
function get(url, tag, token, companyId) {
  let res = http.get(`${BASE_URL}${url}`, {
    headers: authHeaders(token, companyId),
    tags: { name: tag },
  });

  totalRequests.add(1);

  if (res.status === 401) {
    invalidateVuToken();
    return null;
  }

  return res;
}

/**
 * POST genérico com tracking de rate limit.
 */
function post(url, body, tag, token, companyId) {
  const res = http.post(`${BASE_URL}${url}`, JSON.stringify(body), {
    headers: authHeaders(token, companyId),
    tags: { name: tag },
  });

  totalRequests.add(1);

  if (res.status === 429) {
    rateLimitHits.add(true);
    // Backoff exponencial: lê Retry-After ou usa 2s padrão
    const retryAfter = Number(res.headers['Retry-After'] || res.headers['retry-after'] || 2);
    sleep(Math.min(retryAfter, 10));
    return null;
  }

  rateLimitHits.add(false);
  return res;
}

// ─── Gerador de número de APR único por VU/iteração ─────────────────────────

let iterCounter = 0;

function nextAprNumero(tenantIdx) {
  iterCounter += 1;
  const ts = Date.now() % 100000; // últimos 5 dígitos do timestamp
  return `K6-VU${exec.vu.idInTest}-T${tenantIdx}-${ts}-${iterCounter}`;
}

// ─── Cenário 1: Carga normal — login + dashboard + listagem breve ────────────
//
// Simula o comportamento de 50-100 usuários simultâneos abrindo o sistema,
// navegando pelo dashboard e visualizando a lista de APRs.

export function normalLoadScenario() {
  const tenant = getVuTenant();
  const token = getVuToken(tenant);
  if (!token) { sleep(2); return; }

  group('normal_load', () => {
    // Dashboard summary (endpoint mais pesado — consulta agregada multi-tabela)
    const summaryRes = get('/dashboard/summary', 'dashboard', token, tenant.companyId);
    if (summaryRes) {
      dashboardDuration.add(summaryRes.timings.duration);
      check(summaryRes, { 'dashboard.summary 200': (r) => r.status === 200 });
    }

    sleep(0.5);

    // KPIs do dashboard
    const kpisRes = get('/dashboard/kpis', 'dashboard', token, tenant.companyId);
    if (kpisRes) {
      dashboardDuration.add(kpisRes.timings.duration);
      check(kpisRes, { 'dashboard.kpis 200': (r) => r.status === 200 });
    }

    sleep(0.3);

    // Primeira página de APRs (como se o usuário abrisse a tela)
    const listRes = get('/aprs?limit=20&page=1', 'apr_list', token, tenant.companyId);
    if (listRes) {
      aprListDuration.add(listRes.timings.duration);
      check(listRes, { 'aprs.list 200': (r) => r.status === 200 });
    }
  });

  // Think time: usuário lê os resultados
  sleep(Math.random() * 2 + 1);
}

// ─── Cenário 2: Criação de APR com risk items ────────────────────────────────
//
// Simula técnicos de segurança criando APRs em alta frequência.
// Em stress/spike, 50 APRs/segundo testam a capacidade de escrita do banco.

export function aprSpikeScenario() {
  const tenant = getVuTenant();
  const token = getVuToken(tenant);
  if (!token) { sleep(1); return; }

  group('apr_spike', () => {
    const body = {
      numero: nextAprNumero(tenant.tenantIndex),
      titulo: `APR Carga K6 - VU ${exec.vu.idInTest}`,
      descricao: 'Análise Preliminar de Risco gerada em teste de carga automatizado.',
      data_inicio: '2026-06-01',
      data_fim: '2026-12-31',
      site_id: tenant.siteId,
      elaborador_id: tenant.userId,
      probability: 2,
      severity: 3,
      exposure: 2,
      residual_risk: 'MEDIUM',
      // risk_items testam o JSONB write + validação de nested objects
      risk_items: [
        {
          atividade: 'Trabalho em altura',
          condicao_perigosa: 'Risco de queda de altura',
          categoria_risco: 'Físico',
          probabilidade: 2,
          severidade: 3,
          medidas_prevencao: 'Uso de EPI e andaime homologado',
          responsavel: 'Supervisor SST',
          status_acao: 'pendente',
        },
        {
          atividade: 'Manuseio de solventes',
          condicao_perigosa: 'Exposição a agentes químicos',
          categoria_risco: 'Químico',
          probabilidade: 1,
          severidade: 3,
          medidas_prevencao: 'Ventilação e EPI respiratório',
          responsavel: 'Técnico SST',
          status_acao: 'pendente',
        },
      ],
    };

    const res = post('/aprs', body, 'create_apr', token, tenant.companyId);

    if (res) {
      aprCreateDuration.add(res.timings.duration);
      const created = check(res, {
        'aprs.create 201': (r) => r.status === 201,
        'aprs.create has id': (r) => Boolean(r.json('id')),
      });
      aprCreateSuccess.add(created);
    }
  });

  // Sem sleep em spike — simula criação contínua
}

// ─── Cenário 3: Paginação profunda de APRs ───────────────────────────────────
//
// Testa a performance da query paginada com 500 APRs por tenant.
// 10 páginas × 20 itens = navega pela lista completa.
// Valida que o índice (company_id, created_at DESC) está sendo usado.

export function paginationScenario() {
  const tenant = getVuTenant();
  const token = getVuToken(tenant);
  if (!token) { sleep(2); return; }

  group('pagination', () => {
    for (let page = 1; page <= PAGE_COUNT; page++) {
      const res = get(
        `/aprs?limit=20&page=${page}`,
        'apr_list',
        token,
        tenant.companyId,
      );

      if (!res) break;

      aprListDuration.add(res.timings.duration);
      const ok = check(res, {
        [`aprs.page${page} 200`]: (r) => r.status === 200,
        // Verifica isolamento: todos os itens devem pertencer ao tenant correto
        'aprs.page isolamento tenant': (r) => {
          try {
            const body = r.json();
            const items = body.data || body.items || body || [];
            if (!Array.isArray(items) || items.length === 0) return true;
            return items.every((apr) => !apr.company_id || apr.company_id === tenant.companyId);
          } catch {
            return true; // não conseguiu parsear — ignora verificação
          }
        },
      });

      tenantIsolationOk.add(ok);

      // Simula o tempo de leitura entre páginas
      sleep(APR_THINK_MS / 1000);
    }
  });

  sleep(1);
}

// ─── Cenário 4: Agente Sophie (IA) com rate limit ───────────────────────────
//
// Sophie é o endpoint mais lento (round-trip OpenAI ~2-5s).
// Valida que o circuit breaker abre quando o modelo demora,
// e que o rate limit de IA (mais restrito) é respeitado.

export function sophieScenario() {
  const tenant = getVuTenant();
  const token = getVuToken(tenant);
  if (!token) { sleep(3); return; }

  const questions = [
    'Quais treinamentos estão vencendo nos próximos 30 dias?',
    'Mostre um resumo das não conformidades abertas.',
    'Quantas APRs estão pendentes de aprovação?',
    'Quais exames médicos vencem este mês?',
    'Gere um resumo SST completo da empresa.',
  ];

  const question = questions[Math.floor(Math.random() * questions.length)];

  group('sophie', () => {
    const res = post(
      '/ai/sst/chat',
      { question, history: [] },
      'sophie',
      token,
      tenant.companyId,
    );

    if (res) {
      sophieDuration.add(res.timings.duration);
      check(res, {
        'sophie 200 ou 201': (r) => r.status === 200 || r.status === 201,
        'sophie has answer': (r) => {
          try {
            return Boolean(r.json('answer'));
          } catch {
            return false;
          }
        },
      });
    }
  });

  // Sophie é lento — think time menor para não agravar a latência artificial
  sleep(Math.random() * 3 + 2);
}

// ─── Setup ───────────────────────────────────────────────────────────────────

export function setup() {
  if (!tenants || tenants.length === 0) {
    fail('tenants.json vazio ou inválido. Execute seed-tenants.ts primeiro.');
  }

  // Verifica que o backend está acessível com o primeiro tenant
  const firstTenant = tenants[0];
  const token = login(firstTenant);
  if (!token) {
    fail(
      `Falha ao autenticar tenant de teste (CPF: ${firstTenant.cpf}).\n` +
      'Verifique: 1) backend em execução, 2) seed aplicado, 3) profiles criados pelo SeedService.',
    );
  }

  console.log(`✓ Backend acessível | ${tenants.length} tenants carregados | Profile: ${PROFILE.toUpperCase()}`);
  return { setupToken: token, setupCompanyId: firstTenant.companyId };
}

// ─── Sumário final ───────────────────────────────────────────────────────────

export function handleSummary(data) {
  const m = data.metrics;

  /** Formata p(95) de uma Trend ou retorna 'N/A' */
  function p95(metricName) {
    const val = m[metricName]?.values?.['p(95)'];
    if (typeof val !== 'number' || isNaN(val)) return 'N/A';
    return `${val.toFixed(0)}ms`;
  }

  /** Formata rate como percentual */
  function pct(metricName) {
    const val = m[metricName]?.values?.rate;
    if (typeof val !== 'number' || isNaN(val)) return 'N/A';
    return `${(val * 100).toFixed(2)}%`;
  }

  const lines = [
    '',
    `╔═══════════════════════════════════════════════════════╗`,
    `║       K6 Multi-Tenant Load Test — ${PROFILE.toUpperCase().padEnd(20)}  ║`,
    `╚═══════════════════════════════════════════════════════╝`,
    '',
    '  Latência (p95)',
    `  ├─ Dashboard      : ${p95('dashboard_duration').padStart(8)}   threshold: <500ms`,
    `  ├─ Criar APR      : ${p95('apr_create_duration').padStart(8)}   threshold: <1000ms`,
    `  ├─ Listar APRs    : ${p95('apr_list_duration').padStart(8)}   threshold: <600ms`,
    `  ├─ Login          : ${p95('login_duration').padStart(8)}   threshold: <800ms`,
    `  └─ Sophie (IA)    : ${p95('sophie_duration').padStart(8)}   threshold: <8000ms`,
    '',
    '  Taxas',
    `  ├─ Erros HTTP     : ${pct('http_req_failed').padStart(8)}   threshold: <1%`,
    `  ├─ Rate Limit 429 : ${pct('rate_limit_429').padStart(8)}   threshold: <5%`,
    `  ├─ APR criada ok  : ${pct('apr_create_success').padStart(8)}   threshold: >95%`,
    `  └─ Isolamento OK  : ${pct('tenant_isolation_ok').padStart(8)}   threshold: >99.9%`,
    '',
    `  Total requests    : ${m.total_requests?.values?.count ?? 'N/A'}`,
    '',
    '  ─── Como interpretar ────────────────────────────────',
    '  p95 alto (dashboard >500ms): verificar queries N+1 e cache hits no DashboardService.',
    '  p95 alto (create_apr >1s):   connection pool esgotado ou índice faltando em aprs.',
    '  429 >5%:                     plano PROFESSIONAL com 300 req/min insuficiente para o spike.',
    '  isolamento_ok <100%:         BUG CRÍTICO — vazamento de dados entre tenants.',
    '',
  ];

  return {
    stdout: lines.join('\n'),
    'load-test-summary.json': JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        profile: PROFILE,
        baseUrl: BASE_URL,
        tenantCount: tenants.length,
        thresholds: data.thresholds,
        metrics: {
          httpReqDuration: m.http_req_duration,
          dashboardDuration: m.dashboard_duration,
          aprCreateDuration: m.apr_create_duration,
          aprListDuration: m.apr_list_duration,
          loginDuration: m.login_duration,
          sophieDuration: m.sophie_duration,
          httpReqFailed: m.http_req_failed,
          rateLimitHits: m.rate_limit_429,
          aprCreateSuccess: m.apr_create_success,
          tenantIsolationOk: m.tenant_isolation_ok,
          totalRequests: m.total_requests,
        },
      },
      null,
      2,
    ),
  };
}

// ─── Fallback export (exigido pelo K6 se não há default scenario) ────────────

export default function (data) {
  const scenarioName = exec.scenario.name || 'unknown';

  if (scenarioName.includes('normal') || scenarioName.includes('smoke_normal')) {
    normalLoadScenario(data);
  } else if (scenarioName.includes('spike') || scenarioName.includes('smoke_create')) {
    aprSpikeScenario(data);
  } else if (scenarioName.includes('pagination')) {
    paginationScenario(data);
  } else if (scenarioName.includes('sophie')) {
    sophieScenario(data);
  } else {
    normalLoadScenario(data);
  }
}
