import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  DashboardService,
} from './dashboard.service';
import { DashboardQueryType } from './dashboard-query.types';

type DashboardRevalidateJobData = {
  companyId: string;
  queryType: DashboardQueryType;
};

@Processor('dashboard-revalidate', { concurrency: 1 })
export class DashboardRevalidateProcessor extends WorkerHost {
  private readonly logger = new Logger(DashboardRevalidateProcessor.name);

  constructor(private readonly dashboardService: DashboardService) {
    super();
  }

  async process(job: Job<DashboardRevalidateJobData>): Promise<void> {
    const companyId = String(job.data?.companyId || '').trim();
    const queryType = job.data?.queryType;

    if (!companyId || !queryType) {
      this.logger.warn(
        `[dashboard-revalidate] Job ${job.id ?? 'sem-id'} ignorado por payload inválido.`,
      );
      return;
    }

    await this.dashboardService.revalidateDashboardQuery(companyId, queryType);
  }
}
