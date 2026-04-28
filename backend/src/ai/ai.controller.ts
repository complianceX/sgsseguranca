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
import { AiConsentGuard } from '../common/guards/ai-consent.guard';
import { UserThrottle } from '../common/decorators/user-throttle.decorator';
import { TenantThrottle } from '../common/decorators/tenant-throttle.decorator';
import { CreateAssistedChecklistDto } from './dto/create-assisted-checklist.dto';
import { CreateAssistedAprDto } from './dto/create-assisted-apr.dto';
import { CreateAssistedNonConformityDto } from './dto/create-assisted-nonconformity.dto';
import { CreateAssistedPtDto } from './dto/create-assisted-pt.dto';
import { CreateAssistedDdsDto, GenerateDdsDto } from './dto/generate-dds.dto';
import { GenerateSophieReportDto } from './dto/generate-sophie-report.dto';

@Controller('ai')
@UseGuards(
  FeatureAiGuard,
  JwtAuthGuard,
  AiConsentGuard,
  TenantGuard,
  RolesGuard,
)
@UseInterceptors(TenantInterceptor)
export class AiController {
  constructor(private readonly sophieFacade: SophieFacadeService) {}

  @Get('status')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  getStatus() {
    return this.sophieFacade.getStatus();
  }

  @Post('insights')
  @UserThrottle({ requestsPerMinute: 10 })
  @TenantThrottle({ requestsPerMinute: 60, requestsPerHour: 600 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async getInsights() {
    return this.sophieFacade.getInsights();
  }

  @Post('analyze-apr')
  @UserThrottle({ requestsPerMinute: 5 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 300 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async analyzeApr(@Body() body: AnalyzeAprDto) {
    return this.sophieFacade.analyzeApr(body.description);
  }

  @Post('analyze-pt')
  @UserThrottle({ requestsPerMinute: 5 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 300 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async analyzePt(@Body() body: AnalyzePtDto) {
    return this.sophieFacade.analyzePt(body);
  }

  @Get('analyze-checklist/:id')
  @UserThrottle({ requestsPerMinute: 5 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 300 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async analyzeChecklist(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.sophieFacade.analyzeChecklist(id);
  }

  @Post('generate-dds')
  @UserThrottle({ requestsPerMinute: 5 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 300 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_use_ai')
  async generateDds(@Body() body: GenerateDdsDto) {
    return this.sophieFacade.generateDds(body);
  }

  @Post('generate-checklist')
  @UserThrottle({ requestsPerMinute: 5 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 300 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async generateChecklist(@Body() body: GenerateChecklistDto) {
    return this.sophieFacade.generateChecklist(body);
  }

  @Post('generate-apr-draft')
  @UserThrottle({ requestsPerMinute: 5 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 300 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async generateAprDraft(@Body() body: CreateAssistedAprDto) {
    return this.sophieFacade.generateAprDraft(body);
  }

  /**
   * Sugere itens de risco estruturados (risk_items) para uma APR com base no
   * tipo de atividade. Retorna itens prontos para inserção no formulário de APR.
   *
   * POST /ai/apr/suggest-risk-items
   * Body: { tipo_atividade, descricao?, frente?, area? }
   */
  @Post('apr/suggest-risk-items')
  @UserThrottle({ requestsPerMinute: 10 })
  @TenantThrottle({ requestsPerMinute: 60, requestsPerHour: 600 })
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_use_ai')
  async suggestAprRiskItems(
    @Body()
    body: {
      tipo_atividade: string;
      descricao?: string;
      frente?: string;
      area?: string;
    },
  ) {
    return this.sophieFacade.suggestAprRiskItemsByActivityType({
      tipoAtividade: body.tipo_atividade,
      descricao: body.descricao,
      frente: body.frente,
      area: body.area,
    });
  }

  @Post('generate-pt-draft')
  @UserThrottle({ requestsPerMinute: 5 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 300 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async generatePtDraft(@Body() body: CreateAssistedPtDto) {
    return this.sophieFacade.generatePtDraft(body);
  }

  @Post('create-checklist')
  @UserThrottle({ requestsPerMinute: 5 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 300 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async createChecklist(@Body() body: CreateAssistedChecklistDto) {
    return this.sophieFacade.createChecklist(body);
  }

  @Post('create-dds')
  @UserThrottle({ requestsPerMinute: 5 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 300 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async createDds(@Body() body: CreateAssistedDdsDto) {
    return this.sophieFacade.createDds(body);
  }

  @Post('create-nonconformity')
  @UserThrottle({ requestsPerMinute: 5 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 300 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async createNonConformity(@Body() body: CreateAssistedNonConformityDto) {
    return this.sophieFacade.createNonConformity(body);
  }

  @Post('generate-monthly-report')
  @UserThrottle({ requestsPerMinute: 3 })
  @TenantThrottle({ requestsPerMinute: 10, requestsPerHour: 60 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async generateMonthlyReport(@Body() body: GenerateSophieReportDto) {
    return this.sophieFacade.queueMonthlyReport(body);
  }
}
