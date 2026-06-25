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
  | AuthSessionResponse
  | MfaRequiredResponse
  | MfaEnrollRequiredResponse;

type CsrfSession = {
  token: string;
  cookieHeader: string;
};

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const BASE_URL = String(
  process.env.BASE_URL || 'http://localhost:3001',
).replace(/\/+$/, '');

const CPF = String(
  process.env.DDS_TEST_CPF ||
    process.env.DID_TEST_CPF ||
    process.env.DEV_ADMIN_CPF ||
    '',
).replace(/\D/g, '');
const PASSWORD = String(
  process.env.DDS_TEST_PASSWORD ||
    process.env.DID_TEST_PASSWORD ||
    process.env.DEV_ADMIN_PASSWORD ||
    '',
);

const MFA_CACHE_PATH = path.resolve(
  __dirname,
  '../../../temp/dds-mfa-cache.json',
);

const EMIT_COUNT = clampInt(
  process.env.DDS_EMIT_COUNT,
  50,
  1,
  200,
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
    // best-effort
  }
}

const mfaCache = readMfaCache();
const MFA_SECRET = String(
  process.env.DDS_TEST_MFA_SECRET || mfaCache?.secret || '',
).trim();
const MFA_CODE = String(process.env.DDS_TEST_MFA_CODE || '').trim();
const MFA_RECOVERY_CODE = String(
  process.env.DDS_TEST_MFA_RECOVERY_CODE || mfaCache?.recoveryCode || '',
).trim();

function assertEnv(): void {
  if (!CPF || CPF.length !== 11) {
    throw new Error(
      'CPF inválido para teste DDS. Configure DDS_TEST_CPF (ou DID_TEST_CPF / DEV_ADMIN_CPF) com 11 dígitos.',
    );
  }
  if (!PASSWORD) {
    throw new Error(
      'Senha não definida para teste DDS. Configure DDS_TEST_PASSWORD (ou DID_TEST_PASSWORD / DEV_ADMIN_PASSWORD).',
    );
  }
}

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
  if (!normalized) {
    throw new Error('Segredo TOTP inválido.');
  }

  let bits = '';
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Segredo TOTP inválido.');
    }
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
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
    headers: {
      Accept: 'application/json',
      'User-Agent': 'dds-emit-50/1.0',
    },
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

  // When CSRF_TOKEN_SECRET is set (prod-like):
  //   - Cookie receives RAW token
  //   - Body.csrfToken receives HMAC(secret, RAW)
  // Client must send:
  //   Cookie: csrf-token=RAW
  //   x-csrf-token: HMAC
  const headerToken = hmacToken || rawToken || '';
  const cookieValue = rawToken || hmacToken || '';

  if (!headerToken || !cookieValue) {
    throw new Error('CSRF não retornou token válido (cookie/header).');
  }

  return {
    token: headerToken, // for x-csrf-token (HMAC or raw)
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
    'User-Agent': 'dds-emit-50/1.0',
  };

  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }

  if (opts.companyId) {
    headers['x-company-id'] = opts.companyId;
  }

  const isMutable = method !== 'GET';
  if (isMutable) {
    if (!opts.csrf) {
      throw new Error('Sessão CSRF obrigatória para request mutável.');
    }
    headers.Cookie = opts.csrf.cookieHeader;
    headers['x-csrf-token'] = opts.csrf.token;
  }

  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

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
    parsed = null;
  }
  return { status: res.status, body: parsed, raw };
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

async function loginWithMfa(csrf: CsrfSession): Promise<AuthSessionResponse> {
  const login = await requestJson<AuthLoginResponse>('POST', '/auth/login', {
    csrf,
    body: { cpf: CPF, password: PASSWORD },
  });

  if (login.status !== 200 && login.status !== 201) {
    throw new Error(
      `Falha no login (status=${login.status}): ${login.raw.slice(0, 200)}`,
    );
  }

  if (isAuthSessionResponse(login.body)) {
    return login.body;
  }

  if (isMfaEnrollRequired(login.body)) {
    const secret = String(login.body.manualEntryKey || '').trim();
    if (!secret) {
      throw new Error('MFA bootstrap retornou manualEntryKey vazio.');
    }

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
        csrf,
        body: { challengeToken: login.body.challengeToken, code },
      },
    );

    if (activated.status !== 200 && activated.status !== 201) {
      throw new Error(
        `Falha ao ativar MFA bootstrap (status=${activated.status}): ${activated.raw.slice(
          0,
          200,
        )}`,
      );
    }

    if (!isAuthSessionResponse(activated.body)) {
      throw new Error(
        `Ativação MFA bootstrap retornou payload inesperado: ${activated.raw.slice(0, 200)}`,
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
        `MFA requerido para login. Configure DDS_TEST_MFA_CODE ou DDS_TEST_MFA_RECOVERY_CODE; alternativamente defina DDS_TEST_MFA_SECRET (base32) para gerar TOTP automaticamente. Métodos aceitos: ${(
          login.body.methods || []
        ).join(', ')}`,
      );
    }

    const verified = await requestJson<AuthSessionResponse>(
      'POST',
      '/auth/login/mfa/verify',
      {
        csrf,
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
    `Login retornou payload sem token/company/user válidos: ${login.raw.slice(
      0,
      200,
    )}`,
  );
}

async function requestMultipart(
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
    'User-Agent': 'dds-emit-50/1.0',
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

function buildMinimalPdfBytes(tag: string): Uint8Array {
  const padding = 'x'.repeat(256);
  const content = [
    '%PDF-1.4',
    `% DDS ${tag}`,
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
  const res = await requestJson<{
    data?: Array<{ id: string }>;
  }>('GET', '/sites?page=1&limit=1', { token, companyId });

  if (res.status !== 200 || !res.body?.data?.[0]?.id) {
    throw new Error(
      `Falha ao resolver site (status=${res.status}): ${res.raw.slice(0, 200)}`,
    );
  }

  return String(res.body.data[0].id);
}

type EmitResult = {
  index: number;
  ok: boolean;
  ddsId?: string;
  error?: string;
};

async function main(): Promise<void> {
  assertEnv();

  const startedAt = Date.now();
  console.log(
    `Iniciando emissão de ${EMIT_COUNT} DDSs... BASE_URL=${BASE_URL}`,
  );

  const csrf = await fetchCsrf();
  const session = await loginWithMfa(csrf);

  const token = session.accessToken;
  const companyId = session.user?.company_id;
  const userId = session.user?.id;
  if (!token || !companyId || !userId) {
    throw new Error(
      'Login retornou payload sem token/company/user válidos (session parcial).',
    );
  }

  let siteId = session.user?.site_id || null;
  if (!siteId) {
    siteId = await resolveFirstSiteId(token, companyId);
  }

  // Also try to get authoritative site from /auth/me if available (some users have primary site)
  try {
    const meRes = await requestJson<{ site_id?: string; user?: { site_id?: string } }>(
      'GET',
      '/auth/me',
      { token, companyId },
    );
    const meSite =
      meRes.body?.site_id ||
      (meRes.body?.user as any)?.site_id ||
      null;
    if (meSite) {
      siteId = meSite;
    }
  } catch {
    // fallback to the resolved one
  }

  const baseDate = new Date();
  const isoDate = baseDate.toISOString().slice(0, 10); // YYYY-MM-DD

  const createOne = async (index: number): Promise<EmitResult> => {
    const tema = `DDS carga teste ${index + 1}`;
    const conteudo = `DDS emitido automaticamente via dds-emit-50 para detecção de erros. Índice ${index + 1}.`;

    const create = await requestJson<{ id?: string }>('POST', '/dds', {
      token,
      companyId,
      csrf,
      body: {
        tema,
        conteudo,
        data: isoDate,
        site_id: siteId,
        facilitador_id: userId,
        participants: [userId],
      },
    });

    if (create.status !== 201 || !create.body?.id) {
      return {
        index,
        ok: false,
        error: `create status=${create.status} body=${create.raw.slice(0, 180)}`,
      };
    }

    const ddsId = String(create.body.id);

    // Publicar (rascunho -> publicado). Isso é a emissão principal.
    const publish = await requestJson('PATCH', `/dds/${ddsId}/status`, {
      token,
      companyId,
      csrf,
      body: { status: 'publicado' },
    });

    if (publish.status !== 200) {
      return {
        index,
        ok: false,
        ddsId,
        error: `publish status=${publish.status} ${publish.raw.slice(0, 160)}`,
      };
    }

    // PDF attach agora requer AUDITADO + approval flow aprovado.
    // Para teste básico de emissão (create+publicar) pulamos ou tentamos (pode falhar por regra de negócio).
    // Mantemos sucesso se create + publish ok.
    return { index, ok: true, ddsId };
  };

  // Executa sequencialmente para evitar overload/timeout em DB/Redis durante o teste.
  // (Paralelo alto causava "timeout exceeded when trying to connect")
  const results: EmitResult[] = [];
  for (let i = 0; i < EMIT_COUNT; i++) {
    results.push(await createOne(i));
  }

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  const elapsedMs = Date.now() - startedAt;

  console.log('\n===== RESULTADO DDS EMIT 50 =====');
  console.log(`Total: ${results.length} | Sucesso: ${ok.length} | Falhas: ${failed.length}`);
  console.log(`Tempo: ${elapsedMs}ms`);

  if (failed.length > 0) {
    console.log('\n--- Falhas ---');
    for (const f of failed) {
      console.error(
        `  #${f.index + 1} ${f.ddsId ? `(id=${f.ddsId})` : ''}: ${f.error}`,
      );
    }
    console.log('\n✗ Alguns DDSs falharam. Verifique logs do backend.');
    process.exit(1);
  }

  console.log(
    `\n✓ OK: emitidos e publicados ${ok.length} DDSs (create + publicado) em ${elapsedMs}ms`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✗ FALHA GERAL: ${message}`);
  process.exit(1);
});
