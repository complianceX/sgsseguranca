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
  siteId?: string;
};

type ResultReason =
  | 'invalid_credential'
  | 'login_failed'
  | 'auth_me_failed'
  | 'site_resolve_failed'
  | 'dds_create_failed'
  | 'dds_publish_forbidden'
  | 'dds_publish_failed'
  | 'network_error';

const DEFAULT_INPUT_FILE = path.resolve(
  __dirname,
  'fixtures/login-users.120.json',
);
const DEFAULT_OUTPUT_FILE = path.resolve(
  __dirname,
  'fixtures/dds-users.publish.valid.local.generated.json',
);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const BASE_URL = String(
  process.env.BASE_URL || 'http://localhost:3001',
).replace(/\/+$/, '');
const LOGIN_PATH = String(process.env.LOGIN_PATH || '/auth/login').trim();
const AUTH_ME_PATH = String(process.env.AUTH_ME_PATH || '/auth/me').trim();
const SITES_PATH = String(
  process.env.SITES_PATH || '/sites?page=1&limit=10',
).trim();
const DDS_BASE_PATH = String(process.env.DDS_BASE_PATH || '/dds').trim();
const USER_AGENT = String(
  process.env.USER_AGENT || 'dds-publish-user-builder/1.0',
).trim();

const FIXED_SITE_ID = String(process.env.FIXED_SITE_ID || '').trim();
const AUTO_CREATE_SITE = toBool(process.env.AUTO_CREATE_SITE, true);
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
  process.env.DDS_VALID_USERS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
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
        `Pool publish-valid insuficiente: ${validUsers.length}.`,
        `Mínimo esperado: ${MIN_VALID_USERS}.`,
        'Revise permissões de DDS e massa de usuários.',
      ].join(' '),
    );
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(validUsers, null, 2), 'utf8');

  console.log(
    '\nValidação de usuários para fluxo DDS (create + publish) concluída.',
  );
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

    const userId = await resolveUserId(
      loginResult.token,
      loginResult.companyId,
    );
    if (!userId) {
      return { ok: false, reason: 'auth_me_failed' };
    }

    const siteId = await resolveSiteId(
      loginResult.token,
      loginResult.companyId,
    );
    if (!siteId) {
      return { ok: false, reason: 'site_resolve_failed' };
    }

    const ddsId = await createDds(
      loginResult.token,
      loginResult.companyId,
      siteId,
      userId,
    );
    if (!ddsId) {
      return { ok: false, reason: 'dds_create_failed' };
    }

    const publishStatus = await publishDds(
      loginResult.token,
      loginResult.companyId,
      ddsId,
    );
    if (publishStatus === 403) {
      return { ok: false, reason: 'dds_publish_forbidden' };
    }
    if (publishStatus !== 200) {
      return { ok: false, reason: 'dds_publish_failed' };
    }

    return {
      ok: true,
      credential: {
        ...credential,
        companyId: loginResult.companyId,
        siteId,
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

async function resolveUserId(
  token: string,
  companyId: string,
): Promise<string | null> {
  const me = await requestJson(
    'GET',
    AUTH_ME_PATH,
    undefined,
    token,
    companyId,
  );
  if (me.status !== 200) {
    return null;
  }
  const userId =
    pickString(me.body, ['user', 'id']) || pickString(me.body, ['id']);
  return userId || null;
}

async function resolveSiteId(
  token: string,
  companyId: string,
): Promise<string | null> {
  if (FIXED_SITE_ID) {
    return FIXED_SITE_ID;
  }

  const list = await requestJson(
    'GET',
    SITES_PATH,
    undefined,
    token,
    companyId,
  );
  if (list.status !== 200) {
    return null;
  }

  const sites = extractSiteList(list.body);

  if (sites.length > 0) {
    const firstSiteId = pickString(sites[0], ['id']);
    if (firstSiteId) {
      return firstSiteId;
    }
  }

  if (!AUTO_CREATE_SITE) {
    return null;
  }

  const createPayload = {
    nome: 'Site benchmark DDS',
    local: 'Carga',
    endereco: 'N/A',
    cidade: 'N/A',
    estado: 'SP',
    status: true,
    company_id: companyId || undefined,
  };
  const created = await requestJson(
    'POST',
    '/sites',
    createPayload,
    token,
    companyId,
  );
  if (created.status !== 200 && created.status !== 201) {
    return null;
  }
  const siteId =
    pickString(created.body, ['id']) ||
    pickString(created.body, ['data', 'id']);
  return siteId || null;
}

async function createDds(
  token: string,
  companyId: string,
  siteId: string,
  userId: string,
): Promise<string | null> {
  const payload = {
    tema: 'DDS benchmark validator',
    conteudo: 'Validação de permissão de criação/publicação para benchmark.',
    data: new Date().toISOString(),
    site_id: siteId,
    facilitador_id: userId,
    participants: [userId],
  };

  const response = await requestJson(
    'POST',
    DDS_BASE_PATH,
    payload,
    token,
    companyId,
  );
  if (response.status !== 200 && response.status !== 201) {
    return null;
  }
  const ddsId = pickString(response.body, ['id']);
  return ddsId || null;
}

async function publishDds(
  token: string,
  companyId: string,
  ddsId: string,
): Promise<number> {
  const response = await requestJson(
    'PATCH',
    `${DDS_BASE_PATH}/${ddsId}/status`,
    { status: 'publicado' },
    token,
    companyId,
  );
  return response.status;
}

async function requestJson(
  method: 'GET' | 'POST' | 'PATCH',
  endpoint: string,
  body?: unknown,
  token?: string,
  companyId?: string,
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

function extractSiteList(source: unknown): Record<string, unknown>[] {
  if (Array.isArray(source)) {
    return source.filter(isRecord);
  }

  if (!isRecord(source)) {
    return [];
  }

  const data = source.data;
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }

  const items = source.items;
  if (Array.isArray(items)) {
    return items.filter(isRecord);
  }

  return [];
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'y', 'on'].includes(value.toLowerCase().trim());
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

void main().catch((error: unknown) => {
  console.error('\nFalha ao montar pool publish-valid de DDS:');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
