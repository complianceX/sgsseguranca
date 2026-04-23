import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { PublicValidationQueryDto } from '../common/dto/public-validation-query.dto';
import { PublicValidationGrantService } from '../common/services/public-validation-grant.service';
import { DossiersService } from './dossiers.service';

@Controller('public/dossiers')
export class PublicDossiersController {
  constructor(
    private readonly dossiersService: DossiersService,
    private readonly publicValidationGrantService: PublicValidationGrantService,
  ) {}

  @Get('validate')
  @Public()
  @TenantOptional()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async validateByCode(@Query() query: PublicValidationQueryDto) {
    const { code, token } = query;
    if (!code?.trim()) {
      throw new BadRequestException(
        'Código do dossiê é obrigatório para validação.',
      );
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!token || !token.trim()) {
      throw new BadRequestException('Token de validação ausente.');
    }

    try {
      const payload = await this.publicValidationGrantService.assertActiveToken(
        token.trim(),
        normalizedCode,
        'dossier_public_validation',
      );

      return this.dossiersService.validateByCode(
        normalizedCode,
        payload.companyId,
      );
    } catch {
      return {
        valid: false,
        code: normalizedCode,
        message: 'Código inválido ou expirado.',
      };
    }
  }
}
