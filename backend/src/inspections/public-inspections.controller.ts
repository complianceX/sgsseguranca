import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { InspectionsService } from './inspections.service';
import { Throttle } from '@nestjs/throttler';
import { PublicValidationQueryDto } from '../common/dto/public-validation-query.dto';
import { PublicValidationGrantService } from '../common/services/public-validation-grant.service';

@Controller('public/inspections')
export class PublicInspectionsController {
  constructor(
    private readonly inspectionsService: InspectionsService,
    private readonly publicValidationGrantService: PublicValidationGrantService,
  ) {}

  @Get('validate')
  @Public()
  @TenantOptional()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async validateByCode(@Query() query: PublicValidationQueryDto) {
    const { code, token } = query;
    if (!code || !code.trim()) {
      throw new BadRequestException('Informe o código do documento.');
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!token || !token.trim()) {
      throw new BadRequestException('Token de validação ausente.');
    }

    try {
      const payload = await this.publicValidationGrantService.assertActiveToken(
        token.trim(),
        normalizedCode,
        'inspection_public_validation',
      );

      return this.inspectionsService.validateByCode(
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
