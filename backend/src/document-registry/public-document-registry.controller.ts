import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { DocumentRegistryService } from './document-registry.service';
import { Throttle } from '@nestjs/throttler';
import { PublicValidationQueryDto } from '../common/dto/public-validation-query.dto';
import { PublicValidationGrantService } from '../common/services/public-validation-grant.service';

const DOCUMENT_REGISTRY_VALIDATION_PORTALS = [
  'document_public_validation',
  'dds_public_validation',
  'cat_public_validation',
  'checklist_public_validation',
  'inspection_public_validation',
  'dossier_public_validation',
];

@Controller('public/documents')
export class PublicDocumentRegistryController {
  constructor(
    private readonly documentRegistryService: DocumentRegistryService,
    private readonly publicValidationGrantService: PublicValidationGrantService,
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
      throw new BadRequestException('Token de validação ausente.');
    }

    try {
      const payload = await this.publicValidationGrantService.assertActiveToken(
        token.trim(),
        normalizedCode,
        DOCUMENT_REGISTRY_VALIDATION_PORTALS,
      );

      return this.documentRegistryService.validatePublicCode({
        code: normalizedCode,
        companyId: payload.companyId,
      });
    } catch {
      return {
        valid: false,
        code: normalizedCode,
        message: 'Código inválido ou expirado.',
      };
    }
  }
}
