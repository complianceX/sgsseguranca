import exec from "k6/execution";
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = String(__ENV.BASE_URL || "http://localhost:3011").replace(
  /\/+$/,
  "",
);
const TEST_PROFILE = String(__ENV.TEST_PROFILE || "smoke").toLowerCase();

const CSRF_PATH = String(__ENV.CSRF_PATH || "/auth/csrf").trim();
const LOGIN_PATH = String(__ENV.LOGIN_PATH || "/auth/login").trim();
const AUTH_ME_PATH = String(__ENV.AUTH_ME_PATH || "/auth/me").trim();
const USERS_PATH = String(__ENV.USERS_PATH || "/users?page=1&limit=20").trim();
const SITES_PATH = String(__ENV.SITES_PATH || "/sites?page=1&limit=10").trim();
const DDS_BASE_PATH = String(__ENV.DDS_BASE_PATH || "/dds").trim();

const USER_AGENT = String(__ENV.USER_AGENT || "k6-dds-emission/1.0").trim();
const TURNSTILE_TOKEN = String(__ENV.TURNSTILE_TOKEN || "").trim();
const AUTO_CREATE_SITE = toBool(__ENV.AUTO_CREATE_SITE, true);
const REQUIRE_STORAGE = toBool(__ENV.REQUIRE_STORAGE, false);
const SITE_NAME_PREFIX = String(
  __ENV.SITE_NAME_PREFIX || "Site técnico benchmark DDS",
).trim();
const FIXED_SITE_ID = String(__ENV.FIXED_SITE_ID || "").trim();
const DEBUG_LOG_FAILURES = toBool(__ENV.DEBUG_LOG_FAILURES, false);
const PREFER_AUTH_ME = toBool(__ENV.PREFER_AUTH_ME, false);
const LOGIN_MODE = String(__ENV.LOGIN_MODE || "each_iteration").toLowerCase();
const SOAK_DURATION = String(__ENV.SOAK_DURATION || "60m");
const PROG_STAGE_1_DURATION = String(__ENV.PROG_STAGE_1_DURATION || "2m");
const PROG_STAGE_2_DURATION = String(__ENV.PROG_STAGE_2_DURATION || "4m");
const PROG_STAGE_3_DURATION = String(__ENV.PROG_STAGE_3_DURATION || "4m");
const PROG_STAGE_4_DURATION = String(__ENV.PROG_STAGE_4_DURATION || "4m");
const PROG_STAGE_5_DURATION = String(__ENV.PROG_STAGE_5_DURATION || "2m");
const PROG_STAGE_1_TARGET = Number(__ENV.PROG_STAGE_1_TARGET || 5);
const PROG_STAGE_2_TARGET = Number(__ENV.PROG_STAGE_2_TARGET || 15);
const PROG_STAGE_3_TARGET = Number(__ENV.PROG_STAGE_3_TARGET || 30);
const PROG_STAGE_4_TARGET = Number(__ENV.PROG_STAGE_4_TARGET || 45);
const PROG_STAGE_5_TARGET = Number(__ENV.PROG_STAGE_5_TARGET || 0);
const SLEEP_MIN_SECONDS = Number(__ENV.SLEEP_MIN_SECONDS || 0.2);
const SLEEP_MAX_SECONDS = Number(__ENV.SLEEP_MAX_SECONDS || 0.8);

const LOGIN_OK_STATUS = parseStatusSet(
  String(__ENV.LOGIN_OK_STATUS || "200,201"),
);

const USERS = parseUsers();
const PDF_BYTES = buildMinimalPdf();

const loginDuration = new Trend("dds_login_duration", true);
const getUsersDuration = new Trend("dds_get_users_duration", true);
const getSitesDuration = new Trend("dds_get_sites_duration", true);
const createSiteDuration = new Trend("dds_create_site_duration", true);
const createDdsDuration = new Trend("dds_create_duration", true);
const publishDdsDuration = new Trend("dds_publish_duration", true);
const signaturesDuration = new Trend("dds_signatures_duration", true);
const uploadPdfDuration = new Trend("dds_upload_pdf_duration", true);
const getPdfDuration = new Trend("dds_get_pdf_duration", true);
const fullFlowDuration = new Trend("dds_flow_duration", true);

const loginFailures = new Counter("dds_login_failures");
const contractFailures = new Counter("dds_contract_failures");
const storageUnavailable = new Counter("dds_storage_unavailable");

const flowSuccessRate = new Rate("dds_flow_success_rate");
const uploadSuccessRate = new Rate("dds_upload_success_rate");
let cachedVuSession = null;

export const options = getProfileOptions(TEST_PROFILE);

function getProfileOptions(profile) {
  if (profile === "soak60") {
    return {
      scenarios: {
        dds_soak_60m: {
          executor: "constant-vus",
          vus: Number(__ENV.SOAK_VUS || 8),
          duration: SOAK_DURATION,
        },
      },
      thresholds: buildThresholds(),
      tags: { flow: "dds_emission", profile: "soak60" },
    };
  }

  if (profile === "progressive") {
    return {
      stages: [
        { duration: PROG_STAGE_1_DURATION, target: PROG_STAGE_1_TARGET },
        { duration: PROG_STAGE_2_DURATION, target: PROG_STAGE_2_TARGET },
        { duration: PROG_STAGE_3_DURATION, target: PROG_STAGE_3_TARGET },
        { duration: PROG_STAGE_4_DURATION, target: PROG_STAGE_4_TARGET },
        { duration: PROG_STAGE_5_DURATION, target: PROG_STAGE_5_TARGET },
      ],
      thresholds: buildThresholds(),
      tags: { flow: "dds_emission", profile: "progressive" },
    };
  }

  return {
    scenarios: {
      dds_smoke: {
        executor: "shared-iterations",
        vus: Number(__ENV.SMOKE_VUS || 2),
        iterations: Number(__ENV.SMOKE_ITERATIONS || 8),
        maxDuration: String(__ENV.SMOKE_MAX_DURATION || "10m"),
      },
    },
    thresholds: buildThresholds(),
    tags: { flow: "dds_emission", profile: "smoke" },
  };
}

function buildThresholds() {
  return {
    http_req_failed: REQUIRE_STORAGE ? ["rate<0.10"] : ["rate<0.30"],
    dds_flow_success_rate: ["rate>0.85"],
    dds_login_duration: ["p(95)<1400"],
    dds_create_duration: ["p(95)<1500"],
    dds_signatures_duration: ["p(95)<1500"],
    dds_upload_pdf_duration: REQUIRE_STORAGE
      ? ["p(95)<2200"]
      : ["p(95)<3000"],
  };
}

function parseUsers() {
  if (__ENV.K6_USERS_JSON) {
    try {
      const parsed = JSON.parse(__ENV.K6_USERS_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeUser).filter(Boolean);
      }
    } catch (_) {
      return [];
    }
  }

  if (__ENV.K6_CPF && __ENV.K6_PASSWORD) {
    return [
      normalizeUser({
        cpf: __ENV.K6_CPF,
        password: __ENV.K6_PASSWORD,
        companyId: __ENV.K6_COMPANY_ID || "",
      }),
    ].filter(Boolean);
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
    siteId: String(entry.siteId || "").trim(),
  };
}

function parseStatusSet(raw) {
  const parsed = String(raw || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  return new Set(parsed.length ? parsed : [200, 201]);
}

function pickUser() {
  if (!USERS.length) {
    return null;
  }
  const idx = Math.abs(
    (exec.scenario.iterationInTest + exec.vu.idInTest * 7919) % USERS.length,
  );
  return USERS[idx];
}

function buildUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_URL}${normalized}`;
}

function extractCookieFromResponse(response, cookieName) {
  if (!response || !response.cookies || !response.cookies[cookieName]) {
    return "";
  }

  const cookieList = response.cookies[cookieName];
  if (!Array.isArray(cookieList) || !cookieList.length) {
    return "";
  }

  const cookieValue = String(cookieList[0]?.value || "").trim();
  return cookieValue ? `${cookieName}=${cookieValue}` : "";
}

function ensureCsrfToken() {
  const response = http.get(buildUrl(CSRF_PATH), {
    headers: { "User-Agent": USER_AGENT },
    tags: { endpoint: "auth_csrf" },
    redirects: 0,
  });
  const body = parseJsonSafe(response);
  const csrfToken = String(body?.csrfToken || "").trim();
  const csrfCookie = extractCookieFromResponse(response, "csrf-token");

  const ok = check(response, {
    "csrf status 200": (r) => r.status === 200,
    "csrf token presente": () => Boolean(csrfToken),
  });

  if (!ok) {
    contractFailures.add(1);
    return { token: "", cookie: "" };
  }

  return {
    token: csrfToken,
    cookie: csrfCookie,
  };
}

function parseJsonSafe(response) {
  try {
    return response.json();
  } catch (_) {
    return null;
  }
}

function debugFailure(step, response, body) {
  if (!DEBUG_LOG_FAILURES) {
    return;
  }
  const message =
    typeof body?.error?.message === "string"
      ? body.error.message
      : typeof body?.message === "string"
        ? body.message
        : "";
  const code =
    typeof body?.error?.code === "string"
      ? body.error.code
      : typeof body?.code === "string"
        ? body.code
        : "";
  console.error(
    `[${step}] status=${response.status} code=${code} message=${message}`,
  );
}

function authHeaders(token, companyId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
  };
  if (companyId) {
    headers["x-company-id"] = companyId;
  }
  return headers;
}

function login(user) {
  const csrf = ensureCsrfToken();
  const payload = { cpf: user.cpf, password: user.password };
  if (user.turnstileToken) {
    payload.turnstileToken = user.turnstileToken;
  }

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };
  if (csrf.token) {
    headers["x-csrf-token"] = csrf.token;
  }
  if (csrf.cookie) {
    headers.Cookie = csrf.cookie;
  }

  const response = http.post(buildUrl(LOGIN_PATH), JSON.stringify(payload), {
    headers,
    tags: { endpoint: "auth_login" },
  });
  loginDuration.add(response.timings.duration);

  const body = parseJsonSafe(response);
  const accessToken =
    typeof body?.accessToken === "string" ? body.accessToken : "";
  const responseCompanyId =
    typeof body?.user?.company_id === "string" ? body.user.company_id : "";

  const ok =
    check(
      response,
      {
        "login status ok": (r) => LOGIN_OK_STATUS.has(r.status),
        "login access token": () => Boolean(accessToken),
      },
      { endpoint: "auth_login" },
    ) && Boolean(accessToken);

  if (!ok) {
    debugFailure("auth_login", response, body);
    loginFailures.add(1);
  }

  return {
    ok,
    token: accessToken,
    companyId: user.companyId || responseCompanyId || "",
  };
}

function getUsers(token, companyId) {
  const response = http.get(buildUrl(USERS_PATH), {
    headers: authHeaders(token, companyId),
    tags: { endpoint: "users_list" },
  });
  getUsersDuration.add(response.timings.duration);
  const body = parseJsonSafe(response);
  const list = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body)
        ? body
        : [];

  const ok = check(response, {
    "users status 200": (r) => r.status === 200,
    "users has rows": () => list.length > 0,
  });
  if (!ok) {
    debugFailure("users_list", response, body);
    contractFailures.add(1);
  }
  return { ok, list };
}

function getAuthMe(token, companyId) {
  const response = http.get(buildUrl(AUTH_ME_PATH), {
    headers: authHeaders(token, companyId),
    tags: { endpoint: "auth_me" },
  });
  const body = parseJsonSafe(response);
  const userId =
    typeof body?.user?.id === "string"
      ? body.user.id
      : typeof body?.id === "string"
        ? body.id
        : "";
  const ok = check(response, {
    "auth/me status 200": (r) => r.status === 200,
    "auth/me has user id": () => Boolean(userId),
  });
  if (!ok) {
    contractFailures.add(1);
  }
  return { ok, userId, status: response.status };
}

function getOrCreateSite(token, companyId, preferredSiteId) {
  if (preferredSiteId) {
    return { ok: true, siteId: preferredSiteId };
  }

  if (FIXED_SITE_ID) {
    return { ok: true, siteId: FIXED_SITE_ID };
  }

  const listResponse = http.get(buildUrl(SITES_PATH), {
    headers: authHeaders(token, companyId),
    tags: { endpoint: "sites_list" },
  });
  getSitesDuration.add(listResponse.timings.duration);

  const listBody = parseJsonSafe(listResponse);
  const list = Array.isArray(listBody?.data)
    ? listBody.data
    : Array.isArray(listBody?.items)
      ? listBody.items
      : Array.isArray(listBody)
        ? listBody
        : [];

  if (listResponse.status !== 200) {
    debugFailure("sites_list", listResponse, listBody);
    contractFailures.add(1);
    return { ok: false, siteId: "" };
  }

  if (list.length > 0) {
    return { ok: true, siteId: String(list[0].id || "") };
  }

  if (!AUTO_CREATE_SITE) {
    contractFailures.add(1);
    return { ok: false, siteId: "" };
  }

  const createPayload = {
    nome: `${SITE_NAME_PREFIX} ${exec.vu.idInTest}`,
    local: "Carga",
    endereco: "N/A",
    cidade: "N/A",
    estado: "SP",
    status: true,
    company_id: companyId,
  };
  const createResponse = http.post(
    buildUrl("/sites"),
    JSON.stringify(createPayload),
    {
      headers: {
        ...authHeaders(token, companyId),
        "Content-Type": "application/json",
      },
      tags: { endpoint: "sites_create" },
    },
  );
  createSiteDuration.add(createResponse.timings.duration);

  const createBody = parseJsonSafe(createResponse);
  const siteId = String(createBody?.id || "");
  const ok = check(createResponse, {
    "site create 201/200": (r) => r.status === 201 || r.status === 200,
    "site id exists": () => Boolean(siteId),
  });
  if (!ok) {
    debugFailure("sites_create", createResponse, createBody);
    contractFailures.add(1);
  }
  return { ok, siteId };
}

function createDds(token, companyId, siteId, facilitatorId, participantIds) {
  const payload = {
    tema: `DDS carga ${exec.vu.idInTest}`,
    conteudo: "Teste automatizado de emissao DDS via k6",
    data: new Date().toISOString(),
    site_id: siteId,
    facilitador_id: facilitatorId,
    participants: participantIds,
  };

  const response = http.post(buildUrl(DDS_BASE_PATH), JSON.stringify(payload), {
    headers: {
      ...authHeaders(token, companyId),
      "Content-Type": "application/json",
    },
    tags: { endpoint: "dds_create" },
  });
  createDdsDuration.add(response.timings.duration);

  const body = parseJsonSafe(response);
  const ddsId = String(body?.id || "");

  const ok = check(response, {
    "dds create 201/200": (r) => r.status === 201 || r.status === 200,
    "dds id exists": () => Boolean(ddsId),
  });
  if (!ok) {
    debugFailure("dds_create", response, body);
    contractFailures.add(1);
  }
  return { ok, ddsId };
}

function publishDds(token, companyId, ddsId) {
  const response = http.patch(
    buildUrl(`${DDS_BASE_PATH}/${ddsId}/status`),
    JSON.stringify({ status: "publicado" }),
    {
      headers: {
        ...authHeaders(token, companyId),
        "Content-Type": "application/json",
      },
      tags: { endpoint: "dds_publish" },
    },
  );
  publishDdsDuration.add(response.timings.duration);
  const ok = check(response, {
    "dds publish status 200": (r) => r.status === 200,
  });
  if (!ok) {
    const body = parseJsonSafe(response);
    debugFailure("dds_publish", response, body);
    contractFailures.add(1);
  }
  return ok;
}

function attachSignatures(token, companyId, ddsId, participantIds) {
  const participant_signatures = participantIds.map((id) => ({
    user_id: id,
    signature_data:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xf9wAAAAASUVORK5CYII=",
    type: "draw",
  }));

  const response = http.put(
    buildUrl(`${DDS_BASE_PATH}/${ddsId}/signatures`),
    JSON.stringify({ participant_signatures, team_photos: [] }),
    {
      headers: {
        ...authHeaders(token, companyId),
        "Content-Type": "application/json",
      },
      tags: { endpoint: "dds_signatures" },
    },
  );
  signaturesDuration.add(response.timings.duration);

  const ok = check(response, {
    "dds signatures status 200": (r) => r.status === 200,
  });
  if (!ok) {
    const body = parseJsonSafe(response);
    debugFailure("dds_signatures", response, body);
    contractFailures.add(1);
  }
  return ok;
}

function uploadPdf(token, companyId, ddsId) {
  const form = {
    file: http.file(PDF_BYTES, "dds-k6.pdf", "application/pdf"),
  };
  const response = http.post(buildUrl(`${DDS_BASE_PATH}/${ddsId}/file`), form, {
    headers: authHeaders(token, companyId),
    tags: { endpoint: "dds_upload_pdf" },
  });
  uploadPdfDuration.add(response.timings.duration);

  if (response.status === 503) {
    const body = parseJsonSafe(response);
    if (body?.error?.code === "DOCUMENT_STORAGE_UNAVAILABLE") {
      storageUnavailable.add(1);
      uploadSuccessRate.add(false);
      return {
        ok: false,
        storageUnavailable: true,
      };
    }
  }

  const body = parseJsonSafe(response);
  const ok = check(response, {
    "dds upload status 200": (r) => r.status === 200,
    "dds upload keeps id": () => Boolean(body?.id),
  });
  uploadSuccessRate.add(ok);
  if (!ok) {
    debugFailure("dds_upload_pdf", response, body);
    contractFailures.add(1);
  }
  return { ok, storageUnavailable: false };
}

function getPdfAccess(token, companyId, ddsId) {
  const response = http.get(buildUrl(`${DDS_BASE_PATH}/${ddsId}/pdf`), {
    headers: authHeaders(token, companyId),
    tags: { endpoint: "dds_get_pdf_access" },
  });
  getPdfDuration.add(response.timings.duration);
  const ok = check(response, {
    "dds pdf access status 200": (r) => r.status === 200,
  });
  if (!ok) {
    const body = parseJsonSafe(response);
    debugFailure("dds_get_pdf_access", response, body);
    contractFailures.add(1);
  }
  return ok;
}

function buildMinimalPdf() {
  return `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 72 72 Td (DDS k6 PDF) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000010 00000 n
0000000060 00000 n
0000000117 00000 n
0000000200 00000 n
trailer
<< /Root 1 0 R /Size 5 >>
startxref
290
%%EOF`;
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).toLowerCase().trim();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

export default function () {
  const pickedUser = pickUser();
  if (!pickedUser) {
    throw new Error(
      "Defina K6_USERS_JSON ou K6_CPF/K6_PASSWORD para executar o fluxo DDS.",
    );
  }

  const start = Date.now();
  let flowOk = false;

  group("dds_emission_flow", () => {
    let activeUser = pickedUser;
    let logged = null;
    if (LOGIN_MODE === "per_vu" && cachedVuSession?.logged && cachedVuSession?.user) {
      logged = cachedVuSession.logged;
      activeUser = cachedVuSession.user;
    } else {
      logged = login(pickedUser);
      if (LOGIN_MODE === "per_vu" && logged?.ok) {
        cachedVuSession = {
          logged,
          user: pickedUser,
        };
        activeUser = pickedUser;
      }
    }
    if (!logged.ok) {
      flowSuccessRate.add(false);
      return;
    }

    let facilitatorId = "";
    let participantIds = [];
    const reloginIfSessionExpired = () => {
      if (LOGIN_MODE !== "per_vu") {
        return null;
      }
      const refreshed = login(activeUser);
      if (!refreshed.ok) {
        return null;
      }
      cachedVuSession = { logged: refreshed, user: activeUser };
      return refreshed;
    };

    if (PREFER_AUTH_ME) {
      let meResult = getAuthMe(logged.token, logged.companyId);
      if (!meResult.ok && (meResult.status === 401 || meResult.status === 403)) {
        const refreshed = reloginIfSessionExpired();
        if (refreshed) {
          logged = refreshed;
          meResult = getAuthMe(logged.token, logged.companyId);
        }
      }
      if (!meResult.ok || !meResult.userId) {
        flowSuccessRate.add(false);
        return;
      }
      facilitatorId = meResult.userId;
      participantIds = [meResult.userId];
    } else {
      const usersResult = getUsers(logged.token, logged.companyId);
      if (usersResult.ok && usersResult.list.length > 0) {
        facilitatorId = String(usersResult.list[0]?.id || "");
        participantIds = usersResult.list
          .slice(0, Math.max(2, Math.min(4, usersResult.list.length)))
          .map((entry) => String(entry.id || ""))
          .filter(Boolean);
      } else {
        let meResult = getAuthMe(logged.token, logged.companyId);
        if (!meResult.ok && (meResult.status === 401 || meResult.status === 403)) {
          const refreshed = reloginIfSessionExpired();
          if (refreshed) {
            logged = refreshed;
            meResult = getAuthMe(logged.token, logged.companyId);
          }
        }
        if (!meResult.ok || !meResult.userId) {
          flowSuccessRate.add(false);
          return;
        }
        facilitatorId = meResult.userId;
        participantIds = [meResult.userId];
      }
    }

    if (!facilitatorId || participantIds.length === 0) {
      contractFailures.add(1);
      flowSuccessRate.add(false);
      return;
    }

    const siteResult = getOrCreateSite(
      logged.token,
      logged.companyId,
      activeUser.siteId,
    );
    if (!siteResult.ok || !siteResult.siteId) {
      flowSuccessRate.add(false);
      return;
    }

    const ddsResult = createDds(
      logged.token,
      logged.companyId,
      siteResult.siteId,
      facilitatorId,
      participantIds,
    );
    if (!ddsResult.ok || !ddsResult.ddsId) {
      flowSuccessRate.add(false);
      return;
    }

    const publishOk = publishDds(logged.token, logged.companyId, ddsResult.ddsId);
    const signaturesOk = attachSignatures(
      logged.token,
      logged.companyId,
      ddsResult.ddsId,
      participantIds,
    );
    if (!publishOk || !signaturesOk) {
      flowSuccessRate.add(false);
      return;
    }

    const upload = uploadPdf(logged.token, logged.companyId, ddsResult.ddsId);
    if (!upload.ok) {
      if (upload.storageUnavailable && !REQUIRE_STORAGE) {
        flowOk = true;
      } else {
        flowOk = false;
      }
      flowSuccessRate.add(flowOk);
      return;
    }

    const pdfOk = getPdfAccess(logged.token, logged.companyId, ddsResult.ddsId);
    flowOk = pdfOk;
    flowSuccessRate.add(flowOk);
  });

  fullFlowDuration.add(Date.now() - start);
  const maxSleep = Math.max(SLEEP_MAX_SECONDS, SLEEP_MIN_SECONDS);
  sleep(Math.random() * (maxSleep - SLEEP_MIN_SECONDS) + SLEEP_MIN_SECONDS);
}
