import { Controller, Get, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { Authorize } from '../auth/authorize.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Authorize('can_view_dashboard')
  getSummary(
    @Req()
    req: { user?: { company_id?: string }; tenant?: { companyId?: string } },
  ) {
    return this.dashboardService.getSummary(
      req.tenant?.companyId || req.user?.company_id || '',
    );
  }

  @Get('kpis')
  @Authorize('can_view_dashboard')
  getKpis(
    @Req()
    req: { user?: { company_id?: string }; tenant?: { companyId?: string } },
  ) {
    return this.dashboardService.getKpis(
      req.tenant?.companyId || req.user?.company_id || '',
    );
  }

  @Get('heatmap')
  @Authorize('can_view_dashboard')
  getHeatmap(
    @Req()
    req: { user?: { company_id?: string }; tenant?: { companyId?: string } },
  ) {
    return this.dashboardService.getHeatmap(
      req.tenant?.companyId || req.user?.company_id || '',
    );
  }

  @Get('tst-day')
  @Authorize('can_view_dashboard')
  getTstDay(
    @Req()
    req: { user?: { company_id?: string }; tenant?: { companyId?: string } },
  ) {
    return this.dashboardService.getTstDay(
      req.tenant?.companyId || req.user?.company_id || '',
    );
  }

  @Get('pending-queue')
  @Authorize('can_view_dashboard')
  getPendingQueue(
    @Req()
    req: { user?: { company_id?: string }; tenant?: { companyId?: string } },
  ) {
    return this.dashboardService.getPendingQueue(
      req.tenant?.companyId || req.user?.company_id || '',
    );
  }
}
