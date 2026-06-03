import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

export interface TimestampStamp {
  signature_hash: string;
  timestamp_token: string;
  timestamp_issued_at: string;
  timestamp_authority: string;
}

@Injectable()
export class SignatureTimestampService {
  private static readonly AUTHORITY = 'internal-hmac-v1';

  constructor(private readonly configService: ConfigService) {}

  issueFromRaw(rawPayload: string): TimestampStamp {
    const signatureHash = createHash('sha256').update(rawPayload).digest('hex');
    return this.issueFromHash(signatureHash);
  }

  issueFromHash(signatureHash: string, issuedAt?: string): TimestampStamp {
    const timestampIssuedAt = issuedAt || new Date().toISOString();
    const tokenSignature = this.sign(signatureHash, timestampIssuedAt);
    return {
      signature_hash: signatureHash,
      timestamp_token: `${timestampIssuedAt}.${tokenSignature}`,
      timestamp_issued_at: timestampIssuedAt,
      timestamp_authority: SignatureTimestampService.AUTHORITY,
    };
  }

  verify(signatureHash: string, timestampToken: string): boolean {
    const dotIndex = timestampToken.indexOf('.');
    if (dotIndex <= 0 || dotIndex >= timestampToken.length - 1) {
      return false;
    }

    const timestampIssuedAt = timestampToken.slice(0, dotIndex);
    const tokenSignature = timestampToken.slice(dotIndex + 1);
    const expected = this.sign(signatureHash, timestampIssuedAt);

    try {
      const actualBuffer = Buffer.from(tokenSignature, 'utf8');
      const expectedBuffer = Buffer.from(expected, 'utf8');
      if (actualBuffer.length !== expectedBuffer.length) {
        return false;
      }
      return timingSafeEqual(actualBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  private sign(signatureHash: string, timestampIssuedAt: string): string {
    return createHmac('sha256', this.getSecret())
      .update(`${signatureHash}.${timestampIssuedAt}`)
      .digest('hex');
  }

  private getSecret(): string {
    const secret =
      this.configService.get<string>('SIGNATURE_TIMESTAMP_SECRET') ||
      this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('Missing SIGNATURE_TIMESTAMP_SECRET or JWT_SECRET');
    }
    return secret;
  }
}
