import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { Authorize } from '../auth/authorize.decorator';
import { TenantThrottle } from '../common/decorators/tenant-throttle.decorator';
import { UserThrottle } from '../common/decorators/user-throttle.decorator';
import {
  parseRateLimit,
  resolveHourlyRateLimit,
} from '../common/rate-limit/rate-limit-config.util';
import { DashboardQueryType } from './dashboard-query.types';
import { DashboardService } from './dashboard.service';
import { DashboardDocumentPendenciesQueryDto } from './dto/dashboard-document-pendencies-query.dto';
import { ResolveDocumentPendencyActionDto } from './dto/resolve-document-pendency-action.dto';

const DASHBOARD_VIEW_ROLES = [
  Role.ADMIN_GERAL,
  Role.ADMIN_EMPRESA,
  Role.TST,
  Role.SUPERVISOR,
  Role.COLABORADOR,
  Role.TRABALHADOR,
] as const;

const DASHBOARD_IMPORT_RETRY_ROLES = [
  Role.ADMIN_GERAL,
  Role.ADMIN_EMPRESA,
  Role.TST,
  Role.SUPERVISOR,
] as const;

const DASHBOARD_SUMMARY_TENANT_THROTTLE_LIMIT = parseRateLimit(
  process.env.DASHBOARD_SUMMARY_TENANT_THROTTLE_LIMIT,
  120,
);
const DASHBOARD_SUMMARY_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyRateLimit(
  process.env.DASHBOARD_SUMMARY_TENANT_THROTTLE_HOUR_LIMIT,
  DASHBOARD_SUMMARY_TENANT_THROTTLE_LIMIT,
);
const DASHBOARD_SUMMARY_USER_THROTTLE_LIMIT = parseRateLimit(
  process.env.DASHBOARD_SUMMARY_USER_THROTTLE_LIMIT,
  60,
);

const DASHBOARD_KPIS_TENANT_THROTTLE_LIMIT = parseRateLimit(
  process.env.DASHBOARD_KPIS_TENANT_THROTTLE_LIMIT,
  120,
);
const DASHBOARD_KPIS_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyRateLimit(
  process.env.DASHBOARD_KPIS_TENANT_THROTTLE_HOUR_LIMIT,
  DASHBOARD_KPIS_TENANT_THROTTLE_LIMIT,
);
const DASHBOARD_KPIS_USER_THROTTLE_LIMIT = parseRateLimit(
  process.env.DASHBOARD_KPIS_USER_THROTTLE_LIMIT,
  60,
);

const DASHBOARD_INVALIDATE_TENANT_THROTTLE_LIMIT = parseRateLimit(
  process.env.DASHBOARD_INVALIDATE_TENANT_THROTTLE_LIMIT,
  10,
);
const DASHBOARD_INVALIDATE_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyRateLimit(
  process.env.DASHBOARD_INVALIDATE_TENANT_THROTTLE_HOUR_LIMIT,
  DASHBOARD_INVALIDATE_TENANT_THROTTLE_LIMIT,
);
const DASHBOARD_INVALIDATE_USER_THROTTLE_LIMIT = parseRateLimit(
  process.env.DASHBOARD_INVALIDATE_USER_THROTTLE_LIMIT,
  5,
);

@Controller('dashboard')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Resolve o companyId da requisicao priorizando o contexto de tenant injetado
   * pelo TenantInterceptor. Cai para o claim JWT apenas como ultimo recurso e
   * emite um aviso para facilitar diagnostico de misconfiguracao.
   */
  private resolveCompanyId(req: {
    user?: { company_id?: string };
    tenant?: { companyId?: string };
  }): string {
    if (req.tenant?.companyId) {
      return req.tenant.companyId;
    }
    if (req.user?.company_id) {
      this.logger.warn(
        'companyId resolvido via JWT claim (req.user.company_id) — TenantInterceptor nao populou req.tenant. Verifique a configuracao do TenantGuard.',
      );
      return req.user.company_id;
    }
    return '';
  }

  /**
   * Verifica se o usuario e super-admin comparando a role pelo enum, evitando
   * dependencia de string de nome de perfil.
   */
  private resolveIsSuperAdmin(req: {
    user?: { roles?: string[]; profile?: { nome?: string } };
  }): boolean {
    return req.user?.roles?.includes(Role.ADMIN_GERAL) ?? false;
  }

  @Get('summary')
  @Roles(...DASHBOARD_VIEW_ROLES)
  @Authorize('can_view_dashboard')
  @UserThrottle({ requestsPerMinute: DASHBOARD_SUMMARY_USER_THROTTLE_LIMIT })
  @TenantThrottle({
    requestsPerMinute: DASHBOARD_SUMMARY_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DASHBOARD_SUMMARY_TENANT_THROTTLE_HOUR_LIMIT,
  })
  getSummary(
    @Req()
    req: {
      user?: { company_id?: string };
      tenant?: { companyId?: string };
    },
  ) {
    return this.dashboardService.getSummary(this.resolveCompanyId(req));
  }

  @Get('kpis')
  @Roles(...DASHBOARD_VIEW_ROLES)
  @Authorize('can_view_dashboard')
  @UserThrottle({ requestsPerMinute: DASHBOARD_KPIS_USER_THROTTLE_LIMIT })
  @TenantThrottle({
    requestsPerMinute: DASHBOARD_KPIS_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DASHBOARD_KPIS_TENANT_THROTTLE_HOUR_LIMIT,
  })
  getKpis(
    @Req()
    req: {
      user?: { id?: string; userId?: string; company_id?: string };
      tenant?: { companyId?: string };
    },
  ) {
    return this.dashboardService.getKpis(
      this.resolveCompanyId(req),
      req.user?.userId || req.user?.id,
    );
  }

  @Get('heatmap')
  @Roles(...DASHBOARD_VIEW_ROLES)
  @Authorize('can_view_dashboard')
  getHeatmap(
    @Req()
    req: {
      user?: { company_id?: string };
      tenant?: { companyId?: string };
    },
  ) {
    return this.dashboardService.getHeatmap(this.resolveCompanyId(req));
  }

  @Get('tst-day')
  @Roles(...DASHBOARD_VIEW_ROLES)
  @Authorize('can_view_dashboard')
  getTstDay(
    @Req()
    req: {
      user?: { company_id?: string };
      tenant?: { companyId?: string };
    },
  ) {
    return this.dashboardService.getTstDay(this.resolveCompanyId(req));
  }

  @Get('pending-queue')
  @Roles(...DASHBOARD_VIEW_ROLES)
  @Authorize('can_view_dashboard')
  getPendingQueue(
    @Req()
    req: {
      user?: { id?: string; userId?: string; company_id?: string };
      tenant?: { companyId?: string };
    },
  ) {
    return this.dashboardService.getPendingQueue({
      companyId: this.resolveCompanyId(req),
      userId: req.user?.userId || req.user?.id,
    });
  }

  @Get('document-pendencies')
  @Roles(...DASHBOARD_VIEW_ROLES)
  @Authorize('can_view_dashboard')
  getDocumentPendencies(
    @Req()
    req: {
      user?: {
        id?: string;
        userId?: string;
        company_id?: string;
        permissions?: string[];
        roles?: string[];
      };
      tenant?: { companyId?: string };
    },
    @Query()
    query: DashboardDocumentPendenciesQueryDto,
  ) {
    return this.dashboardService.getDocumentPendencies({
      companyId: this.resolveCompanyId(req),
      userId: req.user?.userId || req.user?.id,
      isSuperAdmin: this.resolveIsSuperAdmin(req),
      permissions: req.user?.permissions || [],
      filters: {
        siteId: query.siteId,
        module: query.module,
        priority: query.priority,
        criticality: query.criticality,
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page,
        limit: query.limit,
      },
    });
  }

  @Post('document-pendencies/actions/resolve')
  @HttpCode(HttpStatus.OK)
  @Roles(...DASHBOARD_VIEW_ROLES)
  @Authorize('can_view_dashboard')
  resolveDocumentPendencyAction(
    @Req()
    req: {
      user?: {
        id?: string;
        userId?: string;
        company_id?: string;
        permissions?: string[];
      };
      tenant?: { companyId?: string };
    },
    @Body() body: ResolveDocumentPendencyActionDto,
  ) {
    return this.dashboardService.resolveDocumentPendencyAction({
      actionKey: body.actionKey,
      module: body.module,
      documentId: body.documentId,
      attachmentId: body.attachmentId,
      attachmentIndex: body.attachmentIndex,
      companyId: this.resolveCompanyId(req),
      actorId: req.user?.userId || req.user?.id,
      permissions: req.user?.permissions || [],
    });
  }

  @Post('document-pendencies/imports/:id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(...DASHBOARD_IMPORT_RETRY_ROLES)
  @Authorize('can_import_documents')
  retryDocumentPendencyImport(
    @Req()
    req: {
      user?: {
        id?: string;
        userId?: string;
        permissions?: string[];
      };
    },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.dashboardService.retryDocumentPendencyImport({
      documentId: id,
      actorId: req.user?.userId || req.user?.id,
      permissions: req.user?.permissions || [],
    });
  }

  @Post('invalidate')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  @Authorize('can_view_dashboard')
  @UserThrottle({ requestsPerMinute: DASHBOARD_INVALIDATE_USER_THROTTLE_LIMIT })
  @TenantThrottle({
    requestsPerMinute: DASHBOARD_INVALIDATE_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DASHBOARD_INVALIDATE_TENANT_THROTTLE_HOUR_LIMIT,
  })
  invalidateDashboardCache(
    @Req()
    req: {
      user?: { company_id?: string };
      tenant?: { companyId?: string };
    },
    @Body()
    body?: {
      queryType?: DashboardQueryType;
    },
  ) {
    return this.dashboardService.invalidateDashboardCache(
      this.resolveCompanyId(req),
      body?.queryType,
    );
  }
}
