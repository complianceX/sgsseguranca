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

type ArrRecord = {
  id: string;
  status: 'rascunho' | 'analisada' | 'tratada' | 'arquivada';
  document_code?: string | null;
  final_pdf_hash_sha256?: string | null;
  pdf_generated_at?: string | null;
  emitted_by_user_id?: string | null;
  pdf_file_key?: string | null;
};

type ArrPdfAccess = {
  hasFinalPdf: boolean;
  availability: 'ready' | 'registered_without_signed_url' | 'not_emitted';
  message: string;
  url: string | null;
  fileKey: string | null;
  originalName: string | null;
};

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const BASE_URL = String(
  process.env.BASE_URL || 'http://localhost:3011',
).replace(/\/+$/, '');
const CPF = String(
  process.env.ARR_TEST_CPF ||
    process.env.DID_TEST_CPF ||
    process.env.DEV_ADMIN_CPF ||
    '',
).replace(/\D/g, '');
const PASSWORD = String(
  process.env.ARR_TEST_PASSWORD ||
    process.env.DID_TEST_PASSWORD ||
    process.env.DEV_ADMIN_PASSWORD ||
    '',
);
const MFA_CACHE_PATH = path.resolve(
  __dirname,
  '../../../temp/arr-mfa-cache.json',
);
const BATCH_SIZE = Number(process.env.ARR_LOAD_COUNT || 20);

type MfaCache = { secret?: string; recoveryCode?: string; savedAt?: string };

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
    // best effort.
  }
}

const mfaCache = readMfaCache();
const MFA_SECRET = String(
  process.env.ARR_TEST_MFA_SECRET || mfaCache?.secret || '',
).trim();
const MFA_CODE = String(process.env.ARR_TEST_MFA_CODE || '').trim();
const MFA_RECOVERY_CODE = String(
  process.env.ARR_TEST_MFA_RECOVERY_CODE || mfaCache?.recoveryCode || '',
).trim();

function assertEnv(): void {
  if (!CPF || CPF.length !== 11) {
    throw new Error(
      'CPF inválido para teste ARR. Configure ARR_TEST_CPF (ou DID_TEST_CPF/DEV_ADMIN_CPF).',
    );
  }
  if (!PASSWORD) {
    throw new Error(
      'Senha não definida para teste ARR. Configure ARR_TEST_PASSWORD (ou DID_TEST_PASSWORD/DEV_ADMIN_PASSWORD).',
    );
  }
  if (!Number.isFinite(BATCH_SIZE) || BATCH_SIZE <= 0) {
    throw new Error('ARR_LOAD_COUNT inválido; informe um inteiro positivo.');
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
  if (typeof candidate.getSetCookie === 'function')
    return candidate.getSetCookie();
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
  const counter = Math.floor(Math.floor(now / 1000) / 30);
  return hotp({ secret, counter, digits: 6 });
}

async function fetchCsrf(): Promise<CsrfSession> {
  const response = await fetch(`${BASE_URL}/auth/csrf`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'arr-emit-batch/1.0',
    },
  });
  const raw = await response.text();
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(
      `Falha ao obter CSRF (${response.status}): ${raw.slice(0, 200)}`,
    );
  }

  const body = raw ? (JSON.parse(raw) as { csrfToken?: string }) : {};
  const csrfToken = typeof body.csrfToken === 'string' ? body.csrfToken : '';
  const setCookies = getSetCookieHeaders(response);
  const cookieValueFromHeader =
    setCookies
      .map((value) => extractCookieValue(value, 'csrf-token'))
      .filter(Boolean)
      .slice(-1)[0] || null;

  const token = csrfToken || cookieValueFromHeader || '';
  if (!token) throw new Error('CSRF não retornou token válido.');
  return { token, cookieHeader: `csrf-token=${token}` };
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
    'User-Agent': 'arr-emit-batch/1.0',
  };

  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.companyId) headers['x-company-id'] = opts.companyId;

  if (method !== 'GET') {
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
      `Falha no login (${login.status}): ${login.raw.slice(0, 200)}`,
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
        csrf,
        body: { challengeToken: login.body.challengeToken, code },
      },
    );
    if (activated.status !== 200 && activated.status !== 201) {
      throw new Error(
        `Falha ao ativar MFA bootstrap (${activated.status}): ${activated.raw.slice(0, 200)}`,
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
        `MFA requerido para login ARR. Configure ARR_TEST_MFA_CODE ou ARR_TEST_MFA_SECRET. Métodos: ${(login.body.methods || []).join(', ')}`,
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
        `Falha ao verificar MFA (${verified.status}): ${verified.raw.slice(0, 200)}`,
      );
    }
    if (!isAuthSessionResponse(verified.body)) {
      throw new Error(
        `Verificação MFA inválida: ${verified.raw.slice(0, 200)}`,
      );
    }
    return verified.body;
  }

  throw new Error(
    `Login retornou payload inválido: ${login.raw.slice(0, 200)}`,
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
    'User-Agent': 'arr-emit-batch/1.0',
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
  const padding = 'ARR'.repeat(120);
  const content = [
    '%PDF-1.4',
    `% ARR ${tag}`,
    `% ${padding}`,
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
      `Falha ao resolver site (${res.status}): ${res.raw.slice(0, 200)}`,
    );
  }
  return String(res.body.data[0].id);
}

async function createEmitAndValidateArr(
  index: number,
  opts: {
    token: string;
    companyId: string;
    userId: string;
    siteId: string;
    csrf: CsrfSession;
    isoDate: string;
  },
): Promise<{
  arrId: string;
  status: string;
  documentCode: string | null;
  hash: string | null;
  emittedBy: string | null;
  pdfAvailability: string;
  pdfUrl: string | null;
}> {
  const create = await requestJson<{ id?: string }>('POST', '/arrs', {
    token: opts.token,
    companyId: opts.companyId,
    csrf: opts.csrf,
    body: {
      titulo: `ARR carga ${index + 1}`,
      descricao:
        'Registro automatizado para validação governada do módulo ARR.',
      data: opts.isoDate,
      turno: 'manha',
      frente_trabalho: 'Área operacional A',
      atividade_principal: 'Movimentação e içamento de materiais',
      condicao_observada:
        'Área com circulação simultânea de equipe e equipamento.',
      risco_identificado: 'Risco de queda de material e colisão operacional.',
      nivel_risco: 'alto',
      probabilidade: 'media',
      severidade: 'grave',
      controles_imediatos:
        'Isolar área, sinalizar rota e validar comunicação da equipe.',
      acao_recomendada:
        'Revisar procedimento antes da retomada total da operação.',
      epi_epc_aplicaveis: 'Capacete, óculos, cones e barreira física.',
      observacoes: 'Execução automática para teste de emissão ARR.',
      site_id: opts.siteId,
      responsavel_id: opts.userId,
      participants: [opts.userId],
    },
  });
  if (create.status !== 201 || !create.body?.id) {
    throw new Error(
      `Falha ao criar ARR #${index + 1} (${create.status}): ${create.raw.slice(0, 240)}`,
    );
  }
  const arrId = String(create.body.id);

  const updateStatus = await requestJson<{ id?: string; status?: string }>(
    'PATCH',
    `/arrs/${arrId}/status`,
    {
      token: opts.token,
      companyId: opts.companyId,
      csrf: opts.csrf,
      body: { status: 'analisada' },
    },
  );
  if (updateStatus.status !== 200) {
    throw new Error(
      `Falha ao mover ARR ${arrId} para analisada (${updateStatus.status}): ${updateStatus.raw.slice(0, 240)}`,
    );
  }

  const upload = await requestMultipart(`/arrs/${arrId}/file`, {
    token: opts.token,
    companyId: opts.companyId,
    csrf: opts.csrf,
    filename: `arr-${index + 1}.pdf`,
    bytes: buildMinimalPdfBytes(`ARR-${index + 1}`),
  });
  if (upload.status !== 201) {
    throw new Error(
      `Falha ao emitir PDF final ARR ${arrId} (${upload.status}): ${upload.raw.slice(0, 240)}`,
    );
  }

  const arrDetail = await requestJson<ArrRecord>('GET', `/arrs/${arrId}`, {
    token: opts.token,
    companyId: opts.companyId,
  });
  if (arrDetail.status !== 200 || !arrDetail.body) {
    throw new Error(
      `Falha ao consultar ARR ${arrId} (${arrDetail.status}): ${arrDetail.raw.slice(0, 240)}`,
    );
  }
  if (!arrDetail.body.document_code || !arrDetail.body.final_pdf_hash_sha256) {
    throw new Error(
      `ARR ${arrId} sem rastreabilidade completa após emissão (code/hash ausente).`,
    );
  }
  if (!arrDetail.body.pdf_generated_at || !arrDetail.body.emitted_by_user_id) {
    throw new Error(
      `ARR ${arrId} sem metadados de emissão (pdf_generated_at/emitted_by_user_id).`,
    );
  }
  if (!arrDetail.body.pdf_file_key) {
    throw new Error(`ARR ${arrId} sem pdf_file_key após emissão.`);
  }

  const pdfAccess = await requestJson<ArrPdfAccess>(
    'GET',
    `/arrs/${arrId}/pdf`,
    {
      token: opts.token,
      companyId: opts.companyId,
    },
  );
  if (pdfAccess.status !== 200 || !pdfAccess.body) {
    throw new Error(
      `Falha ao consultar acesso PDF ARR ${arrId} (${pdfAccess.status}): ${pdfAccess.raw.slice(0, 240)}`,
    );
  }
  if (!pdfAccess.body.hasFinalPdf) {
    throw new Error(`ARR ${arrId} retornou hasFinalPdf=false após emissão.`);
  }

  return {
    arrId,
    status: arrDetail.body.status,
    documentCode: arrDetail.body.document_code || null,
    hash: arrDetail.body.final_pdf_hash_sha256 || null,
    emittedBy: arrDetail.body.emitted_by_user_id || null,
    pdfAvailability: pdfAccess.body.availability,
    pdfUrl: pdfAccess.body.url || null,
  };
}

async function main(): Promise<void> {
  assertEnv();
  const startedAt = Date.now();

  const csrf = await fetchCsrf();
  const session = await loginWithMfa(csrf);
  const token = session.accessToken;
  const companyId = session.user?.company_id;
  const userId = session.user?.id;
  if (!token || !companyId || !userId) {
    throw new Error('Login retornou sessão incompleta (token/company/user).');
  }
  const siteId = await resolveFirstSiteId(token, companyId);
  const isoDate = new Date().toISOString().slice(0, 10);

  const results: Array<Awaited<ReturnType<typeof createEmitAndValidateArr>>> =
    [];
  for (let i = 0; i < BATCH_SIZE; i += 1) {
    const item = await createEmitAndValidateArr(i, {
      token,
      companyId,
      userId,
      siteId,
      csrf,
      isoDate,
    });
    results.push(item);
  }

  const readyCount = results.filter(
    (item) => item.pdfAvailability === 'ready',
  ).length;
  const degradedCount = results.filter(
    (item) => item.pdfAvailability === 'registered_without_signed_url',
  ).length;
  const treatedCount = results.filter(
    (item) => item.status === 'tratada',
  ).length;
  const elapsedMs = Date.now() - startedAt;

  const sample = results[0];
  let samplePdfCheck: {
    downloaded: boolean;
    statusCode: number | null;
    contentType: string | null;
    sizeBytes: number | null;
  } = {
    downloaded: false,
    statusCode: null,
    contentType: null,
    sizeBytes: null,
  };

  if (sample?.pdfUrl) {
    const downloadUrl = sample.pdfUrl.startsWith('http')
      ? sample.pdfUrl
      : `${BASE_URL}${sample.pdfUrl.startsWith('/') ? sample.pdfUrl : `/${sample.pdfUrl}`}`;
    const pdfRes = await fetch(downloadUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'arr-emit-batch/1.0' },
    });
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    samplePdfCheck = {
      downloaded: pdfRes.ok,
      statusCode: pdfRes.status,
      contentType: pdfRes.headers.get('content-type'),
      sizeBytes: pdfBuffer.byteLength,
    };
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        batchSize: BATCH_SIZE,
        treatedCount,
        readyCount,
        degradedCount,
        elapsedMs,
        sample,
        samplePdfCheck,
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  console.error(
    `[arr-emit-batch] erro: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
