import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { DossiersService } from './dossiers.service';

@Controller('public/dossiers')
export class PublicDossiersController {
  constructor(private readonly dossiersService: DossiersService) {}

  @Get('validate')
  async validateByCode(@Query('code') code?: string) {
    if (!code?.trim()) {
      throw new BadRequestException(
        'Código do dossiê é obrigatório para validação.',
      );
    }

    return this.dossiersService.validateByCode(code.trim());
  }
}
