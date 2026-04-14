import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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

@Controller('dashboard')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

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
    return this.dashboardService.getSummary(
      req.tenant?.companyId || req.user?.company_id || '',
    );
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
      req.tenant?.companyId || req.user?.company_id || '',
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
    return this.dashboardService.getHeatmap(
      req.tenant?.companyId || req.user?.company_id || '',
    );
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
    return this.dashboardService.getTstDay(
      req.tenant?.companyId || req.user?.company_id || '',
    );
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
      companyId: req.tenant?.companyId || req.user?.company_id || '',
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
        profile?: { nome?: string };
      };
      tenant?: { companyId?: string };
    },
    @Query()
    query: {
      companyId?: string;
      siteId?: string;
      module?: string;
      priority?: string;
      criticality?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: string;
      limit?: string;
    },
  ) {
    return this.dashboardService.getDocumentPendencies({
      companyId: req.tenant?.companyId || req.user?.company_id || '',
      userId: req.user?.userId || req.user?.id,
      isSuperAdmin: req.user?.profile?.nome === 'Administrador Geral',
      permissions: req.user?.permissions || [],
      filters: {
        companyId: query.companyId,
        siteId: query.siteId,
        module: query.module,
        priority: query.priority,
        criticality: query.criticality,
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
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
      companyId: req.tenant?.companyId || req.user?.company_id || '',
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
      req.tenant?.companyId || req.user?.company_id || '',
      body?.queryType,
    );
  }
}
