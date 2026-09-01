import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  parseVerificationOnlyKeys,
  SIGNATURE_TIMESTAMP_LEGACY_KEY_ID,
  SignatureTimestampKeyConfig,
  SignatureTimestampKeyringConfigurationError,
  isValidSignatureTimestampKeyId,
} from './signature-timestamp-keyring.contract';

type SignatureTimestampKeyringSnapshot = {
  active: SignatureTimestampKeyConfig | null;
  verification: Map<string, SignatureTimestampKeyConfig>;
};

type SignatureTimestampKeyringValues = {
  activeKeyId?: string;
  activeSecret?: string;
  legacySecret?: string;
  verificationOnlyJson?: string;
};

function validateKeyringValues(values: SignatureTimestampKeyringValues): void {
  if (Boolean(values.activeKeyId) !== Boolean(values.activeSecret)) {
    throw new SignatureTimestampKeyringConfigurationError(
      'SIGNATURE_TIMESTAMP_ACTIVE_KEY_ID and SIGNATURE_TIMESTAMP_ACTIVE_SECRET must be configured together',
    );
  }
  if (
    values.activeKeyId &&
    !isValidSignatureTimestampKeyId(values.activeKeyId)
  ) {
    throw new SignatureTimestampKeyringConfigurationError(
      'SIGNATURE_TIMESTAMP_ACTIVE_KEY_ID: INVALID_KEY_ID',
    );
  }
  if (
    values.activeSecret &&
    Buffer.byteLength(values.activeSecret, 'utf8') < 32
  ) {
    throw new SignatureTimestampKeyringConfigurationError(
      'SIGNATURE_TIMESTAMP_ACTIVE_SECRET: INVALID_LENGTH',
    );
  }
  if (
    values.legacySecret &&
    Buffer.byteLength(values.legacySecret, 'utf8') < 32
  ) {
    throw new SignatureTimestampKeyringConfigurationError(
      'Signature timestamp secret is too short',
    );
  }
}

function buildVerificationKeys(
  values: SignatureTimestampKeyringValues,
): Map<string, SignatureTimestampKeyConfig> {
  const verification = new Map<string, SignatureTimestampKeyConfig>();
  const verificationOnly = parseVerificationOnlyKeys(
    values.verificationOnlyJson,
  );

  if (values.legacySecret) {
    verification.set(SIGNATURE_TIMESTAMP_LEGACY_KEY_ID, {
      keyId: SIGNATURE_TIMESTAMP_LEGACY_KEY_ID,
      secret: values.legacySecret,
      canSign: !values.activeSecret,
    });
  }

  for (const [keyId, secret] of verificationOnly) {
    if (verification.has(keyId) || keyId === values.activeKeyId) {
      throw new SignatureTimestampKeyringConfigurationError(
        'SIGNATURE_TIMESTAMP key IDs must be unique across active and verification-only keys',
      );
    }
    verification.set(keyId, { keyId, secret, canSign: false });
  }

  return verification;
}

function resolveActiveKey(
  values: SignatureTimestampKeyringValues,
  verification: Map<string, SignatureTimestampKeyConfig>,
): SignatureTimestampKeyConfig | null {
  if (values.activeKeyId && values.activeSecret) {
    return {
      keyId: values.activeKeyId,
      secret: values.activeSecret,
      canSign: true,
    };
  }
  if (!values.legacySecret) return null;
  return verification.get(SIGNATURE_TIMESTAMP_LEGACY_KEY_ID) ?? null;
}

function buildSignatureTimestampKeyringSnapshot(
  values: SignatureTimestampKeyringValues,
): SignatureTimestampKeyringSnapshot {
  validateKeyringValues(values);
  const verification = buildVerificationKeys(values);
  if (values.activeKeyId === SIGNATURE_TIMESTAMP_LEGACY_KEY_ID) {
    throw new SignatureTimestampKeyringConfigurationError(
      'SIGNATURE_TIMESTAMP_ACTIVE_KEY_ID: RESERVED_KEY_ID',
    );
  }

  const active = resolveActiveKey(values, verification);
  if (
    values.activeKeyId &&
    values.activeSecret &&
    values.legacySecret === values.activeSecret
  ) {
    throw new SignatureTimestampKeyringConfigurationError(
      'SIGNATURE_TIMESTAMP_ACTIVE_SECRET: MUST_DIFFER_FROM_LEGACY_SECRET',
    );
  }
  if (active && !verification.has(active.keyId)) {
    verification.set(active.keyId, active);
  }

  return { active, verification };
}

@Injectable()
export class SignatureTimestampKeyringService {
  private snapshot?: SignatureTimestampKeyringSnapshot;

  constructor(private readonly configService: ConfigService) {}

  getActiveSigningKey(): SignatureTimestampKeyConfig | undefined {
    return this.getSnapshot().active ?? undefined;
  }

  getVerificationKey(keyId: string): SignatureTimestampKeyConfig | undefined {
    return this.getSnapshot().verification.get(keyId);
  }

  getVerificationOnlyKeyIds(): string[] {
    return [...this.getSnapshot().verification.values()]
      .filter((key) => !key.canSign)
      .map((key) => key.keyId);
  }

  private getSnapshot(): SignatureTimestampKeyringSnapshot {
    if (this.snapshot) return this.snapshot;

    this.snapshot = buildSignatureTimestampKeyringSnapshot({
      activeKeyId: this.readString('SIGNATURE_TIMESTAMP_ACTIVE_KEY_ID'),
      activeSecret: this.readString('SIGNATURE_TIMESTAMP_ACTIVE_SECRET'),
      legacySecret: this.readString('SIGNATURE_TIMESTAMP_SECRET'),
      verificationOnlyJson: this.readString(
        'SIGNATURE_TIMESTAMP_VERIFICATION_KEYS_JSON',
      ),
    });
    return this.snapshot;
  }

  private readString(key: string): string | undefined {
    const value = this.configService.get<unknown>(key);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
