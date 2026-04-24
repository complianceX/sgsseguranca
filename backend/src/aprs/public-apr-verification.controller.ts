import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PublicValidationQueryDto } from '../common/dto/public-validation-query.dto';
import { PublicValidationGrantService } from '../common/services/public-validation-grant.service';
import { AprsService } from './aprs.service';

const VERIFICATION_CODE_RE = /^[A-Z0-9-]{6,24}$/;
const APR_PUBLIC_VALIDATION_PORTAL = 'apr_public_validation';

@Public()
@Controller('public/aprs')
export class PublicAprVerificationController {
  constructor(
    private readonly aprsService: AprsService,
    private readonly publicValidationGrantService: PublicValidationGrantService,
  ) {}

  @Get('verify')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async verify(@Query() query: PublicValidationQueryDto) {
    const { code, token } = query;
    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase();

    if (!VERIFICATION_CODE_RE.test(normalizedCode)) {
      throw new BadRequestException(
        'code deve conter 6 a 24 caracteres alfanuméricos (A-Z, 0-9 e hífen).',
      );
    }

    if (!token?.trim()) {
      throw new BadRequestException('Token de validação ausente.');
    }

    try {
      const payload = await this.publicValidationGrantService.assertActiveToken(
        token.trim(),
        normalizedCode,
        APR_PUBLIC_VALIDATION_PORTAL,
      );

      return this.aprsService.verifyFinalPdfPublic(
        normalizedCode,
        payload.companyId,
      );
    } catch {
      return {
        valid: false,
        message: 'Código inválido ou expirado.',
      };
    }
  }
}
