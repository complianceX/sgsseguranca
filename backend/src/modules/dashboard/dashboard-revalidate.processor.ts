import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { DashboardService } from './dashboard.service';
import {
  DASHBOARD_QUERY_TYPES,
  type DashboardQueryType,
} from './dashboard-query.types';
import { TenantService } from '../../shared/tenant/tenant.service';

type DashboardRevalidateJobData = {
  companyId: string;
  queryType: DashboardQueryType;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DASHBOARD_QUERY_TYPE_SET = new Set<DashboardQueryType>(
  DASHBOARD_QUERY_TYPES,
);

@Processor('dashboard-revalidate', { concurrency: 1 })
export class DashboardRevalidateProcessor extends WorkerHost {
  private readonly logger = new Logger(DashboardRevalidateProcessor.name);

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly tenantService: TenantService,
  ) {
    super();
  }

  async process(job: Job<DashboardRevalidateJobData>): Promise<void> {
    const companyId = String(job.data?.companyId || '').trim();
    const queryType = job.data?.queryType;

    if (
      !UUID_PATTERN.test(companyId) ||
      !queryType ||
      !DASHBOARD_QUERY_TYPE_SET.has(queryType)
    ) {
      this.logger.warn(
        `[dashboard-revalidate] Job ${job.id ?? 'sem-id'} ignorado por payload inválido.`,
      );
      return;
    }

    await this.tenantService.run(
      {
        companyId,
        isSuperAdmin: false,
      },
      () =>
        this.dashboardService.revalidateDashboardQuery(companyId, queryType),
    );
  }
}
