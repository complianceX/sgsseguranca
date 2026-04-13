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
const USER_AGENT = String(__ENV.USER_AGENT || 'k6-login-load/1.0').trim();
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

const FINGERPRINT_MODE = String(
  __ENV.CLIENT_FINGERPRINT_MODE || 'per-iteration',
).toLowerCase();
const STATIC_FINGERPRINT = String(__ENV.CLIENT_FINGERPRINT || '').trim();
let cachedCsrfToken = '';
let cachedCsrfCookie = '';

const PREALLOCATED_VUS = boundedInt(__ENV.PREALLOCATED_VUS, 320, 10, 5000);
const MAX_VUS = boundedInt(__ENV.MAX_VUS, 1500, PREALLOCATED_VUS, 10000);

const STAGE_10_DURATION = String(__ENV.STAGE_10_DURATION || '2m');
const STAGE_25_DURATION = String(__ENV.STAGE_25_DURATION || '3m');
const STAGE_50_DURATION = String(__ENV.STAGE_50_DURATION || '3m');
const STAGE_75_DURATION = String(__ENV.STAGE_75_DURATION || '3m');
const STAGE_100_DURATION = String(__ENV.STAGE_100_DURATION || '3m');
const STAGE_150_DURATION = String(__ENV.STAGE_150_DURATION || '3m');
const STAGE_200_DURATION = String(__ENV.STAGE_200_DURATION || '3m');
const COOLDOWN_DURATION = String(__ENV.COOLDOWN_DURATION || '2m');

const ENABLE_SATURATION_HOLD = toBool(__ENV.ENABLE_SATURATION_HOLD, true);
const HOLD_RATE = boundedInt(__ENV.HOLD_RATE, 200, 1, 5000);
const HOLD_DURATION = String(__ENV.HOLD_DURATION || '10m');
const HOLD_START_TIME = String(__ENV.HOLD_START_TIME || '22m');
const DROPPED_ITERATIONS_MAX = boundedInt(
  __ENV.DROPPED_ITERATIONS_MAX,
  5000,
  1,
  1_000_000,
);
const DYNAMIC_POOL_GUARD = toBool(__ENV.DYNAMIC_POOL_GUARD, true);
const TARGET_LOGINS_PER_USER = boundedInt(
  __ENV.TARGET_LOGINS_PER_USER,
  300,
  20,
  50000,
);
const ESTIMATED_TOTAL_LOGINS = estimateProgressiveTotalLogins();
const AUTH_ME_DYNAMIC_MIN_CREDENTIAL_POOL_SIZE = DYNAMIC_POOL_GUARD
  ? Math.max(
      120,
      Math.ceil(ESTIMATED_TOTAL_LOGINS / Math.max(TARGET_LOGINS_PER_USER, 1)),
    )
  : 120;
const MIN_CREDENTIAL_POOL_SIZE = boundedInt(
  __ENV.MIN_CREDENTIAL_POOL_SIZE,
  Math.max(CALL_AUTH_ME ? 120 : 20, Math.ceil(PREALLOCATED_VUS / 5)),
  1,
  50000,
);
const REQUIRE_MIN_CREDENTIAL_POOL = toBool(
  __ENV.REQUIRE_MIN_CREDENTIAL_POOL,
  CALL_AUTH_ME,
);
const AUTH_ME_MIN_CREDENTIAL_POOL_SIZE = boundedInt(
  __ENV.AUTH_ME_MIN_CREDENTIAL_POOL_SIZE,
  AUTH_ME_DYNAMIC_MIN_CREDENTIAL_POOL_SIZE,
  40,
  50000,
);
const ENFORCED_MIN_CREDENTIAL_POOL_SIZE = CALL_AUTH_ME
  ? Math.max(MIN_CREDENTIAL_POOL_SIZE, AUTH_ME_MIN_CREDENTIAL_POOL_SIZE)
  : MIN_CREDENTIAL_POOL_SIZE;

const loginAttempts = new Counter('login_attempts_total');
const loginSuccessTotal = new Counter('login_success_total');
const loginFailureTotal = new Counter('login_failure_total');
const loginStatus2xxTotal = new Counter('login_status_2xx_total');
const loginStatus401Total = new Counter('login_status_401_total');
const loginStatus429Total = new Counter('login_status_429_total');
const loginStatus5xxTotal = new Counter('login_status_5xx_total');
const loginStatusOtherTotal = new Counter('login_status_other_total');
const authMeAttempts = new Counter('auth_me_attempts_total');
const authMeSuccessTotal = new Counter('auth_me_success_total');
const authMeStatus2xxTotal = new Counter('auth_me_status_2xx_total');
const authMeStatus401403Total = new Counter('auth_me_status_401_403_total');
const authMeStatus429Total = new Counter('auth_me_status_429_total');
const authMeStatus5xxTotal = new Counter('auth_me_status_5xx_total');
const authMeStatusOtherTotal = new Counter('auth_me_status_other_total');
const tokenMissingTotal = new Counter('login_missing_access_token_total');

const loginDuration = new Trend('login_duration', true);
const authMeDuration = new Trend('auth_me_duration', true);
const authFlowDuration = new Trend('auth_flow_duration', true);

const loginSuccessRate = new Rate('login_success_rate');
const loginFailureRate = new Rate('login_failure_rate');
const loginRateLimitedRate = new Rate('login_rate_limited_rate');
const sessionValidationSuccessRate = new Rate(
  'session_validation_success_rate',
);
const sessionChurnSuspectedRate = new Rate('session_churn_suspected_rate');
const authFlowSuccessRate = new Rate('auth_flow_success_rate');

const loadedUsers = new SharedArray('load-login-users', () => {
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

const thresholds = {
  checks: ['rate>0.99'],
  http_req_failed: ['rate<0.01'],
  'http_req_failed{endpoint:auth_login}': ['rate<0.01'],
  'http_req_duration{endpoint:auth_login}': ['p(95)<800', 'p(99)<1500'],
  login_success_rate: ['rate>0.99'],
  login_failure_rate: ['rate<0.01'],
  auth_flow_success_rate: ['rate>0.99'],
  dropped_iterations: [`count<${DROPPED_ITERATIONS_MAX}`],
};

if (CALL_AUTH_ME) {
  thresholds['http_req_failed{endpoint:auth_me}'] = ['rate<0.01'];
  thresholds['http_req_duration{endpoint:auth_me}'] = ['p(95)<700'];
  thresholds.session_validation_success_rate = ['rate>0.99'];
}

const scenarios = {
  login_progressive: {
    executor: 'ramping-arrival-rate',
    exec: 'loginScenario',
    startRate: 1,
    timeUnit: '1s',
    preAllocatedVUs: PREALLOCATED_VUS,
    maxVUs: MAX_VUS,
    stages: [
      { target: 10, duration: STAGE_10_DURATION },
      { target: 25, duration: STAGE_25_DURATION },
      { target: 50, duration: STAGE_50_DURATION },
      { target: 75, duration: STAGE_75_DURATION },
      { target: 100, duration: STAGE_100_DURATION },
      { target: 150, duration: STAGE_150_DURATION },
      { target: 200, duration: STAGE_200_DURATION },
      { target: 0, duration: COOLDOWN_DURATION },
    ],
  },
};

if (ENABLE_SATURATION_HOLD) {
  scenarios.login_saturation_hold = {
    executor: 'constant-arrival-rate',
    exec: 'loginScenario',
    startTime: HOLD_START_TIME,
    rate: HOLD_RATE,
    timeUnit: '1s',
    duration: HOLD_DURATION,
    preAllocatedVUs: PREALLOCATED_VUS,
    maxVUs: MAX_VUS,
  };
}

export const options = {
  scenarios,
  thresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],
};

export function setup() {
  if (!credentialPool.length) {
    const filterLabel = describeCredentialFilter();
    fail(
      filterLabel
        ? `Nenhuma credencial disponível após filtro (${filterLabel}). Ajuste CREDENTIAL_FILTER_COMPANY_ID/CREDENTIAL_FILTER_COMPANY_NAME/CREDENTIAL_FILTER_PROFILE ou o arquivo LOGIN_USERS_FILE.`
        : 'Defina LOGIN_CPF e LOGIN_PASSWORD ou forneça LOGIN_USERS_FILE com credenciais válidas.',
    );
  }

  if (
    (CALL_AUTH_ME || REQUIRE_MIN_CREDENTIAL_POOL) &&
    credentialPool.length < ENFORCED_MIN_CREDENTIAL_POOL_SIZE
  ) {
    fail(
      [
        `[setup] pool de credenciais insuficiente para login + sessão: ${credentialPool.length}.`,
        `Use pelo menos ${ENFORCED_MIN_CREDENTIAL_POOL_SIZE} usuários distintos para evitar churn de sessão e evictions artificiais.`,
        'Dica: gere uma massa maior com IMPORT_USERS_MULTIPLIER ou aponte LOGIN_USERS_FILE para um pool mais amplo.',
      ].join(' '),
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
    buildLoginRequestParams('setup-smoke', undefined, ensureCsrfToken()),
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
        '[setup] contrato de login inválido para o alvo atual.',
        `status recebido: ${response.status}`,
        `token presente: ${Boolean(accessToken)}`,
        `refresh_token cookie: ${cookieContract.hasRefreshTokenCookie}`,
        `refresh_csrf cookie: ${cookieContract.hasRefreshCsrfCookie}`,
        `cookies exigidos: ${EXPECT_REFRESH_COOKIES}`,
        `detalhe: ${reason}`,
        'Dica: valide TURNSTILE_ENABLED, rate limits e credenciais antes do teste pesado.',
      ].join(' '),
    );
  }

  return { ready: true };
}

export function loginScenario() {
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
    buildLoginRequestParams('login', fingerprint, ensureCsrfToken()),
  );
  loginDuration.add(loginResponse.timings.duration);

  const loginBody = safeJson(loginResponse);
  const accessToken = extractAccessToken(loginBody);
  const responseCompanyId = normalizeCompanyId(loginBody?.user?.company_id);
  const loginStatusOk = LOGIN_OK_STATUS_SET.has(loginResponse.status);
  const hasToken = Boolean(accessToken);
  trackLoginStatus(loginResponse.status);
  const loginChecksOk = check(
    loginResponse,
    {
      'login status esperado': () => loginStatusOk,
      'login retorna accessToken': () => hasToken,
    },
    { endpoint: 'auth_login', flow: 'login' },
  );

  if (!hasToken) {
    tokenMissingTotal.add(1);
  }

  const loginOk = loginChecksOk && loginStatusOk && hasToken;
  loginSuccessRate.add(loginOk);
  loginFailureRate.add(!loginOk);
  loginRateLimitedRate.add(loginResponse.status === 429);
  if (loginOk) {
    loginSuccessTotal.add(1);
  } else {
    loginFailureTotal.add(1);
  }

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
    trackAuthMeStatus(meResponse.status);
    sessionChurnSuspectedRate.add(
      meResponse.status === 401 || meResponse.status === 403,
    );

    sessionOk = check(
      meResponse,
      {
        'auth/me status esperado': (res) => res.status === AUTH_ME_OK_STATUS,
        'auth/me possui user.id': () => Boolean(meBody?.user?.id),
      },
      { endpoint: 'auth_me', flow: 'session_validation' },
    );

    sessionValidationSuccessRate.add(sessionOk);
    if (sessionOk) {
      authMeSuccessTotal.add(1);
    }
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
  const dropped = data.metrics.dropped_iterations;

  const loginP95 = pickStat(loginReqDuration, 'p(95)');
  const classification = classifyLatency(loginP95);

  const lines = [
    '============================================================',
    'LOGIN LOAD REPORT',
    '============================================================',
    `Target base URL      : ${BASE_URL}`,
    `Login endpoint       : ${LOGIN_PATH}`,
    `Auth/me validation   : ${CALL_AUTH_ME ? 'enabled' : 'disabled'}`,
    `Refresh cookies check: ${EXPECT_REFRESH_COOKIES ? 'enabled' : 'disabled'}`,
    `Credential pool size : ${credentialPool.length}`,
    `Credential pool min  : ${CALL_AUTH_ME || REQUIRE_MIN_CREDENTIAL_POOL ? ENFORCED_MIN_CREDENTIAL_POOL_SIZE : 'disabled'}`,
    `Pool guard mode      : ${DYNAMIC_POOL_GUARD ? 'dynamic' : 'static'}`,
    `Est. total logins    : ${ESTIMATED_TOTAL_LOGINS}`,
    `Target logins/user   : ${TARGET_LOGINS_PER_USER}`,
    `Credential filter    : ${describeCredentialFilter() || 'none'}`,
    '------------------------------------------------------------',
    `Iterations           : ${pickStat(data.metrics.iterations, 'count')}`,
    `Dropped iterations   : ${pickStat(dropped, 'count')}`,
    `HTTP failures        : ${toPct(pickStat(data.metrics.http_req_failed, 'rate'))}`,
    `Login success rate   : ${toPct(pickStat(data.metrics.login_success_rate, 'rate'))}`,
    `Login 429 rate       : ${toPct(pickStat(data.metrics.login_rate_limited_rate, 'rate'))}`,
    CALL_AUTH_ME
      ? `Session success rate : ${toPct(pickStat(data.metrics.session_validation_success_rate, 'rate'))}`
      : 'Session success rate : n/a',
    CALL_AUTH_ME
      ? `Session churn suspeito (401/403) : ${toPct(pickStat(data.metrics.session_churn_suspected_rate, 'rate'))}`
      : 'Session churn suspeito (401/403) : n/a',
    `Flow success rate    : ${toPct(pickStat(data.metrics.auth_flow_success_rate, 'rate'))}`,
    `Login status counts  : 2xx=${pickStat(data.metrics.login_status_2xx_total, 'count')} 401=${pickStat(
      data.metrics.login_status_401_total,
      'count',
    )} 429=${pickStat(data.metrics.login_status_429_total, 'count')} 5xx=${pickStat(
      data.metrics.login_status_5xx_total,
      'count',
    )} other=${pickStat(data.metrics.login_status_other_total, 'count')}`,
    CALL_AUTH_ME
      ? `Auth/me status counts: 2xx=${pickStat(data.metrics.auth_me_status_2xx_total, 'count')} 401/403=${pickStat(
          data.metrics.auth_me_status_401_403_total,
          'count',
        )} 429=${pickStat(data.metrics.auth_me_status_429_total, 'count')} 5xx=${pickStat(
          data.metrics.auth_me_status_5xx_total,
          'count',
        )} other=${pickStat(data.metrics.auth_me_status_other_total, 'count')}`
      : 'Auth/me status counts: n/a',
    '------------------------------------------------------------',
    `Login p50/p95/p99    : ${fmtMs(pickStat(loginReqDuration, 'p(50)'))} / ${fmtMs(
      loginP95,
    )} / ${fmtMs(pickStat(loginReqDuration, 'p(99)'))}`,
    CALL_AUTH_ME
      ? `Auth/me p95        : ${fmtMs(pickStat(meReqDuration, 'p(95)'))}`
      : 'Auth/me p95        : n/a',
    `Status classificação : ${classification}`,
    '============================================================',
  ];

  return {
    stdout: `${lines.join('\n')}\n`,
    'test/load/login-load-summary.json': JSON.stringify(data, null, 2),
    'test/load/login-load-report.txt': `${lines.join('\n')}\n`,
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

function trackLoginStatus(status) {
  if (status >= 200 && status < 300) {
    loginStatus2xxTotal.add(1);
    return;
  }
  if (status === 401) {
    loginStatus401Total.add(1);
    return;
  }
  if (status === 429) {
    loginStatus429Total.add(1);
    return;
  }
  if (status >= 500 && status <= 599) {
    loginStatus5xxTotal.add(1);
    return;
  }
  loginStatusOtherTotal.add(1);
}

function trackAuthMeStatus(status) {
  if (status >= 200 && status < 300) {
    authMeStatus2xxTotal.add(1);
    return;
  }
  if (status === 401 || status === 403) {
    authMeStatus401403Total.add(1);
    return;
  }
  if (status === 429) {
    authMeStatus429Total.add(1);
    return;
  }
  if (status >= 500 && status <= 599) {
    authMeStatus5xxTotal.add(1);
    return;
  }
  authMeStatusOtherTotal.add(1);
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

function estimateProgressiveTotalLogins() {
  const stages = [
    { target: 10, duration: STAGE_10_DURATION },
    { target: 25, duration: STAGE_25_DURATION },
    { target: 50, duration: STAGE_50_DURATION },
    { target: 75, duration: STAGE_75_DURATION },
    { target: 100, duration: STAGE_100_DURATION },
    { target: 150, duration: STAGE_150_DURATION },
    { target: 200, duration: STAGE_200_DURATION },
    { target: 0, duration: COOLDOWN_DURATION },
  ];

  let total = 0;
  for (const stage of stages) {
    total += Math.max(stage.target, 0) * durationToSeconds(stage.duration);
  }

  if (ENABLE_SATURATION_HOLD) {
    total += HOLD_RATE * durationToSeconds(HOLD_DURATION);
  }

  return Math.max(Math.ceil(total), 1);
}

function durationToSeconds(value) {
  const input = String(value || '')
    .trim()
    .toLowerCase();
  const match = input.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  if (unit === 'ms') return amount / 1000;
  if (unit === 's') return amount;
  if (unit === 'm') return amount * 60;
  if (unit === 'h') return amount * 3600;
  return 0;
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

function classifyLatency(p95) {
  if (typeof p95 !== 'number' || !Number.isFinite(p95)) {
    return 'indeterminado';
  }
  if (p95 < 800) {
    return 'bom (<800ms)';
  }
  if (p95 < 1500) {
    return 'alerta (800-1500ms)';
  }
  return 'degradado (>1500ms)';
}
