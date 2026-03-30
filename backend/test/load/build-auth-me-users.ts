import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

type RawCredential = {
  cpf?: string;
  password?: string;
  companyId?: string;
  turnstileToken?: string;
};

type Credential = {
  cpf: string;
  password: string;
  companyId: string;
  turnstileToken: string;
};

type ResultReason =
  | 'invalid_credential'
  | 'login_failed'
  | 'auth_me_failed'
  | 'network_error';

const DEFAULT_INPUT_FILE = path.resolve(
  __dirname,
  'fixtures/login-users.120.json',
);
const DEFAULT_OUTPUT_FILE = path.resolve(
  __dirname,
  'fixtures/login-users.auth.valid.local.generated.json',
);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const BASE_URL = String(
  process.env.BASE_URL || 'http://localhost:3001',
).replace(/\/+$/, '');
const LOGIN_PATH = String(process.env.LOGIN_PATH || '/auth/login').trim();
const AUTH_ME_PATH = String(process.env.AUTH_ME_PATH || '/auth/me').trim();
const USER_AGENT = String(
  process.env.USER_AGENT || 'auth-user-builder/1.0',
).trim();

const TURNSTILE_TOKEN = String(process.env.TURNSTILE_TOKEN || '').trim();
const REQUEST_TIMEOUT_MS = clampInt(
  process.env.REQUEST_TIMEOUT_MS,
  8_000,
  1_000,
  60_000,
);
const SAMPLE_LIMIT = clampInt(process.env.SAMPLE_LIMIT, 0, 0, 100_000);
const MIN_VALID_USERS = clampInt(process.env.MIN_VALID_USERS, 1, 1, 100_000);
const INTER_USER_DELAY_MS = clampInt(
  process.env.INTER_USER_DELAY_MS,
  50,
  0,
  2_000,
);

const inputFile = path.resolve(
  process.cwd(),
  process.env.LOGIN_USERS_FILE || DEFAULT_INPUT_FILE,
);
const outputFile = path.resolve(
  process.cwd(),
  process.env.AUTH_VALID_USERS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
);

async function main() {
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Arquivo de credenciais não encontrado: ${inputFile}`);
  }

  const credentials = readCredentials(inputFile);
  const sample =
    SAMPLE_LIMIT > 0 ? credentials.slice(0, SAMPLE_LIMIT) : credentials;
  if (!sample.length) {
    throw new Error(
      'Nenhuma credencial válida encontrada no arquivo de entrada.',
    );
  }

  const validUsers: Credential[] = [];
  const failReasons = new Map<ResultReason, number>();

  for (let index = 0; index < sample.length; index += 1) {
    const credential = sample[index];
    const result = await validateCredential(credential);

    if (result.ok) {
      validUsers.push(result.credential);
    } else {
      failReasons.set(result.reason, (failReasons.get(result.reason) || 0) + 1);
    }

    if (INTER_USER_DELAY_MS > 0) {
      await sleep(INTER_USER_DELAY_MS);
    }
  }

  if (validUsers.length < MIN_VALID_USERS) {
    if (failReasons.size > 0) {
      console.log('- Quebras por motivo (antes da falha):');
      for (const [reason, total] of failReasons.entries()) {
        console.log(`  * ${reason}: ${total}`);
      }
    }
    throw new Error(
      [
        `Pool auth-valid insuficiente: ${validUsers.length}.`,
        `Mínimo esperado: ${MIN_VALID_USERS}.`,
        'Revise credenciais, bloqueios de brute-force e tenant header.',
      ].join(' '),
    );
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(validUsers, null, 2), 'utf8');

  console.log('\nValidação de usuários para fluxo auth (login + /auth/me) concluída.');
  console.log(`- Base URL: ${BASE_URL}`);
  console.log(`- Input: ${inputFile}`);
  console.log(`- Output: ${outputFile}`);
  console.log(`- Total processado: ${sample.length}`);
  console.log(`- Usuários válidos: ${validUsers.length}`);
  console.log(`- Usuários inválidos: ${sample.length - validUsers.length}`);
  if (failReasons.size > 0) {
    console.log('- Quebras por motivo:');
    for (const [reason, total] of failReasons.entries()) {
      console.log(`  * ${reason}: ${total}`);
    }
  }
}

function readCredentials(filePath: string): Credential[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as RawCredential[];
  if (!Array.isArray(parsed)) {
    throw new Error('Arquivo de credenciais inválido: JSON deve ser um array.');
  }

  return parsed
    .map((item) => normalizeCredential(item))
    .filter((item): item is Credential => Boolean(item));
}

function normalizeCredential(entry: RawCredential): Credential | null {
  const cpf = String(entry?.cpf || '').replace(/\D/g, '');
  const password = String(entry?.password || '');
  if (cpf.length !== 11 || password.length === 0) {
    return null;
  }
  return {
    cpf,
    password,
    companyId: String(entry?.companyId || '').trim(),
    turnstileToken: String(entry?.turnstileToken || TURNSTILE_TOKEN).trim(),
  };
}

async function validateCredential(
  credential: Credential,
): Promise<
  { ok: true; credential: Credential } | { ok: false; reason: ResultReason }
> {
  try {
    const loginResult = await login(credential);
    if (!loginResult.ok) {
      return { ok: false, reason: 'login_failed' };
    }

    const authMeOk = await validateAuthMe(loginResult.token, loginResult.companyId);
    if (!authMeOk) {
      return { ok: false, reason: 'auth_me_failed' };
    }

    return {
      ok: true,
      credential: {
        ...credential,
        companyId: loginResult.companyId,
      },
    };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

async function login(credential: Credential): Promise<{
  ok: boolean;
  token: string;
  companyId: string;
}> {
  const fingerprint = buildFingerprint(credential.cpf);
  const payload: Record<string, string> = {
    cpf: credential.cpf,
    password: credential.password,
  };
  if (credential.turnstileToken) {
    payload.turnstileToken = credential.turnstileToken;
  }

  const response = await requestJson(
    'POST',
    LOGIN_PATH,
    payload,
    undefined,
    credential.companyId,
    fingerprint,
  );

  const token = pickString(response.body, ['accessToken']);
  const responseCompanyId = pickString(response.body, ['user', 'company_id']);

  const ok =
    (response.status === 200 || response.status === 201) && Boolean(token);
  return {
    ok,
    token,
    companyId: responseCompanyId || credential.companyId || '',
  };
}

async function validateAuthMe(token: string, companyId: string): Promise<boolean> {
  const fingerprint = buildFingerprint(token.slice(-11));
  const me = await requestJson(
    'GET',
    AUTH_ME_PATH,
    undefined,
    token,
    companyId,
    fingerprint,
  );
  if (me.status !== 200) {
    return false;
  }
  const userId =
    pickString(me.body, ['user', 'id']) || pickString(me.body, ['id']);
  return Boolean(userId);
}

async function requestJson(
  method: 'GET' | 'POST',
  endpoint: string,
  body?: unknown,
  token?: string,
  companyId?: string,
  fingerprint?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (companyId) {
    headers['x-company-id'] = companyId;
  }

  if (fingerprint) {
    headers['x-client-fingerprint'] = fingerprint;
  }

  const url = buildUrl(endpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    return {
      status: response.status,
      body: parsed,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildUrl(endpoint: string): string {
  const normalized = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${BASE_URL}${normalized}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pickString(source: unknown, pathParts: string[]): string {
  let current: unknown = source;
  for (const part of pathParts) {
    if (!isRecord(current) || !(part in current)) {
      return '';
    }
    current = current[part];
  }
  return typeof current === 'string' ? current : '';
}

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const integer = Math.floor(parsed);
  if (integer < min) return min;
  if (integer > max) return max;
  return integer;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFingerprint(seed: string): string {
  const normalized = String(seed || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-16);
  return `auth-builder-${normalized || 'default'}`;
}

void main().catch((error: unknown) => {
  console.error('\nFalha ao montar pool auth-valid (login + /auth/me):');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
