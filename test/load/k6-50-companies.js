import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import exec from 'k6/execution';

const loginFailures = new Counter('login_failures');
const apiFailures = new Counter('api_failures');
const loginDuration = new Trend('login_duration');
const dashboardDuration = new Trend('dashboard_duration');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_PROFILE = (__ENV.TEST_PROFILE || 'baseline').toLowerCase();

function parseUsers() {
  if (__ENV.K6_USERS_JSON) {
    try {
      const parsed = JSON.parse(__ENV.K6_USERS_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (_) {
      // Ignore invalid JSON and fallback below.
    }
  }

  if (__ENV.K6_CPF && __ENV.K6_PASSWORD) {
    return [
      {
        cpf: __ENV.K6_CPF,
        password: __ENV.K6_PASSWORD,
        companyId: __ENV.K6_COMPANY_ID || '',
      },
    ];
  }

  return [];
}

const USERS = parseUsers();

function getProfileOptions(profile) {
  if (profile === 'smoke') {
    return {
      vus: 5,
      duration: '2m',
      thresholds: {
        http_req_failed: ['rate<0.05'],
        http_req_duration: ['p(95)<1200'],
      },
    };
  }

  if (profile === 'stress') {
    return {
      stages: [
        { duration: '5m', target: 50 },
        { duration: '10m', target: 150 },
        { duration: '5m', target: 0 },
      ],
      thresholds: {
        http_req_failed: ['rate<0.08'],
        http_req_duration: ['p(95)<2000'],
      },
    };
  }

  // baseline (default): foco no cenário de 50 empresas ativas.
  return {
    stages: [
      { duration: '3m', target: 30 },
      { duration: '10m', target: 80 },
      { duration: '5m', target: 80 },
      { duration: '2m', target: 0 },
    ],
    thresholds: {
      http_req_failed: ['rate<0.05'],
      http_req_duration: ['p(95)<1500'],
      login_duration: ['p(95)<1200'],
      dashboard_duration: ['p(95)<1500'],
    },
    tags: {
      test_profile: 'baseline_50_companies',
    },
  };
}

export const options = getProfileOptions(TEST_PROFILE);

function pickUser() {
  if (!USERS.length) {
    return null;
  }
  const idx = (exec.vu.idInTest - 1) % USERS.length;
  return USERS[idx];
}

function login(user) {
  const payload = JSON.stringify({
    cpf: user.cpf,
    password: user.password,
  });

  const res = http.post(`${BASE_URL}/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'auth_login' },
  });

  loginDuration.add(res.timings.duration);

  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
    'login has token or 2fa': (r) => {
      try {
        const body = r.json();
        return Boolean(body.access_token || body.requires2FA || body.requires2FASetup);
      } catch (_) {
        return false;
      }
    },
  });

  if (!ok) {
    loginFailures.add(1);
    return { token: '', companyId: '' };
  }

  let token = '';
  let companyId = user.companyId || '';

  try {
    const body = res.json();
    token = body.access_token || '';
    if (!companyId && body.user && body.user.company_id) {
      companyId = body.user.company_id;
    }
  } catch (_) {
    // Ignore parsing errors.
  }

  return { token, companyId };
}

function callHealth() {
  const res = http.get(`${BASE_URL}/health`, { tags: { endpoint: 'health' } });
  const ok = check(res, {
    'health status 200': (r) => r.status === 200,
  });
  if (!ok) {
    apiFailures.add(1);
  }
}

function callDashboard(token, companyId) {
  if (!token) {
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
  };
  if (companyId) {
    headers['x-company-id'] = companyId;
  }

  const res = http.get(`${BASE_URL}/dashboard/stats`, {
    headers,
    tags: { endpoint: 'dashboard_stats' },
  });

  dashboardDuration.add(res.timings.duration);

  const ok = check(res, {
    'dashboard status 200': (r) => r.status === 200,
  });
  if (!ok) {
    apiFailures.add(1);
  }
}

export default function () {
  const user = pickUser();
  if (!user) {
    throw new Error(
      'No test users configured. Set K6_USERS_JSON or K6_CPF/K6_PASSWORD env vars.',
    );
  }

  group('public_health', () => {
    callHealth();
  });

  group('auth_and_dashboard', () => {
    const { token, companyId } = login(user);
    callDashboard(token, companyId);
  });

  sleep(Math.random() * 1.5 + 0.5);
}

