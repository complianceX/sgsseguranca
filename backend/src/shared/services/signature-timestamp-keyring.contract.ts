export const SIGNATURE_TIMESTAMP_LEGACY_KEY_ID = 'legacy-v1';
export const SIGNATURE_TIMESTAMP_TOKEN_VERSION = 'v1';
export const SIGNATURE_TIMESTAMP_AUTHORITY = 'internal-hmac-v1';

const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export class SignatureTimestampKeyringConfigurationError extends Error {
  readonly code = 'SIGNATURE_TIMESTAMP_KEYRING_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'SignatureTimestampKeyringConfigurationError';
  }
}

export type SignatureTimestampKeyConfig = {
  keyId: string;
  secret: string;
  canSign: boolean;
};

export function isValidSignatureTimestampKeyId(value: string): boolean {
  return (
    KEY_ID_PATTERN.test(value) && value !== SIGNATURE_TIMESTAMP_LEGACY_KEY_ID
  );
}

export function parseVerificationOnlyKeys(
  raw: string | undefined,
): Map<string, string> {
  if (!raw?.trim()) return new Map();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SignatureTimestampKeyringConfigurationError(
      'SIGNATURE_TIMESTAMP_VERIFICATION_KEYS_JSON: INVALID_JSON',
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SignatureTimestampKeyringConfigurationError(
      'SIGNATURE_TIMESTAMP_VERIFICATION_KEYS_JSON: OBJECT_REQUIRED',
    );
  }

  const keys = new Map<string, string>();
  for (const [keyId, value] of Object.entries(parsed)) {
    if (
      keyId !== SIGNATURE_TIMESTAMP_LEGACY_KEY_ID &&
      !isValidSignatureTimestampKeyId(keyId)
    ) {
      throw new SignatureTimestampKeyringConfigurationError(
        'SIGNATURE_TIMESTAMP_VERIFICATION_KEYS_JSON: INVALID_KEY_ID',
      );
    }
    if (typeof value !== 'string' || !value.trim()) {
      throw new SignatureTimestampKeyringConfigurationError(
        'SIGNATURE_TIMESTAMP_VERIFICATION_KEYS_JSON: SECRET_REQUIRED',
      );
    }
    const secret = value.trim();
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new SignatureTimestampKeyringConfigurationError(
        'SIGNATURE_TIMESTAMP_VERIFICATION_KEYS_JSON: SECRET_TOO_SHORT',
      );
    }
    keys.set(keyId, secret);
  }

  return keys;
}
