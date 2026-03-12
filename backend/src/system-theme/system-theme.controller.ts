import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { SystemThemeService } from './system-theme.service';
import { UpdateSystemThemeDto } from './dto/update-system-theme.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { Public } from '../common/decorators/public.decorator';
import { type SystemThemePresetId } from './system-theme.presets';

@Controller('system-theme')
export class SystemThemeController {
  constructor(private readonly service: SystemThemeService) {}

  @Public()
  @Get('presets')
  getPresets() {
    return this.service.getPresets();
  }

  @Public()
  @Sse('stream')
  streamTheme() {
    return this.service.streamTheme();
  }

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
  @Post('presets/:presetId/apply')
  applyPreset(@Param('presetId') presetId: SystemThemePresetId) {
    return this.service.applyPreset(presetId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_GERAL)
  @Post('reset')
  resetTheme() {
    return this.service.resetTheme();
  }
}
