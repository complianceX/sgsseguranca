import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import {
  SIGNATURE_TIMESTAMP_AUTHORITY,
  SIGNATURE_TIMESTAMP_LEGACY_KEY_ID,
  SIGNATURE_TIMESTAMP_TOKEN_VERSION,
} from './signature-timestamp-keyring.contract';
import { SignatureTimestampKeyringService } from './signature-timestamp-keyring.service';

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const HMAC_HEX_PATTERN = SHA256_HEX_PATTERN;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const SIGNATURE_TIMESTAMP_VERIFICATION_STATUS = {
  VALID: 'VALID',
  INVALID: 'INVALID',
  LEGACY_KEY_UNAVAILABLE: 'LEGACY_KEY_UNAVAILABLE',
  NOT_TOKENIZED: 'NOT_TOKENIZED',
  NOT_FOUND: 'NOT_FOUND',
} as const;

export type SignatureTimestampVerificationStatus =
  (typeof SIGNATURE_TIMESTAMP_VERIFICATION_STATUS)[keyof typeof SIGNATURE_TIMESTAMP_VERIFICATION_STATUS];

export type SignatureTimestampVerificationMetadata = {
  signature_key_id?: string | null;
  timestamp_token_version?: string | null;
  timestamp_authority?: string | null;
};

export interface TimestampStamp {
  signature_hash: string;
  timestamp_token: string;
  timestamp_issued_at: string;
  timestamp_authority: string;
  timestamp_token_version: string;
  signature_key_id: string;
}

export interface TimestampVerificationResult {
  status: SignatureTimestampVerificationStatus;
}

@Injectable()
export class SignatureTimestampService {
  private readonly fallbackKeyring: SignatureTimestampKeyringService;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    private readonly injectedKeyring?: SignatureTimestampKeyringService,
  ) {
    this.fallbackKeyring = new SignatureTimestampKeyringService(
      this.configService,
    );
  }

  issueFromRaw(rawPayload: string): TimestampStamp {
    if (typeof rawPayload !== 'string') {
      throw new TypeError('rawPayload must be a string');
    }

    const signatureHash = createHash('sha256').update(rawPayload).digest('hex');
    return this.issueFromHash(signatureHash);
  }

  issueFromHash(signatureHash: string, issuedAt?: string): TimestampStamp {
    this.assertCanonicalHash(signatureHash);
    const timestampIssuedAt = issuedAt ?? new Date().toISOString();
    this.assertCanonicalTimestamp(timestampIssuedAt);

    const activeKey = this.getKeyring().getActiveSigningKey();
    if (!activeKey) {
      throw new Error('Missing SIGNATURE_TIMESTAMP_SECRET');
    }

    const tokenSignature = this.sign(
      signatureHash,
      timestampIssuedAt,
      activeKey.secret,
    );
    return {
      signature_hash: signatureHash,
      timestamp_token: `${timestampIssuedAt}.${tokenSignature}`,
      timestamp_issued_at: timestampIssuedAt,
      timestamp_authority: SIGNATURE_TIMESTAMP_AUTHORITY,
      timestamp_token_version: SIGNATURE_TIMESTAMP_TOKEN_VERSION,
      signature_key_id: activeKey.keyId,
    };
  }

  verify(signatureHash: string, timestampToken: string): boolean {
    return (
      this.verifyDetailed(signatureHash, timestampToken).status ===
      SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.VALID
    );
  }

  verifyDetailed(
    signatureHash: string,
    timestampToken: string | null | undefined,
    metadata: SignatureTimestampVerificationMetadata = {},
  ): TimestampVerificationResult {
    if (
      timestampToken === null ||
      timestampToken === undefined ||
      timestampToken === ''
    ) {
      return { status: SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.NOT_TOKENIZED };
    }
    if (
      !this.isCanonicalHash(signatureHash) ||
      typeof timestampToken !== 'string'
    ) {
      return { status: SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID };
    }
    if (
      metadata.timestamp_token_version &&
      metadata.timestamp_token_version !== SIGNATURE_TIMESTAMP_TOKEN_VERSION
    ) {
      return { status: SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID };
    }
    if (
      metadata.timestamp_authority &&
      metadata.timestamp_authority !== SIGNATURE_TIMESTAMP_AUTHORITY
    ) {
      return { status: SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID };
    }

    const dotIndex = timestampToken.lastIndexOf('.');
    if (dotIndex <= 0 || dotIndex >= timestampToken.length - 1) {
      return { status: SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID };
    }

    const timestampIssuedAt = timestampToken.slice(0, dotIndex);
    const tokenSignature = timestampToken.slice(dotIndex + 1);
    if (
      !this.isCanonicalTimestamp(timestampIssuedAt) ||
      !HMAC_HEX_PATTERN.test(tokenSignature)
    ) {
      return { status: SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID };
    }

    const keyId =
      metadata.signature_key_id?.trim() || SIGNATURE_TIMESTAMP_LEGACY_KEY_ID;
    const verificationKey = this.getKeyring().getVerificationKey(keyId);

    if (!verificationKey) {
      return {
        status:
          keyId === SIGNATURE_TIMESTAMP_LEGACY_KEY_ID
            ? SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.LEGACY_KEY_UNAVAILABLE
            : SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID,
      };
    }

    try {
      const expected = this.sign(
        signatureHash,
        timestampIssuedAt,
        verificationKey.secret,
      );
      const actualBuffer = Buffer.from(tokenSignature, 'utf8');
      const expectedBuffer = Buffer.from(expected, 'utf8');
      if (actualBuffer.length !== expectedBuffer.length) {
        return { status: SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID };
      }
      return {
        status: timingSafeEqual(actualBuffer, expectedBuffer)
          ? SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.VALID
          : SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID,
      };
    } catch {
      return { status: SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID };
    }
  }

  private isCanonicalHash(value: unknown): value is string {
    return typeof value === 'string' && SHA256_HEX_PATTERN.test(value);
  }

  private assertCanonicalHash(value: unknown): asserts value is string {
    if (!this.isCanonicalHash(value)) {
      throw new TypeError(
        'signatureHash must be a lowercase SHA-256 hex digest',
      );
    }
  }

  private isCanonicalTimestamp(value: unknown): value is string {
    if (typeof value !== 'string' || !UTC_TIMESTAMP_PATTERN.test(value)) {
      return false;
    }

    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
  }

  private assertCanonicalTimestamp(value: unknown): asserts value is string {
    if (!this.isCanonicalTimestamp(value)) {
      throw new TypeError(
        'issuedAt must be a valid UTC timestamp in canonical ISO-8601 format',
      );
    }
  }

  private sign(
    signatureHash: string,
    timestampIssuedAt: string,
    secret: string,
  ): string {
    return createHmac('sha256', secret)
      .update(`${signatureHash}.${timestampIssuedAt}`)
      .digest('hex');
  }

  private getKeyring(): SignatureTimestampKeyringService {
    return this.injectedKeyring ?? this.fallbackKeyring;
  }
}
