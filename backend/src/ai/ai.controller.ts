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
import { AiService } from './ai.service';
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
  constructor(private readonly aiService: AiService) {}

  @Post('insights')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async getInsights() {
    return this.aiService.getInsights();
  }

  @Post('analyze-apr')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async analyzeApr(@Body() body: AnalyzeAprDto) {
    return this.aiService.analyzeApr(body.description);
  }

  @Post('analyze-pt')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async analyzePt(@Body() body: AnalyzePtDto) {
    return this.aiService.analyzePt(body as any);
  }

  @Get('analyze-checklist/:id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async analyzeChecklist(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.aiService.analyzeChecklist(id);
  }

  @Post('generate-dds')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async generateDds() {
    return this.aiService.generateDds();
  }

  @Post('generate-checklist')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async generateChecklist(@Body() body: GenerateChecklistDto) {
    return this.aiService.generateChecklist(body as any);
  }
}
