import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

const BUSINESS_METRICS_REPEAT_JOB_ID = 'refresh-business-metrics-gauges-repeat';
const BUSINESS_METRICS_BOOTSTRAP_JOB_ID =
  'refresh-business-metrics-gauges-bootstrap';
const BUSINESS_METRICS_REFRESH_EVERY_MS = 15 * 60 * 1000;

@Injectable()
export class BusinessMetricsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BusinessMetricsSchedulerService.name);

  constructor(
    @InjectQueue('business-metrics-refresh')
    private readonly businessMetricsQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.businessMetricsQueue.add(
        'refresh-gauges',
        { trigger: 'startup_bootstrap' },
        {
          jobId: BUSINESS_METRICS_BOOTSTRAP_JOB_ID,
          removeOnComplete: 20,
          removeOnFail: 20,
        },
      );

      await this.businessMetricsQueue.add(
        'refresh-gauges',
        { trigger: 'startup' },
        {
          jobId: BUSINESS_METRICS_REPEAT_JOB_ID,
          repeat: { every: BUSINESS_METRICS_REFRESH_EVERY_MS },
          removeOnComplete: 20,
          removeOnFail: 20,
        },
      );

      this.logger.log({
        event: 'business_metrics_refresh_job_scheduled',
        queue: 'business-metrics-refresh',
        repeatEveryMs: BUSINESS_METRICS_REFRESH_EVERY_MS,
      });
    } catch (error) {
      this.logger.warn(
        `Falha ao agendar job de refresh das métricas de negócio (não bloqueante): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
