import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MetricsService } from './metrics.service';
import { BusinessMetricsRefreshService } from './business-metrics-refresh.service';

@Processor('business-metrics-refresh', { concurrency: 1 })
export class BusinessMetricsRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(BusinessMetricsRefreshProcessor.name);

  constructor(
    private readonly businessMetricsRefreshService: BusinessMetricsRefreshService,
    private readonly metricsService: MetricsService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const startedAt = Date.now();

    try {
      const result =
        await this.businessMetricsRefreshService.refreshTenantHealthGauges();
      this.metricsService.recordQueueJob(
        'business-metrics-refresh',
        job.name,
        Date.now() - startedAt,
        'success',
      );

      return result;
    } catch (error) {
      this.metricsService.recordQueueJob(
        'business-metrics-refresh',
        job.name,
        Date.now() - startedAt,
        'error',
      );
      this.logger.error(
        `Falha ao processar refresh de métricas de negócio: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}
