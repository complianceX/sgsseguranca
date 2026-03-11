import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SystemThemeService } from './system-theme.service';
import { UpdateSystemThemeDto } from './dto/update-system-theme.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { Public } from '../common/decorators/public.decorator';

@Controller('system-theme')
export class SystemThemeController {
  constructor(private readonly service: SystemThemeService) {}

  /** Público — frontend carrega o tema sem autenticação */
  @Public()
  @Get()
  getTheme() {
    return this.service.getTheme();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_GERAL)
  @Patch()
  updateTheme(@Body() dto: UpdateSystemThemeDto) {
    return this.service.updateTheme(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_GERAL)
  @Post('reset')
  resetTheme() {
    return this.service.resetTheme();
  }
}
