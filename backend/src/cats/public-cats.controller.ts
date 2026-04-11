import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { PublicValidationQueryDto } from '../common/dto/public-validation-query.dto';
import {
  isPublicValidationContractLoggingEnabled,
  isPublicValidationLegacyCompatEnabled,
} from '../common/security/public-validation.config';
import { verifyValidationToken } from '../common/security/validation-token.util';
import { CatsService } from './cats.service';

@Controller('public/cats')
export class PublicCatsController {
  private readonly logger = new Logger(PublicCatsController.name);

  constructor(private readonly catsService: CatsService) {}

  @Get('validate')
  @Public()
  @TenantOptional()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async validateByCode(@Query() query: PublicValidationQueryDto) {
    const { code, token } = query;
    if (!code?.trim()) {
      throw new BadRequestException(
        'Código da CAT é obrigatório para validação.',
      );
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!token || !token.trim()) {
      if (!isPublicValidationLegacyCompatEnabled()) {
        throw new BadRequestException('Token de validação ausente.');
      }

      if (isPublicValidationContractLoggingEnabled()) {
        this.logger.warn({
          event: 'public_validation_legacy_contract',
          route: '/public/cats/validate',
          codePrefix: normalizedCode.slice(0, 12),
        });
      }

      return this.catsService.validateByCodeLegacy(normalizedCode);
    }

    let payload: { code: string; companyId: string };
    try {
      payload = verifyValidationToken(token.trim());
    } catch {
      return {
        valid: false,
        code: normalizedCode,
        message: 'Código inválido ou expirado.',
      };
    }

    if (payload.code.toUpperCase() !== normalizedCode) {
      return {
        valid: false,
        code: normalizedCode,
        message: 'Código inválido ou expirado.',
      };
    }

    return this.catsService.validateByCode(normalizedCode, payload.companyId);
  }
}
