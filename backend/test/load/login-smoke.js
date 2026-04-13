import exec from 'k6/execution';
import http from 'k6/http';
import { SharedArray } from 'k6/data';
import { check, fail } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = String(__ENV.BASE_URL || 'http://localhost:3001').replace(
  /\/+$/,
  '',
);
const CSRF_PATH = String(__ENV.CSRF_PATH || '/auth/csrf').trim();
const LOGIN_PATH = String(__ENV.LOGIN_PATH || '/auth/login').trim();
const AUTH_ME_PATH = String(__ENV.AUTH_ME_PATH || '/auth/me').trim();
const CALL_AUTH_ME = toBool(__ENV.CALL_AUTH_ME, true);
const SEND_COMPANY_HEADER = toBool(__ENV.SEND_COMPANY_HEADER, false);
const EXPECT_REFRESH_COOKIES = toBool(__ENV.EXPECT_REFRESH_COOKIES, true);
const TURNSTILE_TOKEN = String(__ENV.TURNSTILE_TOKEN || '').trim();
const USER_AGENT = String(__ENV.USER_AGENT || 'k6-login-smoke/1.0').trim();

const LOGIN_USERS_FILE = String(__ENV.LOGIN_USERS_FILE || '').trim();
const CREDENTIAL_FILTER_COMPANY_ID = normalizeCompanyId(
  String(__ENV.CREDENTIAL_FILTER_COMPANY_ID || ''),
);
const CREDENTIAL_FILTER_COMPANY_NAME = normalizeText(
  String(__ENV.CREDENTIAL_FILTER_COMPANY_NAME || ''),
);
const CREDENTIAL_FILTER_PROFILE = normalizeText(
  String(__ENV.CREDENTIAL_FILTER_PROFILE || ''),
);

const SINGLE_LOGIN_CPF = normalizeCpf(String(__ENV.LOGIN_CPF || ''));
const SINGLE_LOGIN_PASSWORD = String(__ENV.LOGIN_PASSWORD || '');
const SINGLE_LOGIN_COMPANY_ID = String(__ENV.LOGIN_COMPANY_ID || '').trim();

const LOGIN_OK_STATUS_SET = parseStatusSet(
  String(__ENV.LOGIN_OK_STATUS || '200,201'),
);
const AUTH_ME_OK_STATUS = Number(__ENV.AUTH_ME_OK_STATUS || 200);

const SMOKE_VUS = boundedInt(__ENV.SMOKE_VUS, 1, 1, 50);
const SMOKE_ITERATIONS = boundedInt(__ENV.SMOKE_ITERATIONS, 20, 1, 5000);
const SMOKE_MAX_DURATION = String(__ENV.SMOKE_MAX_DURATION || '10m');

const FINGERPRINT_MODE = String(
  __ENV.CLIENT_FINGERPRINT_MODE || 'per-iteration',
).toLowerCase();
const STATIC_FINGERPRINT = String(__ENV.CLIENT_FINGERPRINT || '').trim();
let cachedCsrfToken = '';
let cachedCsrfCookie = '';

const loginAttempts = new Counter('login_attempts_total');
const authMeAttempts = new Counter('auth_me_attempts_total');
const tokenMissingTotal = new Counter('login_missing_access_token_total');

const loginDuration = new Trend('login_duration', true);
const authMeDuration = new Trend('auth_me_duration', true);
const authFlowDuration = new Trend('auth_flow_duration', true);

const loginSuccessRate = new Rate('login_success_rate');
const authFlowSuccessRate = new Rate('auth_flow_success_rate');

const loadedUsers = new SharedArray('smoke-login-users', () => {
  if (!LOGIN_USERS_FILE) {
    return [];
  }

  const raw = open(LOGIN_USERS_FILE);
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(
      `LOGIN_USERS_FILE=${LOGIN_USERS_FILE} precisa conter um array JSON.`,
    );
  }

  return parsed
    .map((entry) => normalizeCredential(entry))
    .filter((entry) => Boolean(entry));
});

const baseCredentialPool =
  loadedUsers.length > 0
    ? loadedUsers
    : buildSingleCredentialPool(
        SINGLE_LOGIN_CPF,
        SINGLE_LOGIN_PASSWORD,
        SINGLE_LOGIN_COMPANY_ID,
        TURNSTILE_TOKEN,
      );
const credentialPool = applyCredentialFilter(baseCredentialPool);

export const options = {
  scenarios: {
    auth_smoke: {
      executor: 'shared-iterations',
      vus: SMOKE_VUS,
      iterations: SMOKE_ITERATIONS,
      maxDuration: SMOKE_MAX_DURATION,
      exec: 'smokeScenario',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    'http_req_failed{endpoint:auth_login}': ['rate<0.01'],
    'http_req_duration{endpoint:auth_login}': ['p(95)<1200'],
    login_success_rate: ['rate>0.99'],
    auth_flow_success_rate: ['rate>0.99'],
    ...(CALL_AUTH_ME
      ? {
          'http_req_failed{endpoint:auth_me}': ['rate<0.01'],
          'http_req_duration{endpoint:auth_me}': ['p(95)<900'],
        }
      : {}),
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],
};

export function setup() {
  if (!credentialPool.length) {
    fail(
      'Defina LOGIN_CPF e LOGIN_PASSWORD ou forneça LOGIN_USERS_FILE com credenciais válidas.',
    );
  }

  const smokeCredential = credentialPool[0];
  const payload = {
    cpf: smokeCredential.cpf,
    password: smokeCredential.password,
  };
  if (smokeCredential.turnstileToken) {
    payload.turnstileToken = smokeCredential.turnstileToken;
  }

  const response = http.post(
    buildUrl(LOGIN_PATH),
    JSON.stringify(payload),
    buildLoginRequestParams(
      'setup-smoke',
      resolveFingerprint(smokeCredential),
      ensureCsrfToken(),
    ),
  );
  const body = safeJson(response);
  const accessToken = extractAccessToken(body);
  const statusOk = LOGIN_OK_STATUS_SET.has(response.status);
  const cookieContract = evaluateRefreshCookieContract(response);

  if (!statusOk || !accessToken || !cookieContract.ok) {
    const reason =
      body?.message || response.body || `status ${response.status}`;
    fail(
      [
        '[setup] contrato de login inválido para smoke.',
        `status recebido: ${response.status}`,
        `token presente: ${Boolean(accessToken)}`,
        `refresh_token cookie: ${cookieContract.hasRefreshTokenCookie}`,
        `refresh_csrf cookie: ${cookieContract.hasRefreshCsrfCookie}`,
        `cookies exigidos: ${EXPECT_REFRESH_COOKIES}`,
        `detalhe: ${reason}`,
      ].join(' '),
    );
  }
}

export function smokeScenario() {
  const flowStart = Date.now();
  const credential = pickCredential();
  const fingerprint = resolveFingerprint(credential);

  const loginPayload = {
    cpf: credential.cpf,
    password: credential.password,
  };
  if (credential.turnstileToken) {
    loginPayload.turnstileToken = credential.turnstileToken;
  }

  loginAttempts.add(1);
  const loginResponse = http.post(
    buildUrl(LOGIN_PATH),
    JSON.stringify(loginPayload),
    buildLoginRequestParams('smoke', fingerprint, ensureCsrfToken()),
  );
  loginDuration.add(loginResponse.timings.duration);
  const loginBody = safeJson(loginResponse);
  const accessToken = extractAccessToken(loginBody);
  const responseCompanyId = normalizeCompanyId(loginBody?.user?.company_id);
  const loginStatusOk = LOGIN_OK_STATUS_SET.has(loginResponse.status);
  const hasToken = Boolean(accessToken);

  if (!hasToken) {
    tokenMissingTotal.add(1);
  }

  const loginOk =
    check(
      loginResponse,
      {
        'login status esperado': () => loginStatusOk,
        'login retorna accessToken': () => hasToken,
      },
      { endpoint: 'auth_login', flow: 'login' },
    ) &&
    loginStatusOk &&
    hasToken;

  loginSuccessRate.add(loginOk);

  let sessionOk = true;
  if (CALL_AUTH_ME && loginOk) {
    authMeAttempts.add(1);
    const meResponse = http.get(
      buildUrl(AUTH_ME_PATH),
      buildAuthMeRequestParams(
        accessToken,
        credential,
        fingerprint,
        responseCompanyId,
      ),
    );
    authMeDuration.add(meResponse.timings.duration);
    const meBody = safeJson(meResponse);

    sessionOk = check(
      meResponse,
      {
        'auth/me status esperado': (res) => res.status === AUTH_ME_OK_STATUS,
        'auth/me possui user.id': () => Boolean(meBody?.user?.id),
      },
      { endpoint: 'auth_me', flow: 'session_validation' },
    );
  } else if (CALL_AUTH_ME) {
    sessionOk = false;
  }

  const flowOk = loginOk && sessionOk;
  authFlowSuccessRate.add(flowOk);
  authFlowDuration.add(Date.now() - flowStart);
}

export function handleSummary(data) {
  const loginReqDuration =
    data.metrics['http_req_duration{endpoint:auth_login}'] ||
    data.metrics.http_req_duration;
  const meReqDuration =
    data.metrics['http_req_duration{endpoint:auth_me}'] || null;

  const lines = [
    '============================================================',
    'LOGIN SMOKE REPORT',
    '============================================================',
    `Target base URL      : ${BASE_URL}`,
    `Login endpoint       : ${LOGIN_PATH}`,
    `Auth/me validation   : ${CALL_AUTH_ME ? 'enabled' : 'disabled'}`,
    `Refresh cookies check: ${EXPECT_REFRESH_COOKIES ? 'enabled' : 'disabled'}`,
    `Credential pool size : ${credentialPool.length}`,
    `Credential filter    : ${describeCredentialFilter() || 'none'}`,
    `Smoke VUs/iterations : ${SMOKE_VUS}/${SMOKE_ITERATIONS}`,
    '------------------------------------------------------------',
    `HTTP failures        : ${toPct(pickStat(data.metrics.http_req_failed, 'rate'))}`,
    `Login success rate   : ${toPct(pickStat(data.metrics.login_success_rate, 'rate'))}`,
    `Flow success rate    : ${toPct(pickStat(data.metrics.auth_flow_success_rate, 'rate'))}`,
    '------------------------------------------------------------',
    `Login p50/p95/p99    : ${fmtMs(pickStat(loginReqDuration, 'p(50)'))} / ${fmtMs(
      pickStat(loginReqDuration, 'p(95)'),
    )} / ${fmtMs(pickStat(loginReqDuration, 'p(99)'))}`,
    CALL_AUTH_ME
      ? `Auth/me p95        : ${fmtMs(pickStat(meReqDuration, 'p(95)'))}`
      : 'Auth/me p95        : n/a',
    '============================================================',
  ];

  return {
    stdout: `${lines.join('\n')}\n`,
    'test/load/login-smoke-summary.json': JSON.stringify(data, null, 2),
    'test/load/login-smoke-report.txt': `${lines.join('\n')}\n`,
  };
}

function buildUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL}${normalizedPath}`;
}

function ensureCsrfToken() {
  const response = http.get(buildUrl(CSRF_PATH), {
    headers: { 'User-Agent': USER_AGENT },
    tags: { endpoint: 'auth_csrf', flow: 'csrf_bootstrap' },
    redirects: 0,
  });
  const body = safeJson(response);
  const csrfToken = String(body?.csrfToken || '').trim();
  const csrfCookie =
    extractCookieFromResponse(response, 'csrf-token') ||
    (csrfToken ? `csrf-token=${csrfToken}` : '');

  if (response.status === 200 && csrfToken) {
    cachedCsrfToken = csrfToken;
    cachedCsrfCookie = csrfCookie;
    return { token: cachedCsrfToken, cookie: cachedCsrfCookie };
  }

  cachedCsrfToken = '';
  cachedCsrfCookie = '';
  return { token: '', cookie: '' };
}

function buildLoginRequestParams(flow, fingerprint, csrf) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  };

  if (csrf?.token) {
    headers['x-csrf-token'] = csrf.token;
  }

  if (csrf?.cookie) {
    headers['Cookie'] = csrf.cookie;
  }

  if (fingerprint) {
    headers['x-client-fingerprint'] = fingerprint;
  }

  return {
    headers,
    tags: { endpoint: 'auth_login', flow },
    redirects: 0,
  };
}

function buildAuthMeRequestParams(
  token,
  credential,
  fingerprint,
  responseCompanyId,
) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': USER_AGENT,
  };

  const companyId =
    credential.companyId || responseCompanyId || credential.responseCompanyId;
  if (SEND_COMPANY_HEADER && companyId) {
    headers['x-company-id'] = companyId;
  }

  if (fingerprint) {
    headers['x-client-fingerprint'] = fingerprint;
  }

  return {
    headers,
    tags: { endpoint: 'auth_me', flow: 'session_validation' },
    redirects: 0,
  };
}

function pickCredential() {
  const iteration = exec.scenario.iterationInTest;
  const vu = exec.vu.idInTest;
  const index = Math.abs((iteration + vu * 9973) % credentialPool.length);
  return credentialPool[index];
}

function resolveFingerprint(credential) {
  const vuId = safeVuId();
  const iterationId = safeIterationId();

  if (FINGERPRINT_MODE === 'none') {
    return '';
  }
  if (FINGERPRINT_MODE === 'static') {
    return STATIC_FINGERPRINT || 'k6-static-fingerprint';
  }
  if (FINGERPRINT_MODE === 'per-iteration') {
    return `k6-${vuId}-${iterationId}`;
  }
  if (credential.fingerprint) {
    return credential.fingerprint;
  }
  return `k6-vu-${vuId}`;
}

function safeVuId() {
  try {
    return Number(exec.vu?.idInTest || 0);
  } catch {
    return 0;
  }
}

function safeIterationId() {
  try {
    return Number(exec.scenario?.iterationInTest || 0);
  } catch {
    return 0;
  }
}

function evaluateRefreshCookieContract(response) {
  const hasRefreshTokenCookie = hasResponseCookie(response, 'refresh_token');
  const hasRefreshCsrfCookie = hasResponseCookie(response, 'refresh_csrf');
  const ok =
    !EXPECT_REFRESH_COOKIES || (hasRefreshTokenCookie && hasRefreshCsrfCookie);
  return {
    hasRefreshTokenCookie,
    hasRefreshCsrfCookie,
    ok,
  };
}

function hasResponseCookie(response, cookieName) {
  const cookieBucket = response?.cookies?.[cookieName];
  if (Array.isArray(cookieBucket) && cookieBucket.length > 0) {
    return true;
  }
  if (cookieBucket && typeof cookieBucket === 'object') {
    return true;
  }
  const setCookieNames = extractSetCookieNames(response);
  return setCookieNames.has(cookieName.toLowerCase());
}

function extractSetCookieNames(response) {
  const raw =
    response?.headers?.['Set-Cookie'] ?? response?.headers?.['set-cookie'];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const names = new Set();
  for (const value of values) {
    const firstPair = String(value || '').split(';', 1)[0];
    const [name] = firstPair.split('=');
    const normalizedName = String(name || '')
      .trim()
      .toLowerCase();
    if (normalizedName) {
      names.add(normalizedName);
    }
  }
  return names;
}

function extractCookieFromResponse(response, cookieName) {
  const cookieBucket = response?.cookies?.[cookieName];
  if (Array.isArray(cookieBucket) && cookieBucket.length > 0) {
    const value = String(cookieBucket[0]?.value || '').trim();
    if (value) {
      return `${cookieName}=${value}`;
    }
  }
  if (cookieBucket && typeof cookieBucket === 'object') {
    const value = String(cookieBucket.value || '').trim();
    if (value) {
      return `${cookieName}=${value}`;
    }
  }

  const raw =
    response?.headers?.['Set-Cookie'] ?? response?.headers?.['set-cookie'];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const value of values) {
    const firstPair = String(value || '').split(';', 1)[0];
    const [name, cookieValue] = firstPair.split('=');
    if (
      String(name || '')
        .trim()
        .toLowerCase() === cookieName.toLowerCase()
    ) {
      const normalizedValue = String(cookieValue || '').trim();
      if (normalizedValue) {
        return `${cookieName}=${normalizedValue}`;
      }
    }
  }

  return '';
}

function normalizeCredential(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const cpf = normalizeCpf(String(entry.cpf || ''));
  const password = String(entry.password || '');
  if (!cpf || !password) {
    return null;
  }

  return {
    cpf,
    password,
    companyId: String(entry.companyId || '').trim(),
    companyName: String(entry.companyName || entry.company || '').trim(),
    profile: String(entry.profile || '').trim(),
    turnstileToken: String(entry.turnstileToken || TURNSTILE_TOKEN).trim(),
    fingerprint: String(entry.fingerprint || '').trim(),
    responseCompanyId: '',
  };
}

function buildSingleCredentialPool(cpf, password, companyId, turnstileToken) {
  if (!cpf || !password) {
    return [];
  }
  return [
    {
      cpf,
      password,
      companyId,
      companyName: '',
      profile: '',
      turnstileToken,
      fingerprint: '',
      responseCompanyId: '',
    },
  ];
}

function normalizeCpf(input) {
  const digits = String(input || '').replace(/\D/g, '');
  return digits.length === 11 ? digits : '';
}

function normalizeCompanyId(input) {
  const value = String(input || '').trim();
  return value || '';
}

function normalizeText(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function applyCredentialFilter(pool) {
  if (!Array.isArray(pool) || pool.length === 0) {
    return [];
  }
  if (
    !CREDENTIAL_FILTER_COMPANY_ID &&
    !CREDENTIAL_FILTER_COMPANY_NAME &&
    !CREDENTIAL_FILTER_PROFILE
  ) {
    return pool;
  }

  return pool.filter((credential) => {
    if (CREDENTIAL_FILTER_COMPANY_ID) {
      const companyId = normalizeCompanyId(credential.companyId).toLowerCase();
      if (companyId !== CREDENTIAL_FILTER_COMPANY_ID.toLowerCase()) {
        return false;
      }
    }

    if (CREDENTIAL_FILTER_COMPANY_NAME) {
      const companyName = normalizeText(credential.companyName || '');
      if (!companyName.includes(CREDENTIAL_FILTER_COMPANY_NAME)) {
        return false;
      }
    }

    if (CREDENTIAL_FILTER_PROFILE) {
      const profile = normalizeText(credential.profile || '');
      if (!profile.includes(CREDENTIAL_FILTER_PROFILE)) {
        return false;
      }
    }

    return true;
  });
}

function describeCredentialFilter() {
  const labels = [];
  if (CREDENTIAL_FILTER_COMPANY_ID) {
    labels.push(`companyId=${CREDENTIAL_FILTER_COMPANY_ID}`);
  }
  if (CREDENTIAL_FILTER_COMPANY_NAME) {
    labels.push(`companyName~=${CREDENTIAL_FILTER_COMPANY_NAME}`);
  }
  if (CREDENTIAL_FILTER_PROFILE) {
    labels.push(`profile~=${CREDENTIAL_FILTER_PROFILE}`);
  }
  return labels.join(', ');
}

function safeJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function extractAccessToken(responseBody) {
  const token = responseBody?.accessToken;
  return typeof token === 'string' && token.trim() ? token.trim() : '';
}

function parseStatusSet(raw) {
  const statuses = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  if (!statuses.length) {
    return new Set([200, 201]);
  }

  return new Set(statuses);
}

function boundedInt(raw, fallback, min, max) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
}

function toBool(raw, fallback) {
  if (typeof raw !== 'string') {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function pickStat(metric, key) {
  if (!metric || !metric.values) {
    return null;
  }
  const value = metric.values[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function fmtMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `${value.toFixed(2)}ms`;
}

function toPct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(2)}%`;
}
