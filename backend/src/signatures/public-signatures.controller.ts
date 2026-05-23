import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { SignaturesService } from './signatures.service';

const VERIFY_THROTTLE_LIMIT = Number(
  process.env.SIGNATURE_VERIFY_THROTTLE_LIMIT || 3,
);
const VERIFY_THROTTLE_TTL = Number(
  process.env.SIGNATURE_VERIFY_THROTTLE_TTL || 60000,
);
const SHA256_RE = /^[a-f0-9]{64}$/i;

@Public()
@Controller('public/signature')
export class PublicSignaturesController {
  private readonly logger = new Logger(PublicSignaturesController.name);

  constructor(private readonly signaturesService: SignaturesService) {}

  @Throttle({
    default: { limit: VERIFY_THROTTLE_LIMIT, ttl: VERIFY_THROTTLE_TTL },
  })
  @Get('verify')
  verify(@Query('hash') hash: string) {
    const normalizedHash = String(hash || '').trim();
    if (!SHA256_RE.test(normalizedHash)) {
      throw new BadRequestException(
        'hash deve ser um SHA-256 hexadecimal válido (64 caracteres).',
      );
    }

    this.logger.log({
      event: 'public_signature_verify',
      hashPrefix: normalizedHash.slice(0, 8),
    });
    return this.signaturesService.verifyByHashPublic(normalizedHash);
  }
}
