type LooseRecord = Record<string, unknown>;

const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
const PHONE_PATTERN = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})-?\d{4}\b/g;
const CNPJ_PATTERN = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;

const DIRECT_REDACTION_KEYS = new Set([
  'nome',
  'name',
  'fullname',
  'full_name',
  'workername',
  'worker_name',
  'email',
  'cpf',
  'cnpj',
  'telefone',
  'phone',
  'celular',
]);

const CONTEXT_REDACTION_KEYS = new Set([
  'funcao',
  'função',
  'cargo',
  'role',
  'site',
  'site_name',
  'sitename',
  'company_name',
  'companyname',
  'obra',
  'participants',
  'participant',
  'workers',
  'worker',
  'trabalhadores',
  'trabalhador',
  'employees',
  'employee',
]);

const JSON_STYLE_PATTERNS: Array<[RegExp, string]> = [
  [/("nome"\s*:\s*")[^"]*(")/gi, '$1[REDACTED_NAME]$2'],
  [/("name"\s*:\s*")[^"]*(")/gi, '$1[REDACTED_NAME]$2'],
  [/("full_?name"\s*:\s*")[^"]*(")/gi, '$1[REDACTED_NAME]$2'],
  [/("worker_?name"\s*:\s*")[^"]*(")/gi, '$1[REDACTED_NAME]$2'],
  [/("func(?:ao|ão)"\s*:\s*")[^"]*(")/gi, '$1[REDACTED_ROLE]$2'],
  [/("cargo"\s*:\s*")[^"]*(")/gi, '$1[REDACTED_ROLE]$2'],
  [/("role"\s*:\s*")[^"]*(")/gi, '$1[REDACTED_ROLE]$2'],
  [/("site(?:_name)?"\s*:\s*")[^"]*(")/gi, '$1[REDACTED_SITE]$2'],
  [/("company_?name"\s*:\s*")[^"]*(")/gi, '$1[REDACTED_COMPANY]$2'],
];

function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function sanitizePrimitiveString(value: string): string {
  return value
    .replace(CPF_PATTERN, '[CPF]')
    .replace(CNPJ_PATTERN, '[CNPJ]')
    .replace(EMAIL_PATTERN, '[EMAIL]')
    .replace(PHONE_PATTERN, '[PHONE]');
}

function sanitizeStructuredString(value: string): string {
  return JSON_STYLE_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    sanitizePrimitiveString(value),
  );
}

function sanitizeByKey(key: string, value: string): string {
  const normalizedKey = normalizeKey(key);

  if (DIRECT_REDACTION_KEYS.has(normalizedKey)) {
    if (normalizedKey === 'email') {
      return '[EMAIL]';
    }
    if (normalizedKey === 'cpf') {
      return '[CPF]';
    }
    if (normalizedKey === 'cnpj') {
      return '[CNPJ]';
    }
    if (
      normalizedKey === 'telefone' ||
      normalizedKey === 'phone' ||
      normalizedKey === 'celular'
    ) {
      return '[PHONE]';
    }
    return '[REDACTED_NAME]';
  }

  if (CONTEXT_REDACTION_KEYS.has(normalizedKey)) {
    if (
      normalizedKey === 'funcao' ||
      normalizedKey === 'cargo' ||
      normalizedKey === 'role'
    ) {
      return '[REDACTED_ROLE]';
    }

    if (
      normalizedKey === 'site' ||
      normalizedKey === 'sitename' ||
      normalizedKey === 'obra'
    ) {
      return '[REDACTED_SITE]';
    }

    if (
      normalizedKey === 'companyname' ||
      normalizedKey === 'participant' ||
      normalizedKey === 'participants' ||
      normalizedKey === 'worker' ||
      normalizedKey === 'workers' ||
      normalizedKey === 'trabalhador' ||
      normalizedKey === 'trabalhadores' ||
      normalizedKey === 'employee' ||
      normalizedKey === 'employees'
    ) {
      return '[REDACTED_CONTEXT]';
    }
  }

  return sanitizeStructuredString(value);
}

const isLooseRecord = (value: unknown): value is LooseRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const OPENAI_PROTOCOL_STRING_KEYS = new Set([
  'model',
  'type',
  'tool_call_id',
  'tool_choice',
  'reasoning_effort',
  'response_format',
]);

function sanitizeUnknown(value: unknown, parentKey?: string): unknown {
  if (typeof value === 'string') {
    return parentKey
      ? sanitizeByKey(parentKey, value)
      : sanitizeStructuredString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item, parentKey));
  }

  if (isLooseRecord(value)) {
    const result: LooseRecord = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = sanitizeUnknown(entry, key);
    }
    return result;
  }

  return value;
}

export function sanitizeForAi(value: unknown): unknown {
  return sanitizeUnknown(value);
}

export function sanitizeOpenAiRequestBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeOpenAiProtocolValue(body, []) as Record<string, unknown>;
}

function sanitizeOpenAiProtocolValue(value: unknown, path: string[]): unknown {
  if (typeof value === 'string') {
    const parentKey = path[path.length - 1] || '';
    const normalizedKey = normalizeKey(parentKey);
    if (isOpenAiProtocolStringPath(path, normalizedKey)) {
      return sanitizePrimitiveString(value);
    }
    if (parentKey) {
      return sanitizeByKey(parentKey, value);
    }
    return sanitizeStructuredString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeOpenAiProtocolValue(item, path));
  }

  if (isLooseRecord(value)) {
    const result: LooseRecord = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = sanitizeOpenAiProtocolValue(entry, [...path, key]);
    }
    return result;
  }

  return value;
}

function isOpenAiProtocolStringPath(
  path: string[],
  normalizedKey: string,
): boolean {
  if (OPENAI_PROTOCOL_STRING_KEYS.has(normalizedKey)) {
    return true;
  }

  const normalizedPath = path.map((part) => normalizeKey(part));
  const parent = normalizedPath[normalizedPath.length - 2] || '';
  const grandparent = normalizedPath[normalizedPath.length - 3] || '';

  if (normalizedKey === 'role' && parent === 'messages') {
    return true;
  }

  if (normalizedKey === 'name' && parent === 'function') {
    return true;
  }

  if (
    normalizedKey === 'name' &&
    parent === 'tool' &&
    grandparent === 'tools'
  ) {
    return true;
  }

  return false;
}
