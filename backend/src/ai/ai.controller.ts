import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SophieFacadeService } from './sophie-facade.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { AnalyzePtDto } from './dto/analyze-pt.dto';
import { GenerateChecklistDto } from './dto/generate-checklist.dto';
import { AnalyzeAprDto } from './dto/analyze-apr.dto';
import { Authorize } from '../auth/authorize.decorator';
import { FeatureAiGuard } from '../common/guards/feature-ai.guard';

@Controller('ai')
@UseGuards(FeatureAiGuard, JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class AiController {
  constructor(private readonly sophieFacade: SophieFacadeService) {}

  @Get('status')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async getStatus() {
    return this.sophieFacade.getStatus();
  }

  @Post('insights')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async getInsights() {
    return this.sophieFacade.getInsights();
  }

  @Post('analyze-apr')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async analyzeApr(@Body() body: AnalyzeAprDto) {
    return this.sophieFacade.analyzeApr(body.description);
  }

  @Post('analyze-pt')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async analyzePt(@Body() body: AnalyzePtDto) {
    return this.sophieFacade.analyzePt(body);
  }

  @Get('analyze-checklist/:id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async analyzeChecklist(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.sophieFacade.analyzeChecklist(id);
  }

  @Post('generate-dds')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async generateDds() {
    return this.sophieFacade.generateDds();
  }

  @Post('generate-checklist')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async generateChecklist(@Body() body: GenerateChecklistDto) {
    return this.sophieFacade.generateChecklist(body);
  }
}
