import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { Authorize } from '../auth/authorize.decorator';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { SophieAnalyzeDto } from './dto/sophie-analyze.dto';
import { SophieEngineService } from './sophie.engine.service';
import { FeatureAiGuard } from '../common/guards/feature-ai.guard';

/**
 * SOPHIE (local) - endpoints de análise por base de conhecimento interna.
 * Global (não-tenant-specific), mas mantém guard padrão para uso autenticado no sistema.
 */
@Controller('sophie')
@UseGuards(FeatureAiGuard, JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class SophieController {
  constructor(private readonly sophie: SophieEngineService) {}

  @Get('version')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  getVersion() {
    return this.sophie.getVersion();
  }

  @Post('analyze')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  analyze(@Body() dto: SophieAnalyzeDto) {
    return this.sophie.analyze({
      atividade: dto.atividade,
      setor: dto.setor,
      maquina: dto.maquina,
      processo: dto.processo,
      material: dto.material,
      ambiente: dto.ambiente,
      probabilidade: dto.probabilidade,
      severidade: dto.severidade,
    });
  }
}
