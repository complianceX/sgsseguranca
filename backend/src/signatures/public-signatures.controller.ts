import { Controller, Get, Query, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { SignaturesService } from './signatures.service';
import { PublicSignatureVerifyQueryDto } from './dto/public-signature-verify-query.dto';

const VERIFY_THROTTLE_LIMIT = Number(
  process.env.SIGNATURE_VERIFY_THROTTLE_LIMIT || 3,
);
const VERIFY_THROTTLE_TTL = Number(
  process.env.SIGNATURE_VERIFY_THROTTLE_TTL || 60000,
);
@Public()
@Controller('public/signature')
export class PublicSignaturesController {
  private readonly logger = new Logger(PublicSignaturesController.name);

  constructor(private readonly signaturesService: SignaturesService) {}

  @Throttle({
    default: { limit: VERIFY_THROTTLE_LIMIT, ttl: VERIFY_THROTTLE_TTL },
  })
  @Get('verify')
  verify(@Query() query: PublicSignatureVerifyQueryDto) {
    const normalizedHash = query.hash;
    this.logger.log({
      event: 'public_signature_verify',
      hashPrefix: normalizedHash.slice(0, 8),
    });
    return this.signaturesService.verifyByHashPublic(normalizedHash);
  }
}
