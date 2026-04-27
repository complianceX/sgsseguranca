const REDACTED = '***REDACTED***';
const MASKED = '***MASKED***';

const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'csrf',
  'password',
  'refresh_token',
  'secret',
  'senha',
  'signature_pin',
  'token',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-refresh-csrf',
]);

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '_');
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_QUERY_KEYS.has(normalized) ||
    normalized.includes('secret') ||
    /(^|_|-)token($|_|-)/.test(normalized)
  );
}

export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) {
    return MASKED;
  }

  return `${digits.slice(0, 3)}.***.***-**`;
}

export function maskEmail(value: string): string {
  const [local, domain] = value.split('@');
  if (!domain) {
    return MASKED;
  }

  return `${local?.[0] || '*'}***@${domain}`;
}

export function maskSensitiveText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (email) =>
      maskEmail(email),
    )
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, (cpf) => maskCpf(cpf))
    .replace(/\bBearer\s+[A-Za-z0-9._-]+\b/g, 'Bearer ***REDACTED***')
    .replace(/\bcf(?:ut|k)_[A-Za-z0-9_-]+\b/g, REDACTED);
}

export function sanitizeLogValue(key: string, value: unknown): unknown {
  if (isSensitiveKey(key)) {
    return REDACTED;
  }

  const normalized = normalizeKey(key);
  if (normalized.includes('cpf')) {
    return typeof value === 'string' ? maskCpf(value) : MASKED;
  }

  if (normalized.includes('email')) {
    return typeof value === 'string' ? maskEmail(value) : MASKED;
  }

  if (typeof value === 'string') {
    return maskSensitiveText(value);
  }

  return value;
}

export function sanitizeLogUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    return '';
  }

  try {
    const parsed = new URL(rawUrl, 'http://sgs.local');
    for (const key of Array.from(parsed.searchParams.keys())) {
      const values = parsed.searchParams.getAll(key);
      parsed.searchParams.delete(key);
      for (const value of values) {
        const sanitizedValue = sanitizeLogValue(key, value);
        parsed.searchParams.append(
          key,
          typeof sanitizedValue === 'string' ? sanitizedValue : '',
        );
      }
    }

    const query = parsed.searchParams.toString();
    return `${parsed.pathname}${query ? `?${query}` : ''}`;
  } catch {
    return maskSensitiveText(rawUrl).slice(0, 500);
  }
}

export function sanitizeLogObject<T>(value: T, depth = 0): T {
  if (depth > 6) {
    return '***TRUNCATED***' as T;
  }

  if (Array.isArray(value)) {
    const sanitizedItems: unknown[] = value.map((item: unknown) =>
      sanitizeLogObject(item, depth + 1),
    );
    return sanitizedItems as T;
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = sanitizeLogObject(sanitizeLogValue(key, item), depth + 1);
    }
    return output as T;
  }

  if (typeof value === 'string') {
    return maskSensitiveText(value) as T;
  }

  return value;
}
