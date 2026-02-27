import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Métricas customizadas
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');
const pdfGenerationDuration = new Trend('pdf_generation_duration');
const concurrentUsers = new Gauge('concurrent_users');
const successfulRequests = new Counter('successful_requests');

// Configuração de teste
export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp-up: 0 → 100 usuários
    { duration: '5m', target: 100 }, // Sustain: 100 usuários
    { duration: '2m', target: 500 }, // Spike: 100 → 500 usuários
    { duration: '5m', target: 500 }, // Sustain: 500 usuários
    { duration: '2m', target: 1000 }, // Stress: 500 → 1000 usuários
    { duration: '5m', target: 1000 }, // Sustain: 1000 usuários
    { duration: '2m', target: 0 }, // Ramp-down: 1000 → 0 usuários
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'], // 95% das requisições < 500ms
    'errors': ['rate<0.1'], // Taxa de erro < 10%
    'api_duration': ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API_TOKEN = __ENV.API_TOKEN || 'test-token';

// Dados de teste
const companies = Array.from({ length: 50 }, (_, i) => ({
  id: `company-${i + 1}`,
  name: `Company ${i + 1}`,
}));

const users = Array.from({ length: 100 }, (_, i) => ({
  id: `user-${i + 1}`,
  email: `user${i + 1}@test.com`,
  password: 'Test@1234',
}));

export default function () {
  const company = companies[Math.floor(Math.random() * companies.length)];
  const user = users[Math.floor(Math.random() * users.length)];

  concurrentUsers.add(__VU);

  group('Authentication', () => {
    const loginRes = http.post(`${BASE_URL}/auth/login`, {
      email: user.email,
      password: user.password,
    });

    check(loginRes, {
      'login status is 200': (r) => r.status === 200,
      'login response has token': (r) => r.json('access_token') !== undefined,
    }) || errorRate.add(1);

    if (loginRes.status === 200) {
      successfulRequests.add(1);
    }

    sleep(1);
  });

  group('API Requests', () => {
    const headers = {
      Authorization: `Bearer ${API_TOKEN}`,
      'x-company-id': company.id,
    };

    // GET /api/companies/:id
    const companyRes = http.get(`${BASE_URL}/api/companies/${company.id}`, {
      headers,
    });

    apiDuration.add(companyRes.timings.duration);
    check(companyRes, {
      'get company status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);

    if (companyRes.status === 200) {
      successfulRequests.add(1);
    }

    sleep(0.5);

    // GET /api/users
    const usersRes = http.get(`${BASE_URL}/api/users`, { headers });

    apiDuration.add(usersRes.timings.duration);
    check(usersRes, {
      'list users status is 200': (r) => r.status === 200,
      'list users has data': (r) => r.json('data.length') > 0,
    }) || errorRate.add(1);

    if (usersRes.status === 200) {
      successfulRequests.add(1);
    }

    sleep(0.5);
  });

  group('Heavy Operations', () => {
    const headers = {
      Authorization: `Bearer ${API_TOKEN}`,
      'x-company-id': company.id,
    };

    // POST /api/compliance/generate-report (PDF generation)
    const reportRes = http.post(
      `${BASE_URL}/api/compliance/generate-report`,
      JSON.stringify({
        format: 'pdf',
        includeCharts: true,
      }),
      { headers },
    );

    pdfGenerationDuration.add(reportRes.timings.duration);
    check(reportRes, {
      'generate report status is 200': (r) => r.status === 200,
      'report has content': (r) => r.body.length > 1000,
    }) || errorRate.add(1);

    if (reportRes.status === 200) {
      successfulRequests.add(1);
    }

    sleep(2);
  });

  group('Database Stress', () => {
    const headers = {
      Authorization: `Bearer ${API_TOKEN}`,
      'x-company-id': company.id,
    };

    // GET /api/compliance/security-score (SQL aggregation test)
    const scoreRes = http.get(`${BASE_URL}/api/compliance/security-score`, {
      headers,
    });

    apiDuration.add(scoreRes.timings.duration);
    check(scoreRes, {
      'security score status is 200': (r) => r.status === 200,
      'security score has value': (r) => r.json('score') !== undefined,
    }) || errorRate.add(1);

    if (scoreRes.status === 200) {
      successfulRequests.add(1);
    }

    sleep(1);
  });

  group('Rate Limiting Test', () => {
    const headers = {
      Authorization: `Bearer ${API_TOKEN}`,
      'x-company-id': company.id,
    };

    // Fazer múltiplas requisições rápidas para testar rate limiting
    for (let i = 0; i < 20; i++) {
      const res = http.get(`${BASE_URL}/api/health`, { headers });
      check(res, {
        'rate limit not exceeded': (r) => r.status !== 429,
      }) || errorRate.add(1);
    }

    sleep(1);
  });

  sleep(Math.random() * 3);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const { indent = '', enableColors = false } = options;
  let summary = '\n=== Load Test Summary ===\n';

  summary += `${indent}Total Requests: ${data.metrics.http_reqs?.value || 0}\n`;
  summary += `${indent}Successful Requests: ${data.metrics.successful_requests?.value || 0}\n`;
  summary += `${indent}Error Rate: ${((data.metrics.errors?.value || 0) * 100).toFixed(2)}%\n`;
  summary += `${indent}API Duration (p95): ${data.metrics.api_duration?.values?.['p(95)'] || 'N/A'}ms\n`;
  summary += `${indent}PDF Generation (p95): ${data.metrics.pdf_generation_duration?.values?.['p(95)'] || 'N/A'}ms\n`;

  return summary;
}
