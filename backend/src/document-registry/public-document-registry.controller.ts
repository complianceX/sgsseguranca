import { BadRequestException, Controller, Get, Logger, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { DocumentRegistryService } from './document-registry.service';
import { verifyValidationToken } from '../common/security/validation-token.util';
import { Throttle } from '@nestjs/throttler';
import {
  isPublicValidationContractLoggingEnabled,
  isPublicValidationLegacyCompatEnabled,
} from '../common/security/public-validation.config';
import { PublicValidationQueryDto } from '../common/dto/public-validation-query.dto';

@Controller('public/documents')
export class PublicDocumentRegistryController {
  private readonly logger = new Logger(PublicDocumentRegistryController.name);

  constructor(
    private readonly documentRegistryService: DocumentRegistryService,
  ) {}

  @Get('validate')
  @Public()
  @TenantOptional()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async validateByCode(@Query() query: PublicValidationQueryDto) {
    const { code, token } = query;
    if (!code || !code.trim()) {
      throw new BadRequestException('Código ausente.');
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!token || !token.trim()) {
      if (!isPublicValidationLegacyCompatEnabled()) {
        throw new BadRequestException('Token de validação ausente.');
      }

      if (isPublicValidationContractLoggingEnabled()) {
        this.logger.warn({
          event: 'public_validation_legacy_contract',
          route: '/public/documents/validate',
          codePrefix: normalizedCode.slice(0, 12),
        });
      }

      return this.documentRegistryService.validateLegacyPublicCode({
        code: normalizedCode,
      });
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

    // Fail-closed se token não corresponder ao código informado
    if (payload.code.toUpperCase() !== normalizedCode) {
      return {
        valid: false,
        code: normalizedCode,
        message: 'Código inválido ou expirado.',
      };
    }

    return this.documentRegistryService.validatePublicCode({
      code: normalizedCode,
      companyId: payload.companyId,
    });
  }
}
