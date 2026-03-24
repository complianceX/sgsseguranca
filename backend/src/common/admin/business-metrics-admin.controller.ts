import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/enums/roles.enum';
import { TenantOptional } from '../decorators/tenant-optional.decorator';
import { BusinessMetricsSummaryService } from '../observability/business-metrics-summary.service';

@Controller('admin/metrics')
@TenantOptional()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_GERAL)
export class BusinessMetricsAdminController {
  constructor(
    private readonly businessMetricsSummaryService: BusinessMetricsSummaryService,
  ) {}

  @Get('business')
  async getBusinessMetrics() {
    return this.businessMetricsSummaryService.getBusinessSummaryByTenant();
  }
}
