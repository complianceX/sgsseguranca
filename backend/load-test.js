// ============================================================================
// TESTE DE CARGA - K6
// ============================================================================
// Instalar: npm install -g k6
// Executar: k6 run load-test.js
// ============================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Métricas customizadas
const errorRate = new Rate('errors');

// Configuração do teste
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp-up para 50 usuários
    { duration: '5m', target: 100 },  // Ramp-up para 100 usuários
    { duration: '5m', target: 100 },  // Manter 100 usuários
    { duration: '2m', target: 200 },  // Spike para 200 usuários
    { duration: '5m', target: 200 },  // Manter 200 usuários
    { duration: '2m', target: 0 },    // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% das requests < 2s
    http_req_failed: ['rate<0.01'],    // < 1% de erro
    errors: ['rate<0.01'],             // < 1% de erro customizado
  },
};

const BASE_URL = 'http://localhost:3001';

// Dados de teste
const testUsers = [
  { email: 'user1@test.com', password: 'Test123!' },
  { email: 'user2@test.com', password: 'Test123!' },
  { email: 'user3@test.com', password: 'Test123!' },
];

// ============================================================================
// CENÁRIO PRINCIPAL
// ============================================================================

export default function () {
  // Selecionar usuário aleatório
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];
  
  // 1. LOGIN
  let loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: user.email,
    password: user.password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  let success = check(loginRes, {
    'login status 200': (r) => r.status === 200,
    'login has token': (r) => r.json('access_token') !== undefined,
  });
  
  errorRate.add(!success);
  
  if (!success) {
    console.error('Login failed');
    sleep(1);
    return;
  }
  
  const token = loginRes.json('access_token');
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  sleep(1);
  
  // 2. HEALTH CHECK
  let healthRes = http.get(`${BASE_URL}/health`, { headers });
  check(healthRes, {
    'health status 200': (r) => r.status === 200,
    'health is ok': (r) => r.json('status') === 'ok',
  });
  
  sleep(1);
  
  // 3. LISTAR DOCUMENTOS (query pesada)
  let docsRes = http.get(`${BASE_URL}/documents?page=1&limit=50`, { headers });
  check(docsRes, {
    'documents status 200': (r) => r.status === 200,
    'documents response time < 2s': (r) => r.timings.duration < 2000,
  });
  
  sleep(2);
  
  // 4. BUSCAR USUÁRIOS
  let usersRes = http.get(`${BASE_URL}/users?page=1&limit=20`, { headers });
  check(usersRes, {
    'users status 200': (r) => r.status === 200,
  });
  
  sleep(1);
  
  // 5. LISTAR EMPRESAS
  let companiesRes = http.get(`${BASE_URL}/companies`, { headers });
  check(companiesRes, {
    'companies status 200': (r) => r.status === 200,
  });
  
  sleep(2);
  
  // 6. CRIAR DOCUMENTO (operação pesada)
  let createDocRes = http.post(`${BASE_URL}/documents`, JSON.stringify({
    title: `Test Document ${Date.now()}`,
    type: 'APR',
    description: 'Load test document',
  }), { headers });
  
  check(createDocRes, {
    'create document status 201': (r) => r.status === 201,
    'create document response time < 3s': (r) => r.timings.duration < 3000,
  });
  
  sleep(3);
  
  // 7. LISTAR ATIVIDADES (logs)
  let activitiesRes = http.get(`${BASE_URL}/activities?page=1&limit=20`, { headers });
  check(activitiesRes, {
    'activities status 200': (r) => r.status === 200,
  });
  
  sleep(2);
}

// ============================================================================
// CENÁRIO DE STRESS (OPCIONAL)
// ============================================================================

export function stressTest() {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Simular múltiplas requisições simultâneas
  const responses = http.batch([
    ['GET', `${BASE_URL}/health`, null, { headers }],
    ['GET', `${BASE_URL}/health`, null, { headers }],
    ['GET', `${BASE_URL}/health`, null, { headers }],
    ['GET', `${BASE_URL}/health`, null, { headers }],
    ['GET', `${BASE_URL}/health`, null, { headers }],
  ]);
  
  responses.forEach((res) => {
    check(res, {
      'batch status 200': (r) => r.status === 200,
    });
  });
  
  sleep(1);
}

// ============================================================================
// RELATÓRIO FINAL
// ============================================================================

export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;
  
  let summary = '\n';
  summary += `${indent}✓ checks.........................: ${data.metrics.checks.values.passes}/${data.metrics.checks.values.passes + data.metrics.checks.values.fails}\n`;
  summary += `${indent}✓ http_req_duration..............: avg=${data.metrics.http_req_duration.values.avg.toFixed(2)}ms p(95)=${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += `${indent}✓ http_req_failed................: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n`;
  summary += `${indent}✓ http_reqs......................: ${data.metrics.http_reqs.values.count}\n`;
  summary += `${indent}✓ iterations.....................: ${data.metrics.iterations.values.count}\n`;
  summary += `${indent}✓ vus............................: ${data.metrics.vus.values.max}\n`;
  
  return summary;
}
