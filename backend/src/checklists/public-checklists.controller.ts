import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { ChecklistsService } from './checklists.service';

@Controller('public/checklists')
export class PublicChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Get('validate')
  @Public()
  @TenantOptional()
  async validateByCode(@Query('code') code?: string) {
    if (!code || !code.trim()) {
      throw new BadRequestException('Informe o código do documento.');
    }
    return this.checklistsService.validateByCode(code.trim());
  }
}
