import exec from "k6/execution";
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = String(__ENV.BASE_URL || "http://localhost:3001").replace(
  /\/+$/,
  "",
);
const TEST_PROFILE = String(__ENV.TEST_PROFILE || "baseline").toLowerCase();
const LOGIN_PATH = String(__ENV.LOGIN_PATH || "/auth/login").trim();
const AUTH_ME_PATH = String(__ENV.AUTH_ME_PATH || "/auth/me").trim();
const TURNSTILE_TOKEN = String(__ENV.TURNSTILE_TOKEN || "").trim();
const USER_AGENT = String(__ENV.USER_AGENT || "k6-50-companies/1.0").trim();
const LOGIN_OK_STATUS_SET = parseStatusSet(
  String(__ENV.LOGIN_OK_STATUS || "200,201"),
);
const AUTH_ME_OK_STATUS = Number(__ENV.AUTH_ME_OK_STATUS || 200);

const loginFailures = new Counter("login_failures");
const authMeFailures = new Counter("auth_me_failures");
const login429 = new Counter("login_429_total");
const authMe429 = new Counter("auth_me_429_total");
const loginDuration = new Trend("login_duration", true);
const authMeDuration = new Trend("auth_me_duration", true);
const flowDuration = new Trend("auth_flow_duration", true);
const loginSuccessRate = new Rate("login_success_rate");
const flowSuccessRate = new Rate("flow_success_rate");

const USERS = parseUsers();

export const options = getProfileOptions(TEST_PROFILE);

function parseUsers() {
  if (__ENV.K6_USERS_JSON) {
    try {
      const parsed = JSON.parse(__ENV.K6_USERS_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((entry) => normalizeUser(entry))
          .filter((entry) => Boolean(entry));
      }
    } catch (_) {
      // Ignore invalid JSON and fallback below.
    }
  }

  if (__ENV.K6_CPF && __ENV.K6_PASSWORD) {
    return [
      normalizeUser({
        cpf: __ENV.K6_CPF,
        password: __ENV.K6_PASSWORD,
        companyId: __ENV.K6_COMPANY_ID || "",
        turnstileToken: TURNSTILE_TOKEN,
      }),
    ].filter((entry) => Boolean(entry));
  }

  return [];
}

function normalizeUser(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const cpf = String(entry.cpf || "").replace(/\D/g, "");
  const password = String(entry.password || "");

  if (cpf.length !== 11 || !password) {
    return null;
  }

  return {
    cpf,
    password,
    companyId: String(entry.companyId || "").trim(),
    turnstileToken: String(entry.turnstileToken || TURNSTILE_TOKEN).trim(),
  };
}

function parseStatusSet(raw) {
  const statuses = String(raw || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  if (!statuses.length) {
    return new Set([200, 201]);
  }

  return new Set(statuses);
}

function getProfileOptions(profile) {
  if (profile === "smoke") {
    return {
      vus: 5,
      duration: "2m",
      thresholds: {
        http_req_failed: ["rate<0.08"],
        login_duration: ["p(95)<1400"],
        auth_me_duration: ["p(95)<1400"],
        login_success_rate: ["rate>0.90"],
        flow_success_rate: ["rate>0.90"],
      },
      tags: { test_profile: "smoke_auth_me" },
    };
  }

  if (profile === "stress") {
    return {
      stages: [
        { duration: "5m", target: 50 },
        { duration: "10m", target: 150 },
        { duration: "5m", target: 0 },
      ],
      thresholds: {
        http_req_failed: ["rate<0.12"],
        login_duration: ["p(95)<2200"],
        auth_me_duration: ["p(95)<2200"],
        flow_success_rate: ["rate>0.80"],
      },
      tags: { test_profile: "stress_auth_me" },
    };
  }

  return {
    stages: [
      { duration: "3m", target: 30 },
      { duration: "10m", target: 80 },
      { duration: "5m", target: 80 },
      { duration: "2m", target: 0 },
    ],
    thresholds: {
      http_req_failed: ["rate<0.08"],
      login_duration: ["p(95)<1500"],
      auth_me_duration: ["p(95)<1500"],
      login_success_rate: ["rate>0.90"],
      flow_success_rate: ["rate>0.90"],
    },
    tags: { test_profile: "baseline_50_companies_auth_me" },
  };
}

function pickUser() {
  if (!USERS.length) {
    return null;
  }

  const idx = Math.abs(
    (exec.scenario.iterationInTest + exec.vu.idInTest * 9973) % USERS.length,
  );
  return USERS[idx];
}

function buildUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_URL}${normalizedPath}`;
}

function login(user) {
  const payload = {
    cpf: user.cpf,
    password: user.password,
  };

  if (user.turnstileToken) {
    payload.turnstileToken = user.turnstileToken;
  }

  const res = http.post(buildUrl(LOGIN_PATH), JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    tags: { endpoint: "auth_login" },
    redirects: 0,
  });

  loginDuration.add(res.timings.duration);

  if (res.status === 429) {
    login429.add(1);
  }

  let body = null;
  try {
    body = res.json();
  } catch (_) {
    body = null;
  }

  const token = typeof body?.accessToken === "string" ? body.accessToken : "";
  const responseCompanyId =
    typeof body?.user?.company_id === "string" ? body.user.company_id : "";

  const ok =
    check(
      res,
      {
        "login status esperado": (r) => LOGIN_OK_STATUS_SET.has(r.status),
        "login retorna accessToken": () => Boolean(token),
      },
      { endpoint: "auth_login" },
    ) &&
    Boolean(token);

  loginSuccessRate.add(ok);

  if (!ok) {
    loginFailures.add(1);
    return { ok: false, token: "", companyId: "" };
  }

  return {
    ok: true,
    token,
    companyId: user.companyId || responseCompanyId || "",
  };
}

function callAuthMe(token, companyId) {
  if (!token) {
    authMeFailures.add(1);
    return false;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
  };

  if (companyId) {
    headers["x-company-id"] = companyId;
  }

  const res = http.get(buildUrl(AUTH_ME_PATH), {
    headers,
    tags: { endpoint: "auth_me" },
    redirects: 0,
  });

  authMeDuration.add(res.timings.duration);

  if (res.status === 429) {
    authMe429.add(1);
  }

  let body = null;
  try {
    body = res.json();
  } catch (_) {
    body = null;
  }

  const ok = check(
    res,
    {
      "auth/me status esperado": (r) => r.status === AUTH_ME_OK_STATUS,
      "auth/me possui user.id": () => Boolean(body?.user?.id),
    },
    { endpoint: "auth_me" },
  );

  if (!ok) {
    authMeFailures.add(1);
  }

  return ok;
}

export default function () {
  const user = pickUser();
  if (!user) {
    throw new Error(
      "No test users configured. Set K6_USERS_JSON or K6_CPF/K6_PASSWORD env vars.",
    );
  }

  const start = Date.now();
  let loginResult = { ok: false, token: "", companyId: "" };
  let authMeOk = false;

  group("auth_login_plus_me", () => {
    loginResult = login(user);
    if (loginResult.ok) {
      authMeOk = callAuthMe(loginResult.token, loginResult.companyId);
    }
  });

  const flowOk = loginResult.ok && authMeOk;
  flowSuccessRate.add(flowOk);
  flowDuration.add(Date.now() - start);

  sleep(Math.random() * 1.2 + 0.3);
}
