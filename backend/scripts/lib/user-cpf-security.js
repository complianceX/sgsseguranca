const {
  createCipheriv,
  createHmac,
  randomBytes,
} = require('crypto');

const ENCRYPTION_PREFIX = 'enc:v1:';
const FALLBACK_HASH_KEY = 'sgs-dev-field-hash-key';
const FIELD_ENCRYPTION_IV_LENGTH_BYTES = 12;
const FIELD_ENCRYPTION_AUTH_TAG_LENGTH_BYTES = 16;

function parseBooleanFlag(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function isEncryptionEnabled() {
  return parseBooleanFlag(process.env.FIELD_ENCRYPTION_ENABLED, true);
}

function decodeKey(raw) {
  if (!raw) {
    return null;
  }

  const trimmed = String(raw).trim();
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

function resolveEncryptionKey() {
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

function resolveHashKey() {
  const configured = process.env.FIELD_ENCRYPTION_HASH_KEY?.trim();
  if (configured) {
    return configured;
  }

  const encryptionKey = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (encryptionKey) {
    return encryptionKey;
  }

  if (isEncryptionEnabled()) {
    throw new Error(
      'FIELD_ENCRYPTION_HASH_KEY é obrigatória quando FIELD_ENCRYPTION_ENABLED=true.',
    );
  }

  return FALLBACK_HASH_KEY;
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '').trim();
}

function hashSensitiveValue(value) {
  const normalized = String(value || '').trim();
  return createHmac('sha256', resolveHashKey())
    .update(normalized)
    .digest('hex');
}

function encryptSensitiveValue(value) {
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

function buildCpfSecurityPayload(cpf) {
  const normalizedCpf = normalizeCpf(cpf);
  const cpfCiphertext = encryptSensitiveValue(normalizedCpf);

  if (!cpfCiphertext || cpfCiphertext === normalizedCpf) {
    throw new Error(
      'Criptografia de CPF nao produziu ciphertext. Verifique FIELD_ENCRYPTION_KEY/FIELD_ENCRYPTION_ENABLED.',
    );
  }

  return {
    cpf: null,
    cpf_hash: hashSensitiveValue(normalizedCpf),
    cpf_ciphertext: cpfCiphertext,
  };
}

module.exports = {
  buildCpfSecurityPayload,
  hashSensitiveValue,
  normalizeCpf,
};
