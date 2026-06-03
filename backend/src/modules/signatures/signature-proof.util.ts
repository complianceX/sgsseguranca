import { createHash } from 'crypto';

export const SIGNATURE_VERIFICATION_MODES = {
  SERVER_VERIFIABLE: 'server_verifiable',
  OPERATIONAL_ACK: 'operational_ack',
  LEGACY_CLIENT_HASH: 'legacy_client_hash',
} as const;

export const SIGNATURE_PROOF_SCOPES = {
  GOVERNED_FINAL_DOCUMENT: 'governed_final_document',
  DOCUMENT_REVISION: 'document_revision',
  DOCUMENT_IDENTITY: 'document_identity',
  OPERATIONAL_SNAPSHOT: 'operational_snapshot',
} as const;

export const SIGNATURE_LEGAL_ASSURANCE = {
  NOT_LEGAL_STRONG: 'not_legal_strong',
} as const;

type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

export function canonicalizeSignaturePayload(
  value: unknown,
): CanonicalJsonValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeSignaturePayload(item));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const normalizedEntries = Object.keys(record)
      .sort()
      .flatMap((key) => {
        const original = record[key];
        const normalized = canonicalizeSignaturePayload(original);
        if (normalized === null && original === undefined) {
          return [];
        }

        return [[key, normalized] as const];
      });

    return Object.fromEntries(normalizedEntries);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return '[function]';
  }

  return '[unknown]';
}

export function hashCanonicalSignaturePayload(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeSignaturePayload(value)))
    .digest('hex');
}

export function hashSignatureEvidence(rawValue: string): string {
  return createHash('sha256')
    .update(String(rawValue || ''))
    .digest('hex');
}
