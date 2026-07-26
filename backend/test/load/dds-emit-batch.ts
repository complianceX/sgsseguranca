import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';

type AuthSessionResponse = {
  accessToken: string;
  user: {
    id: string;
    company_id: string;
    site_id?: string | null;
  };
};

type MfaRequiredResponse = {
  mfaRequired: true;
  challengeToken: string;
  expiresIn: number;
  methods: string[];
};

type MfaEnrollRequiredResponse = {
  mfaEnrollRequired: true;
  challengeToken: string;
  expiresIn: number;
  otpAuthUrl: string;
  manualEntryKey: string;
  recoveryCodes: string[];
};

type AuthLoginResponse =
  AuthSessionResponse | MfaRequiredResponse | MfaEnrollRequiredResponse;

type CsrfSession = {
  token: string;
  cookieHeader: string;
};

type DdsUser = {
  cpf: string;
  password: string;
  companyId: string;
  turnstileToken?: string;
  siteId?: string;
};

type UserSession = {
  cpf: string;
  token: string;
  companyId: string;
  siteId: string;
  csrf: CsrfSession;
};

type EmitResult = {
  index: number;
  userCpf: string;
  ok: boolean;
  ddsId?: string;
  error?: string;
};

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const BASE_URL = String(
  process.env.BASE_URL || 'http://localhost:3001',
).replace(/\/+$/, '');

const USERS_FILE = String(
  process.env.DDS_USERS_FILE ||
    process.env.DDS_VALID_USERS_OUTPUT_FILE ||
    'test/load/fixtures/dds-users.publish.valid.local.generated.json',
);

const TOTAL_DDS = clampInt(process.env.DDS_BATCH_TOTAL, 1000, 1, 5000);
const CONCURRENCY = clampInt(process.env.DDS_BATCH_CONCURRENCY, 15, 1, 50);
const _DDS_PER_USER_HINT = clampInt(process.env.DDS_PER_USER, 0, 0, 500);

const MFA_CACHE_PATH = path.resolve(
  __dirname,
  '../../../temp/dds-batch-mfa-cache.json',
);

type MfaCache = {
  secret?: string;
  recoveryCode?: string;
  savedAt?: string;
};

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(Math.floor(n), max));
}

function readMfaCache(): MfaCache | null {
  try {
    if (!fs.existsSync(MFA_CACHE_PATH)) return null;
    const raw = fs.readFileSync(MFA_CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as MfaCache;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeMfaCache(cache: MfaCache): void {
  try {
    fs.mkdirSync(path.dirname(MFA_CACHE_PATH), { recursive: true });
    fs.writeFileSync(
      MFA_CACHE_PATH,
      JSON.stringify(
        {
          secret: cache.secret,
          recoveryCode: cache.recoveryCode,
          savedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf-8',
    );
  } catch {
    // no-op — non-critical cache write
  }
}

const mfaCache = readMfaCache();
const MFA_SECRET = String(
  process.env.DDS_BATCH_MFA_SECRET || mfaCache?.secret || '',
).trim();
const MFA_CODE = String(process.env.DDS_BATCH_MFA_CODE || '').trim();
const MFA_RECOVERY_CODE = String(
  process.env.DDS_BATCH_MFA_RECOVERY_CODE || mfaCache?.recoveryCode || '',
).trim();

function extractCookieValue(
  setCookie: string,
  cookieName: string,
): string | null {
  const pattern = new RegExp(`${cookieName}=([^;]+)`);
  const match = setCookie.match(pattern);
  return match ? match[1] : null;
}

function getSetCookieHeaders(response: Response): string[] {
  const candidate = response.headers as unknown as {
    getSetCookie?: () => string[];
  };
  if (typeof candidate.getSetCookie === 'function') {
    return candidate.getSetCookie();
  }
  const raw = response.headers.get('set-cookie');
  return raw ? [raw] : [];
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(input: string): Buffer {
  const normalized = String(input || '')
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, '');
  if (!normalized) throw new Error('Segredo TOTP inválido.');
  let bits = '';
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Segredo TOTP inválido.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(params: {
  secret: string;
  counter: number;
  digits?: number;
}): string {
  const digits = params.digits ?? 6;
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(params.counter));
  const key = decodeBase32(params.secret);
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

function generateTotpCode(secret: string, now = Date.now()): string {
  const periodSeconds = 30;
  const counter = Math.floor(Math.floor(now / 1000) / periodSeconds);
  return hotp({ secret, counter, digits: 6 });
}

async function fetchCsrf(): Promise<CsrfSession> {
  const url = `${BASE_URL}/auth/csrf`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': 'dds-emit-batch/1.0' },
  });
  const raw = await response.text();
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(
      `Falha ao obter CSRF (status=${response.status}): ${raw.slice(0, 200)}`,
    );
  }
  const body = raw ? (JSON.parse(raw) as { csrfToken?: string }) : {};
  const hmacToken = typeof body.csrfToken === 'string' ? body.csrfToken : '';

  const setCookies = getSetCookieHeaders(response);
  const rawToken =
    setCookies
      .map((value) => extractCookieValue(value, 'csrf-token'))
      .filter(Boolean)
      .slice(-1)[0] || null;

  const headerToken = hmacToken || rawToken || '';
  const cookieValue = rawToken || hmacToken || '';

  if (!headerToken || !cookieValue) {
    throw new Error('CSRF não retornou token válido (cookie/header).');
  }

  return {
    token: headerToken,
    cookieHeader: `csrf-token=${cookieValue}`,
  };
}

async function requestJson<T>(
  method: 'GET' | 'POST' | 'PATCH',
  endpoint: string,
  opts: {
    token?: string;
    companyId?: string;
    body?: unknown;
    csrf?: CsrfSession;
  } = {},
): Promise<{ status: number; body: T | null; raw: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'dds-emit-batch/1.0',
  };

  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.companyId) headers['x-company-id'] = opts.companyId;

  const isMutable = method !== 'GET';
  if (isMutable) {
    if (!opts.csrf)
      throw new Error('Sessão CSRF obrigatória para request mutável.');
    headers.Cookie = opts.csrf.cookieHeader;
    headers['x-csrf-token'] = opts.csrf.token;
  }

  if (opts.body !== undefined) headers['content-type'] = 'application/json';

  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const res = await fetch(url, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const raw = await res.text();
  let parsed: T | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // no-op — invalid JSON treated as null body
  }
  return { status: res.status, body: parsed, raw };
}

async function _requestMultipart(
  endpoint: string,
  opts: {
    token: string;
    companyId: string;
    filename: string;
    bytes: Uint8Array;
    csrf: CsrfSession;
  },
): Promise<{ status: number; raw: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'dds-emit-batch/1.0',
    Authorization: `Bearer ${opts.token}`,
    'x-company-id': opts.companyId,
    Cookie: opts.csrf.cookieHeader,
    'x-csrf-token': opts.csrf.token,
  };

  const form = new FormData();
  const buffer = Buffer.from(opts.bytes);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  form.append(
    'file',
    new Blob([arrayBuffer], { type: 'application/pdf' }),
    opts.filename,
  );

  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const res = await fetch(url, { method: 'POST', headers, body: form });
  const raw = await res.text();
  return { status: res.status, raw };
}

function _buildMinimalPdfBytes(tag: string): Uint8Array {
  const padding = 'x'.repeat(256);
  const content = [
    '%PDF-1.4',
    `% DDS-BATCH ${tag}`,
    `% padding ${padding}`,
    '1 0 obj',
    '<<>>',
    'endobj',
    'trailer',
    '<<>>',
    '%%EOF',
    '',
  ].join('\n');
  return new TextEncoder().encode(content);
}

async function resolveFirstSiteId(
  token: string,
  companyId: string,
): Promise<string> {
  const res = await requestJson<{ data?: Array<{ id: string }> }>(
    'GET',
    '/sites?page=1&limit=1',
    { token, companyId },
  );
  if (res.status !== 200 || !res.body?.data?.[0]?.id) {
    throw new Error(
      `Falha ao resolver site (status=${res.status}): ${res.raw.slice(0, 200)}`,
    );
  }
  return String(res.body.data[0].id);
}

function isAuthSessionResponse(value: unknown): value is AuthSessionResponse {
  const record = value as Record<string, unknown> | null;
  return (
    !!record &&
    typeof record === 'object' &&
    typeof record.accessToken === 'string' &&
    !!record.user &&
    typeof record.user === 'object'
  );
}

function isMfaEnrollRequired(
  value: unknown,
): value is MfaEnrollRequiredResponse {
  const record = value as Record<string, unknown> | null;
  return (
    !!record && typeof record === 'object' && record.mfaEnrollRequired === true
  );
}

function isMfaRequired(value: unknown): value is MfaRequiredResponse {
  const record = value as Record<string, unknown> | null;
  return !!record && typeof record === 'object' && record.mfaRequired === true;
}

async function loginWithMfaForUser(
  cpf: string,
  password: string,
  initialCsrf: CsrfSession,
): Promise<AuthSessionResponse> {
  const login = await requestJson<AuthLoginResponse>('POST', '/auth/login', {
    csrf: initialCsrf,
    body: { cpf, password },
  });

  if (login.status !== 200 && login.status !== 201) {
    throw new Error(
      `Falha no login (status=${login.status}): ${login.raw.slice(0, 200)}`,
    );
  }

  if (isAuthSessionResponse(login.body)) return login.body;

  if (isMfaEnrollRequired(login.body)) {
    const secret = String(login.body.manualEntryKey || '').trim();
    if (!secret)
      throw new Error('MFA bootstrap retornou manualEntryKey vazio.');
    const firstRecovery =
      Array.isArray(login.body.recoveryCodes) &&
      typeof login.body.recoveryCodes[0] === 'string'
        ? login.body.recoveryCodes[0]
        : undefined;
    writeMfaCache({ secret, recoveryCode: firstRecovery });
    const code = generateTotpCode(secret);
    const activated = await requestJson<AuthSessionResponse>(
      'POST',
      '/auth/login/mfa/bootstrap/activate',
      {
        csrf: initialCsrf,
        body: { challengeToken: login.body.challengeToken, code },
      },
    );
    if (activated.status !== 200 && activated.status !== 201) {
      throw new Error(
        `Falha ao ativar MFA (status=${activated.status}): ${activated.raw.slice(0, 200)}`,
      );
    }
    if (!isAuthSessionResponse(activated.body)) {
      throw new Error(
        `Ativação MFA retornou payload inesperado: ${activated.raw.slice(0, 200)}`,
      );
    }
    return activated.body;
  }

  if (isMfaRequired(login.body)) {
    const code =
      MFA_CODE ||
      MFA_RECOVERY_CODE ||
      (MFA_SECRET ? generateTotpCode(MFA_SECRET) : '');
    if (!code) {
      throw new Error(
        `MFA requerido. Configure DDS_BATCH_MFA_* ou defina segredo. Métodos: ${(login.body.methods || []).join(', ')}`,
      );
    }
    const verified = await requestJson<AuthSessionResponse>(
      'POST',
      '/auth/login/mfa/verify',
      {
        csrf: initialCsrf,
        body: { challengeToken: login.body.challengeToken, code },
      },
    );
    if (verified.status !== 200 && verified.status !== 201) {
      throw new Error(
        `Falha ao verificar MFA (status=${verified.status}): ${verified.raw.slice(0, 200)}`,
      );
    }
    if (!isAuthSessionResponse(verified.body)) {
      throw new Error(
        `Verificação MFA retornou payload inesperado: ${verified.raw.slice(0, 200)}`,
      );
    }
    return verified.body;
  }

  throw new Error(
    `Login retornou payload sem token: ${login.raw.slice(0, 200)}`,
  );
}

async function loginUser(cred: DdsUser): Promise<UserSession> {
  const csrf = await fetchCsrf();
  const session = await loginWithMfaForUser(cred.cpf, cred.password, csrf);

  const token = session.accessToken;
  const companyId = session.user?.company_id;
  const userId = session.user?.id;
  if (!token || !companyId || !userId) {
    throw new Error('Login retornou payload incompleto.');
  }

  let siteId = cred.siteId;
  if (!siteId) {
    siteId = await resolveFirstSiteId(token, companyId);
  }

  // Fresh csrf for subsequent calls (reuse works but fresh is safer for batch)
  const freshCsrf = await fetchCsrf();

  return {
    cpf: cred.cpf,
    token,
    companyId,
    siteId,
    csrf: freshCsrf,
  };
}

const userSessions = new Map<string, UserSession>();

async function _getUserSession(cred: DdsUser): Promise<UserSession> {
  if (userSessions.has(cred.cpf)) {
    return userSessions.get(cred.cpf)!;
  }
  const sess = await loginUser(cred);
  userSessions.set(cred.cpf, sess);
  return sess;
}

async function _createAndPublish(
  session: UserSession,
  index: number,
): Promise<EmitResult> {
  const tema = `DDS batch carga ${index + 1}`;
  const conteudo = `Emitido via dds-emit-batch para teste de carga. Índice ${index + 1}.`;

  const create = await requestJson<{ id?: string }>('POST', '/dds', {
    token: session.token,
    companyId: session.companyId,
    csrf: session.csrf,
    body: {
      tema,
      conteudo,
      data: new Date().toISOString().slice(0, 10),
      site_id: session.siteId,
      facilitador_id: '', // will be replaced by server? No, we need to send a real one.
      // We don't have the user id here easily. Use a workaround: many systems accept the logged user implicitly,
      // but from DTO we need facilitador_id.
      // Since we logged in, we can fetch the user id once.
      // To keep simple, we will fetch /auth/me once per user and cache the id.
    },
  });

  // We need the logged user id for facilitador/participants.
  // Fetch once and attach to session lazily.
  // For simplicity in this script, after login we will also resolve the user id.
  // (We will extend session on the fly)

  if (create.status !== 201 || !create.body?.id) {
    return {
      index,
      userCpf: session.cpf,
      ok: false,
      error: `create status=${create.status} ${create.raw.slice(0, 160)}`,
    };
  }

  const ddsId = String(create.body.id);

  const publish = await requestJson('PATCH', `/dds/${ddsId}/status`, {
    token: session.token,
    companyId: session.companyId,
    csrf: session.csrf,
    body: { status: 'publicado' },
  });

  if (publish.status !== 200) {
    return {
      index,
      userCpf: session.cpf,
      ok: false,
      ddsId,
      error: `publish status=${publish.status} ${publish.raw.slice(0, 160)}`,
    };
  }

  return { index, userCpf: session.cpf, ok: true, ddsId };
}

// We need the user id for facilitador. Let's extend the login to also resolve user id.
async function loginUserWithId(
  cred: DdsUser,
): Promise<UserSession & { userId: string }> {
  const base = await loginUser(cred);

  // Resolve user id via /auth/me
  const me = await requestJson<{ id?: string; user?: { id?: string } }>(
    'GET',
    '/auth/me',
    {
      token: base.token,
      companyId: base.companyId,
    },
  );

  const userId = me.body?.id || me.body?.user?.id;
  if (!userId) {
    throw new Error('Não foi possível obter user id após login.');
  }

  return { ...base, userId };
}

const sessionsWithId = new Map<string, UserSession & { userId: string }>();

async function getUserSessionWithId(
  cred: DdsUser,
): Promise<UserSession & { userId: string }> {
  if (sessionsWithId.has(cred.cpf)) return sessionsWithId.get(cred.cpf)!;
  const sess = await loginUserWithId(cred);
  sessionsWithId.set(cred.cpf, sess);
  return sess;
}

async function createAndPublishWithId(
  session: UserSession & { userId: string },
  index: number,
): Promise<EmitResult> {
  const tema = `DDS batch carga ${index + 1}`;
  const conteudo = `Emitido via dds-emit-batch para teste de carga e múltiplos usuários. Índice ${index + 1}.`;

  const create = await requestJson<{ id?: string }>('POST', '/dds', {
    token: session.token,
    companyId: session.companyId,
    csrf: session.csrf,
    body: {
      tema,
      conteudo,
      data: new Date().toISOString().slice(0, 10),
      site_id: session.siteId,
      facilitador_id: session.userId,
      participants: [session.userId],
    },
  });

  if (create.status !== 201 || !create.body?.id) {
    return {
      index,
      userCpf: session.cpf,
      ok: false,
      error: `create status=${create.status} ${create.raw.slice(0, 160)}`,
    };
  }

  const ddsId = String(create.body.id);

  const publish = await requestJson('PATCH', `/dds/${ddsId}/status`, {
    token: session.token,
    companyId: session.companyId,
    csrf: session.csrf,
    body: { status: 'publicado' },
  });

  if (publish.status !== 200) {
    return {
      index,
      userCpf: session.cpf,
      ok: false,
      ddsId,
      error: `publish status=${publish.status} ${publish.raw.slice(0, 160)}`,
    };
  }

  return { index, userCpf: session.cpf, ok: true, ddsId };
}

type RawDdsUser = {
  cpf?: string;
  password?: string;
  companyId?: string;
  company_id?: string;
  siteId?: string;
};

async function main() {
  if (!fs.existsSync(USERS_FILE)) {
    throw new Error(`Arquivo de usuários não encontrado: ${USERS_FILE}`);
  }

  let rawUsers: RawDdsUser[] = [];
  try {
    rawUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) as RawDdsUser[];
  } catch {
    // no-op — will throw below if empty
  }

  if (!Array.isArray(rawUsers) || rawUsers.length < 5) {
    // Fallback to larger login pool and resolve sites inside
    const fallback = 'test/load/fixtures/login-users.120.json';
    if (fs.existsSync(fallback)) {
      console.log(
        `Pool pequeno no ${USERS_FILE}, usando fallback ${fallback} (irá resolver sites).`,
      );
      rawUsers = JSON.parse(fs.readFileSync(fallback, 'utf8')) as RawDdsUser[];
    }
  }

  if (!Array.isArray(rawUsers) || rawUsers.length === 0) {
    throw new Error('Nenhum usuário carregado.');
  }

  let users = rawUsers
    .map((u) => ({
      cpf: (u.cpf ?? '').replace(/\D/g, ''),
      password: u.password ?? '',
      companyId: (u.companyId ?? u.company_id ?? '').trim(),
      siteId: u.siteId ? u.siteId.trim() : undefined,
    }))
    .filter((u) => u.cpf.length === 11 && u.password && u.companyId);

  if (users.length === 0) {
    throw new Error('Nenhum usuário válido.');
  }

  // Use up to 15 users for the requested "15 usuários em paralelo"
  if (users.length > 15) users = users.slice(0, 15);

  console.log(
    `Iniciando emissão em lote de ${TOTAL_DDS} DDSs com ${users.length} usuários em paralelo (concorrência ${CONCURRENCY}).`,
  );
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log(`Users file: ${USERS_FILE}`);

  const start = Date.now();

  // Pre-warm a few sessions (optional but helps)
  for (let i = 0; i < Math.min(3, users.length); i++) {
    try {
      await getUserSessionWithId(users[i]);
    } catch {
      console.warn(`Aviso: login inicial falhou para ${users[i].cpf}`);
    }
  }

  const results: EmitResult[] = [];

  // Simple concurrency pool
  let nextIndex = 0;
  const workers: Promise<void>[] = [];

  async function worker() {
    while (nextIndex < TOTAL_DDS) {
      const idx = nextIndex++;
      const user = users[idx % users.length];
      try {
        const sess = await getUserSessionWithId(user);
        const res = await createAndPublishWithId(sess, idx);
        results[idx] = res;
      } catch (err: unknown) {
        results[idx] = {
          index: idx,
          userCpf: user.cpf,
          ok: false,
          error: String(err instanceof Error ? err.message : err).slice(0, 200),
        };
      }
    }
  }

  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  const elapsed = Date.now() - start;

  const ok = results.filter((r) => r && r.ok);
  const failed = results.filter((r) => r && !r.ok);

  console.log('\n===== RESULTADO DDS BATCH =====');
  console.log(`Total desejado: ${TOTAL_DDS}`);
  console.log(`Executados: ${results.length}`);
  console.log(`Sucesso: ${ok.length}`);
  console.log(`Falhas: ${failed.length}`);
  console.log(`Tempo total: ${elapsed}ms`);
  console.log(`Usuários utilizados: ${users.length}`);
  console.log(`Concorrência: ${CONCURRENCY}`);

  if (failed.length > 0) {
    console.log('\n--- Resumo de falhas (primeiras 15) ---');
    const byReason = new Map<string, number>();
    for (const f of failed.slice(0, 15)) {
      const reason = (f.error || 'unknown').slice(0, 120);
      byReason.set(reason, (byReason.get(reason) || 0) + 1);
      console.error(`  #${f.index + 1} [${f.userCpf}] ${f.error}`);
    }
    console.log('\nContagem por motivo (amostra):');
    for (const [r, c] of byReason.entries()) {
      console.log(`  ${c}x - ${r}`);
    }
    console.log('\n✗ Houve falhas durante a emissão em lote.');
    process.exit(1);
  }

  console.log(
    `\n✓ OK: ${ok.length} DDSs emitidos (create + publicado) com ${users.length} usuários em ${elapsed}ms`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✗ FALHA GERAL: ${message}`);
  process.exit(1);
});
