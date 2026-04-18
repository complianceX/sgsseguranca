import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AprsService } from './aprs.service';

const VERIFICATION_CODE_RE = /^[A-Z0-9-]{6,24}$/;

@Public()
@Controller('public/aprs')
export class PublicAprVerificationController {
  constructor(private readonly aprsService: AprsService) {}

  @Get('verify')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  verify(@Query('code') code: string) {
    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase();

    if (!VERIFICATION_CODE_RE.test(normalizedCode)) {
      throw new BadRequestException(
        'code deve conter 6 a 24 caracteres alfanuméricos (A-Z, 0-9 e hífen).',
      );
    }

    return this.aprsService.verifyFinalPdfPublic(normalizedCode);
  }
}
