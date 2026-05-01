import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';

const ENCRYPTION_PREFIX = 'enc:v1:';
const FALLBACK_HASH_KEY = 'sgs-dev-field-hash-key';
const FIELD_ENCRYPTION_IV_LENGTH_BYTES = 12;
const FIELD_ENCRYPTION_AUTH_TAG_LENGTH_BYTES = 16;

function parseBooleanFlag(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function isEncryptionEnabled(): boolean {
  return parseBooleanFlag(process.env.FIELD_ENCRYPTION_ENABLED, true);
}

function decodeKey(raw: string): Buffer | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  try {
    const base64Decoded = Buffer.from(trimmed, 'base64');
    if (base64Decoded.length === 32) {
      return base64Decoded;
    }
  } catch {
    // no-op
  }

  const utf8 = Buffer.from(trimmed, 'utf8');
  if (utf8.length === 32) {
    return utf8;
  }

  return null;
}

export function hasValidFieldEncryptionKey(raw: string | undefined): boolean {
  return Boolean(decodeKey(raw || ''));
}

function resolveEncryptionKey(): Buffer | null {
  const rawKey = process.env.FIELD_ENCRYPTION_KEY || '';
  const key = decodeKey(rawKey);
  if (key) {
    return key;
  }

  if (isEncryptionEnabled() && rawKey.trim()) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY deve resolver para 32 bytes quando FIELD_ENCRYPTION_ENABLED=true.',
    );
  }

  if (isEncryptionEnabled() && process.env.NODE_ENV === 'production') {
    throw new Error(
      'FIELD_ENCRYPTION_KEY deve resolver para 32 bytes quando FIELD_ENCRYPTION_ENABLED=true em produção.',
    );
  }

  return null;
}

function resolveHashKey(): string {
  const configured = process.env.FIELD_ENCRYPTION_HASH_KEY?.trim();
  if (configured) {
    return configured;
  }

  const encryptionKey = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (encryptionKey) {
    return encryptionKey;
  }

  if (isEncryptionEnabled() && process.env.NODE_ENV === 'production') {
    throw new Error(
      'FIELD_ENCRYPTION_HASH_KEY é obrigatória em produção quando FIELD_ENCRYPTION_ENABLED=true. ' +
        'Defina um segredo dedicado (mínimo 32 bytes) ou rotacione FIELD_ENCRYPTION_KEY como fallback. ' +
        'Sem isso, hashes determinísticos de PII usam chave pública conhecida e são vulneráveis a lookup.',
    );
  }

  return FALLBACK_HASH_KEY;
}

export function hashSensitiveValue(value: string): string {
  const normalized = String(value || '').trim();
  return createHmac('sha256', resolveHashKey())
    .update(normalized)
    .digest('hex');
}

export function encryptSensitiveValue(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const clear = String(value);
  if (!clear.trim()) {
    return null;
  }

  const key = resolveEncryptionKey();
  if (!isEncryptionEnabled() || !key) {
    return clear;
  }

  const iv = randomBytes(FIELD_ENCRYPTION_IV_LENGTH_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: FIELD_ENCRYPTION_AUTH_TAG_LENGTH_BYTES,
  });
  const encrypted = Buffer.concat([
    cipher.update(clear, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSensitiveValue(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value);
  if (!raw.startsWith(ENCRYPTION_PREFIX)) {
    return raw;
  }

  const key = resolveEncryptionKey();
  if (!key) {
    return raw;
  }

  const payload = raw.slice(ENCRYPTION_PREFIX.length);
  const [ivRaw, tagRaw, dataRaw] = payload.split(':');
  if (!ivRaw || !tagRaw || !dataRaw) {
    return raw;
  }

  try {
    const iv = Buffer.from(ivRaw, 'base64url');
    const tag = Buffer.from(tagRaw, 'base64url');

    if (
      iv.length !== FIELD_ENCRYPTION_IV_LENGTH_BYTES ||
      tag.length !== FIELD_ENCRYPTION_AUTH_TAG_LENGTH_BYTES
    ) {
      return null;
    }

    const decipher = createDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: FIELD_ENCRYPTION_AUTH_TAG_LENGTH_BYTES,
    });
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataRaw, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    // AES-GCM auth tag mismatch or corrupted payload — returning the raw
    // ciphertext would silently propagate encrypted bytes as application data.
    // Return null so callers treat this field as missing/unreadable.
    console.error(
      '[field-encryption] decryptSensitiveValue: decryption failed (wrong key or corrupted data)',
    );
    return null;
  }
}
