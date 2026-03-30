import exec from 'k6/execution';
import http from 'k6/http';
import { check, fail, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = String(__ENV.BASE_URL || 'http://localhost:3001').replace(
  /\/+$/,
  '',
);
const LOGIN_CPF = String(__ENV.K6_LOGIN_CPF || '').replace(/\D/g, '');
const LOGIN_PASSWORD = String(__ENV.K6_LOGIN_PASSWORD || '');
const COMPANY_ID = String(__ENV.K6_COMPANY_ID || '').trim();
const PDF_POLL_ATTEMPTS = Number(__ENV.K6_PDF_POLL_ATTEMPTS || 12);
const PDF_POLL_INTERVAL_MS = Number(__ENV.K6_PDF_POLL_INTERVAL_MS || 3000);
const IMPORT_POLL_ATTEMPTS = Number(__ENV.K6_IMPORT_POLL_ATTEMPTS || 20);
const IMPORT_POLL_INTERVAL_MS = Number(__ENV.K6_IMPORT_POLL_INTERVAL_MS || 2000);
const DASHBOARD_SLEEP_MS = Number(__ENV.K6_DASHBOARD_SLEEP_MS || 750);
const PROFILE = String(__ENV.K6_SCENARIO_PROFILE || 'baseline').toLowerCase();
const ENABLE_UPLOAD_SCENARIO = String(
  __ENV.K6_ENABLE_UPLOAD_SCENARIO || 'true',
).toLowerCase() !== 'false';
const ENABLE_PDF_SCENARIO = String(
  __ENV.K6_ENABLE_PDF_SCENARIO || 'true',
).toLowerCase() !== 'false';

// Explicit path so this script works when executed from the backend root.
const uploadFixture = open('./test/load/fixtures/sample-upload.txt', 'b');

const authLoginDuration = new Trend('auth_login_duration');
const dashboardSummaryDuration = new Trend('dashboard_summary_duration');
const dashboardKpisDuration = new Trend('dashboard_kpis_duration');
const dashboardPendingQueueDuration = new Trend(
  'dashboard_pending_queue_duration',
);
const dashboardThroughput = new Counter('dashboard_successful_requests');
const uploadDocumentDuration = new Trend('upload_document_duration');
const uploadDocumentSuccess = new Rate('upload_document_success');
const documentImportStatusPollDuration = new Trend(
  'document_import_status_poll_duration',
);
const documentImportCompletionDuration = new Trend(
  'document_import_completion_duration',
);
const documentImportJobSuccess = new Rate('document_import_job_success');
const pdfEnqueueDuration = new Trend('pdf_enqueue_duration');
const pdfStatusPollDuration = new Trend('pdf_status_poll_duration');
const pdfJobCompletionDuration = new Trend('pdf_job_completion_duration');
const pdfJobSuccess = new Rate('pdf_job_success');
const authSuccess = new Rate('auth_login_success');
const flowErrors = new Rate('flow_errors');

function buildScenarioOptions(profile) {
  if (profile === 'smoke') {
    return {
      auth_login: {
        executor: 'shared-iterations',
        exec: 'authScenario',
        vus: 1,
        iterations: 3,
        maxDuration: '2m',
      },
      dashboard_read: {
        executor: 'shared-iterations',
        exec: 'dashboardScenario',
        vus: 2,
        iterations: 8,
        maxDuration: '3m',
      },
      ...(ENABLE_UPLOAD_SCENARIO
        ? {
            document_import: {
              executor: 'shared-iterations',
              exec: 'documentImportScenario',
              vus: 1,
              iterations: 2,
              maxDuration: '3m',
            },
          }
        : {}),
      ...(ENABLE_PDF_SCENARIO
        ? {
            reports_pdf_queue: {
              executor: 'shared-iterations',
              exec: 'pdfQueueScenario',
              vus: 1,
              iterations: 2,
              maxDuration: '8m',
            },
          }
        : {}),
    };
  }

  if (profile === 'stress') {
    return {
      auth_login: {
        executor: 'ramping-arrival-rate',
        exec: 'authScenario',
        startRate: 1,
        timeUnit: '1s',
        preAllocatedVUs: 8,
        maxVUs: 60,
        stages: [
          { duration: '2m', target: 4 },
          { duration: '5m', target: 8 },
          { duration: '2m', target: 0 },
        ],
      },
      dashboard_read: {
        executor: 'ramping-vus',
        exec: 'dashboardScenario',
        startVUs: 2,
        stages: [
          { duration: '2m', target: 15 },
          { duration: '5m', target: 30 },
          { duration: '2m', target: 0 },
        ],
        gracefulRampDown: '30s',
      },
      ...(ENABLE_UPLOAD_SCENARIO
        ? {
            document_import: {
              executor: 'shared-iterations',
              exec: 'documentImportScenario',
              vus: 4,
              iterations: 16,
              maxDuration: '8m',
            },
          }
        : {}),
      ...(ENABLE_PDF_SCENARIO
        ? {
            reports_pdf_queue: {
              executor: 'shared-iterations',
              exec: 'pdfQueueScenario',
              vus: 2,
              iterations: 10,
              maxDuration: '15m',
            },
          }
        : {}),
    };
  }

  return {
    auth_login: {
      executor: 'ramping-arrival-rate',
      exec: 'authScenario',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 4,
      maxVUs: 30,
      stages: [
        { duration: '1m', target: 2 },
        { duration: '4m', target: 5 },
        { duration: '1m', target: 0 },
      ],
    },
    dashboard_read: {
      executor: 'ramping-vus',
      exec: 'dashboardScenario',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 8 },
        { duration: '4m', target: 12 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
    ...(ENABLE_UPLOAD_SCENARIO
      ? {
          document_import: {
            executor: 'shared-iterations',
            exec: 'documentImportScenario',
            vus: 2,
            iterations: 6,
            maxDuration: '5m',
          },
        }
      : {}),
    ...(ENABLE_PDF_SCENARIO
      ? {
          reports_pdf_queue: {
            executor: 'shared-iterations',
            exec: 'pdfQueueScenario',
            vus: 1,
            iterations: 4,
            maxDuration: '10m',
          },
        }
      : {}),
  };
}

export const options = {
  scenarios: buildScenarioOptions(PROFILE),
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    flow_errors: ['rate<0.1'],
    auth_login_success: ['rate>0.95'],
    auth_login_duration: ['p(95)<1500', 'p(99)<3000'],
    dashboard_summary_duration: ['p(95)<1200'],
    dashboard_kpis_duration: ['p(95)<1800'],
    dashboard_pending_queue_duration: ['p(95)<2200'],
    upload_document_success: ['rate>0.8'],
    upload_document_duration: ['p(95)<6000'],
    document_import_job_success: ['rate>0.8'],
    document_import_completion_duration: ['p(95)<30000'],
    pdf_enqueue_duration: ['p(95)<2500'],
    pdf_status_poll_duration: ['p(95)<1500'],
  },
};

function ensureRequiredEnv() {
  if (!LOGIN_CPF || !LOGIN_PASSWORD) {
    fail(
      'Defina K6_LOGIN_CPF e K6_LOGIN_PASSWORD com credenciais reais antes de executar o teste.',
    );
  }
}

function createJsonHeaders(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  if (COMPANY_ID) {
    headers['x-company-id'] = COMPANY_ID;
  }

  return headers;
}

function createTenantHeaders(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
  };

  if (COMPANY_ID) {
    headers['x-company-id'] = COMPANY_ID;
  }

  return headers;
}

function authenticate() {
  const response = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      cpf: LOGIN_CPF,
      password: LOGIN_PASSWORD,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'auth.login' },
    },
  );

  authLoginDuration.add(response.timings.duration);

  const success = check(response, {
    'auth.login status 200': (res) => res.status === 200,
    'auth.login accessToken presente': (res) =>
      Boolean(res.json('accessToken')),
  });

  authSuccess.add(success);
  flowErrors.add(!success);

  if (!success) {
    return null;
  }

  return {
    accessToken: response.json('accessToken'),
    userId: response.json('user.id') || null,
    companyId: response.json('user.company_id') || COMPANY_ID || null,
  };
}

function performGet(url, metric, token, description) {
  const response = http.get(`${BASE_URL}${url}`, {
    headers: createTenantHeaders(token),
    tags: { name: description },
  });

  metric.add(response.timings.duration);
  const success = check(response, {
    [`${description} status 200`]: (res) => res.status === 200,
  });

  flowErrors.add(!success);
  if (success) {
    dashboardThroughput.add(1);
  }

  return response;
}

function currentReportWindow() {
  const now = new Date();
  return {
    mes: now.getMonth() + 1,
    ano: now.getFullYear(),
  };
}

export function setup() {
  ensureRequiredEnv();
  const session = authenticate();
  if (!session?.accessToken) {
    fail('Falha ao autenticar no setup. Verifique CPF/senha e permissões.');
  }
  return session;
}

export function authScenario() {
  group('auth.login', () => {
    const session = authenticate();
    if (!session?.accessToken) {
      return;
    }
  });

  sleep(1);
}

export function dashboardScenario(session) {
  group('dashboard.read', () => {
    performGet(
      '/dashboard/summary',
      dashboardSummaryDuration,
      session.accessToken,
      'dashboard.summary',
    );
    sleep(DASHBOARD_SLEEP_MS / 1000);

    performGet(
      '/dashboard/kpis',
      dashboardKpisDuration,
      session.accessToken,
      'dashboard.kpis',
    );
    sleep(DASHBOARD_SLEEP_MS / 1000);

    performGet(
      '/dashboard/pending-queue',
      dashboardPendingQueueDuration,
      session.accessToken,
      'dashboard.pending_queue',
    );
    sleep(DASHBOARD_SLEEP_MS / 1000);

    performGet(
      '/reports/queue/stats',
      dashboardPendingQueueDuration,
      session.accessToken,
      'reports.queue_stats',
    );
  });

  sleep(1);
}

export function documentImportScenario(session) {
  group('documents.import', () => {
    const file = http.file(uploadFixture, 'sample-upload.txt', 'text/plain');
    const payload = {
      file,
      tipoDocumento: 'performance-load-test',
    };

    const response = http.post(`${BASE_URL}/documents/import`, payload, {
      headers: createTenantHeaders(session.accessToken),
      tags: { name: 'documents.import' },
    });

    uploadDocumentDuration.add(response.timings.duration);
    const success = check(response, {
      'documents.import status 202': (res) => res.status === 202,
      'documents.import documentId presente': (res) =>
        Boolean(res.json('documentId')),
    });

    uploadDocumentSuccess.add(success);
    flowErrors.add(!success);

    if (!success) {
      documentImportJobSuccess.add(false);
      return;
    }

    const documentId = String(response.json('documentId'));
    const statusUrl = String(
      response.json('statusUrl') || `/documents/import/${documentId}/status`,
    );
    const startedAt = Date.now();
    let completed = false;

    for (let attempt = 0; attempt < IMPORT_POLL_ATTEMPTS; attempt += 1) {
      sleep(IMPORT_POLL_INTERVAL_MS / 1000);

      const statusResponse = http.get(`${BASE_URL}${statusUrl}`, {
        headers: createTenantHeaders(session.accessToken),
        tags: { name: 'documents.import_status' },
      });

      documentImportStatusPollDuration.add(statusResponse.timings.duration);
      const statusOk = check(statusResponse, {
        'documents.import_status status 200': (res) => res.status === 200,
      });
      flowErrors.add(!statusOk);

      if (!statusOk) {
        continue;
      }

      const done = Boolean(statusResponse.json('completed'));
      const failed = Boolean(statusResponse.json('failed'));
      if (done || failed) {
        completed = done && !failed;
        documentImportCompletionDuration.add(Date.now() - startedAt);
        break;
      }
    }

    documentImportJobSuccess.add(completed);
  });

  sleep(1);
}

export function pdfQueueScenario(session) {
  group('reports.generate', () => {
    const window = currentReportWindow();
    const enqueueResponse = http.post(
      `${BASE_URL}/reports/generate`,
      JSON.stringify(window),
      {
        headers: createJsonHeaders(session.accessToken),
        tags: { name: 'reports.generate' },
      },
    );

    pdfEnqueueDuration.add(enqueueResponse.timings.duration);
    const enqueued = check(enqueueResponse, {
      'reports.generate status 201/200': (res) =>
        res.status === 201 || res.status === 200,
      'reports.generate jobId presente': (res) => Boolean(res.json('jobId')),
    });

    flowErrors.add(!enqueued);
    if (!enqueued) {
      pdfJobSuccess.add(false);
      return;
    }

    const jobId = String(enqueueResponse.json('jobId'));
    const startedAt = Date.now();
    let completed = false;

    for (let attempt = 0; attempt < PDF_POLL_ATTEMPTS; attempt += 1) {
      sleep(PDF_POLL_INTERVAL_MS / 1000);

      const statusResponse = http.get(
        `${BASE_URL}/reports/status/${jobId}`,
        {
          headers: createTenantHeaders(session.accessToken),
          tags: { name: 'reports.status' },
        },
      );

      pdfStatusPollDuration.add(statusResponse.timings.duration);
      const statusOk = check(statusResponse, {
        'reports.status status 200': (res) => res.status === 200,
      });
      flowErrors.add(!statusOk);

      if (!statusOk) {
        continue;
      }

      const state = String(statusResponse.json('state') || '');
      if (state === 'completed') {
        completed = true;
        pdfJobCompletionDuration.add(Date.now() - startedAt);
        break;
      }

      if (state === 'failed') {
        break;
      }
    }

    pdfJobSuccess.add(completed);

    const queueStatsResponse = http.get(`${BASE_URL}/reports/queue/stats`, {
      headers: createTenantHeaders(session.accessToken),
      tags: { name: 'reports.queue_stats' },
    });

    check(queueStatsResponse, {
      'reports.queue_stats status 200': (res) => res.status === 200,
    });
  });

  sleep(1);
}

export function handleSummary(data) {
  const profileLabel = PROFILE.toUpperCase();
  const summary = {
    generatedAt: new Date().toISOString(),
    profile: profileLabel,
    baseUrl: BASE_URL,
    scenarios: Object.keys(options.scenarios),
    metrics: {
      httpReqDuration: data.metrics.http_req_duration,
      httpReqFailed: data.metrics.http_req_failed,
      authLoginDuration: data.metrics.auth_login_duration,
      dashboardSummaryDuration: data.metrics.dashboard_summary_duration,
      dashboardKpisDuration: data.metrics.dashboard_kpis_duration,
      dashboardPendingQueueDuration:
        data.metrics.dashboard_pending_queue_duration,
      uploadDocumentDuration: data.metrics.upload_document_duration,
      pdfEnqueueDuration: data.metrics.pdf_enqueue_duration,
      pdfStatusPollDuration: data.metrics.pdf_status_poll_duration,
      pdfJobCompletionDuration: data.metrics.pdf_job_completion_duration,
      pdfJobSuccess: data.metrics.pdf_job_success,
      uploadDocumentSuccess: data.metrics.upload_document_success,
      flowErrors: data.metrics.flow_errors,
      dashboardSuccessfulRequests: data.metrics.dashboard_successful_requests,
    },
  };

  return {
    stdout: [
      '',
      `=== SGS Load Test (${profileLabel}) ===`,
      `Cenarios: ${summary.scenarios.join(', ')}`,
      `HTTP p95: ${formatTrendValue(
        data.metrics.http_req_duration?.values?.['p(95)'],
      )}`,
      `Auth p95: ${formatTrendValue(
        data.metrics.auth_login_duration?.values?.['p(95)'],
      )}`,
      `Dashboard summary p95: ${formatTrendValue(
        data.metrics.dashboard_summary_duration?.values?.['p(95)'],
      )}`,
      `Dashboard KPIs p95: ${formatTrendValue(
        data.metrics.dashboard_kpis_duration?.values?.['p(95)'],
      )}`,
      `Dashboard fila p95: ${formatTrendValue(
        data.metrics.dashboard_pending_queue_duration?.values?.['p(95)'],
      )}`,
      `Upload p95: ${formatTrendValue(
        data.metrics.upload_document_duration?.values?.['p(95)'],
      )}`,
      `PDF enqueue p95: ${formatTrendValue(
        data.metrics.pdf_enqueue_duration?.values?.['p(95)'],
      )}`,
      `PDF poll p95: ${formatTrendValue(
        data.metrics.pdf_status_poll_duration?.values?.['p(95)'],
      )}`,
      `PDF job avg: ${formatTrendValue(
        data.metrics.pdf_job_completion_duration?.values?.avg,
      )}`,
      `Erro de fluxo: ${formatRateValue(data.metrics.flow_errors?.values?.rate)}`,
      `Falha HTTP: ${formatRateValue(
        data.metrics.http_req_failed?.values?.rate,
      )}`,
      '',
    ].join('\n'),
    'summary.json': JSON.stringify(summary, null, 2),
  };
}

function formatTrendValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${value.toFixed(2)}ms`;
}

function formatRateValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${(value * 100).toFixed(2)}%`;
}

export default function fallbackScenario(data) {
  const scenarioName = exec.scenario.name || 'default';

  if (scenarioName === 'auth_login') {
    authScenario(data);
    return;
  }

  if (scenarioName === 'dashboard_read') {
    dashboardScenario(data);
    return;
  }

  if (scenarioName === 'document_import') {
    documentImportScenario(data);
    return;
  }

  if (scenarioName === 'reports_pdf_queue') {
    pdfQueueScenario(data);
    return;
  }

  fail(`Cenário não mapeado: ${scenarioName}`);
}
