import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  parseVerificationOnlyKeys,
  SIGNATURE_TIMESTAMP_LEGACY_KEY_ID,
  SignatureTimestampKeyConfig,
  SignatureTimestampKeyringConfigurationError,
  isValidSignatureTimestampKeyId,
} from './signature-timestamp-keyring.contract';

@Injectable()
export class SignatureTimestampKeyringService {
  private snapshot?: {
    active: SignatureTimestampKeyConfig | null;
    verification: Map<string, SignatureTimestampKeyConfig>;
  };

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

  private getSnapshot(): {
    active: SignatureTimestampKeyConfig | null;
    verification: Map<string, SignatureTimestampKeyConfig>;
  } {
    if (this.snapshot) return this.snapshot;

    const activeKeyId = this.readString('SIGNATURE_TIMESTAMP_ACTIVE_KEY_ID');
    const activeSecret = this.readString('SIGNATURE_TIMESTAMP_ACTIVE_SECRET');
    if (Boolean(activeKeyId) !== Boolean(activeSecret)) {
      throw new SignatureTimestampKeyringConfigurationError(
        'SIGNATURE_TIMESTAMP_ACTIVE_KEY_ID and SIGNATURE_TIMESTAMP_ACTIVE_SECRET must be configured together',
      );
    }
    if (activeKeyId && !isValidSignatureTimestampKeyId(activeKeyId)) {
      throw new SignatureTimestampKeyringConfigurationError(
        'SIGNATURE_TIMESTAMP_ACTIVE_KEY_ID: INVALID_KEY_ID',
      );
    }
    if (activeSecret && Buffer.byteLength(activeSecret, 'utf8') < 32) {
      throw new SignatureTimestampKeyringConfigurationError(
        'SIGNATURE_TIMESTAMP_ACTIVE_SECRET: INVALID_LENGTH',
      );
    }

    const legacySecret = this.readString('SIGNATURE_TIMESTAMP_SECRET');
    if (legacySecret && Buffer.byteLength(legacySecret, 'utf8') < 32) {
      throw new SignatureTimestampKeyringConfigurationError(
        'Signature timestamp secret is too short',
      );
    }

    const verification = new Map<string, SignatureTimestampKeyConfig>();
    const verificationOnly = parseVerificationOnlyKeys(
      this.readString('SIGNATURE_TIMESTAMP_VERIFICATION_KEYS_JSON'),
    );

    if (legacySecret) {
      verification.set(SIGNATURE_TIMESTAMP_LEGACY_KEY_ID, {
        keyId: SIGNATURE_TIMESTAMP_LEGACY_KEY_ID,
        secret: legacySecret,
        canSign: !activeSecret,
      });
    }

    for (const [keyId, secret] of verificationOnly) {
      if (verification.has(keyId) || keyId === activeKeyId) {
        throw new SignatureTimestampKeyringConfigurationError(
          'SIGNATURE_TIMESTAMP key IDs must be unique across active and verification-only keys',
        );
      }
      verification.set(keyId, { keyId, secret, canSign: false });
    }

    if (activeKeyId === SIGNATURE_TIMESTAMP_LEGACY_KEY_ID) {
      throw new SignatureTimestampKeyringConfigurationError(
        'SIGNATURE_TIMESTAMP_ACTIVE_KEY_ID: RESERVED_KEY_ID',
      );
    }

    const active =
      activeKeyId && activeSecret
        ? { keyId: activeKeyId, secret: activeSecret, canSign: true }
        : legacySecret
          ? (verification.get(SIGNATURE_TIMESTAMP_LEGACY_KEY_ID) ?? null)
          : null;

    if (activeKeyId && activeSecret && legacySecret === activeSecret) {
      throw new SignatureTimestampKeyringConfigurationError(
        'SIGNATURE_TIMESTAMP_ACTIVE_SECRET: MUST_DIFFER_FROM_LEGACY_SECRET',
      );
    }

    if (active && !verification.has(active.keyId)) {
      verification.set(active.keyId, active);
    }

    this.snapshot = { active, verification };
    return this.snapshot;
  }

  private readString(key: string): string | undefined {
    const value = this.configService.get<unknown>(key);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
