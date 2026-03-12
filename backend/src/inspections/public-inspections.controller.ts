import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { InspectionsService } from './inspections.service';

@Controller('public/inspections')
export class PublicInspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Get('validate')
  @Public()
  async validateByCode(@Query('code') code?: string) {
    if (!code || !code.trim()) {
      throw new BadRequestException('Informe o código do documento.');
    }
    return this.inspectionsService.validateByCode(code.trim());
  }
}
