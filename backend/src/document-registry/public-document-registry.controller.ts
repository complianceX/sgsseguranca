import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { DocumentRegistryService } from './document-registry.service';

@Controller('public/documents')
export class PublicDocumentRegistryController {
  constructor(
    private readonly documentRegistryService: DocumentRegistryService,
  ) {}

  @Get('validate')
  @Public()
  @TenantOptional()
  async validateByCode(@Query('code') code?: string) {
    if (!code || !code.trim()) {
      throw new BadRequestException('Informe o código do documento.');
    }

    return this.documentRegistryService.validatePublicCode(code.trim());
  }
}
