import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CatsService } from './cats.service';

@Controller('public/cats')
export class PublicCatsController {
  constructor(private readonly catsService: CatsService) {}

  @Get('validate')
  async validateByCode(@Query('code') code?: string) {
    if (!code?.trim()) {
      throw new BadRequestException(
        'Código da CAT é obrigatório para validação.',
      );
    }

    return this.catsService.validateByCode(code.trim());
  }
}
