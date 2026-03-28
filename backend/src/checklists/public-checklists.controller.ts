import { Controller, Get, Query, BadRequestException, Logger } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { ChecklistsService } from './checklists.service';
import { verifyValidationToken } from '../common/security/validation-token.util';
import { Throttle } from '@nestjs/throttler';
import {
  isPublicValidationContractLoggingEnabled,
  isPublicValidationLegacyCompatEnabled,
} from '../common/security/public-validation.config';
import { PublicValidationQueryDto } from '../common/dto/public-validation-query.dto';

@Controller('public/checklists')
export class PublicChecklistsController {
  private readonly logger = new Logger(PublicChecklistsController.name);

  constructor(private readonly checklistsService: ChecklistsService) {}

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
      if (!isPublicValidationLegacyCompatEnabled()) {
        throw new BadRequestException('Token de validação ausente.');
      }

      if (isPublicValidationContractLoggingEnabled()) {
        this.logger.warn({
          event: 'public_validation_legacy_contract',
          route: '/public/checklists/validate',
          codePrefix: normalizedCode.slice(0, 12),
        });
      }

      return this.checklistsService.validateByCodeLegacy(normalizedCode);
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

    return this.checklistsService.validateByCode(normalizedCode, payload.companyId);
  }
}
