import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

const BUSINESS_METRICS_REPEAT_JOB_ID = 'refresh-business-metrics-gauges-repeat';
const BUSINESS_METRICS_BOOTSTRAP_JOB_ID =
  'refresh-business-metrics-gauges-bootstrap';
const BUSINESS_METRICS_REFRESH_EVERY_MS = 15 * 60 * 1000;

function isExplicitlyDisabled(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ['false', '0', 'no', 'off', 'disabled'].includes(
    value.trim().toLowerCase(),
  );
}

export function isBusinessMetricsRefreshEnabled(env = process.env): boolean {
  const configured = env.BUSINESS_METRICS_REFRESH_ENABLED;
  if (configured && configured.trim().length > 0) {
    return !isExplicitlyDisabled(configured);
  }

  return env.NODE_ENV !== 'production';
}

@Injectable()
export class BusinessMetricsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BusinessMetricsSchedulerService.name);

  constructor(
    @InjectQueue('business-metrics-refresh')
    private readonly businessMetricsQueue: Queue,
  ) {}

  private async clearScheduledRefreshJobs(): Promise<void> {
    const repeatableJobs = await this.businessMetricsQueue.getRepeatableJobs();
    await Promise.all(
      repeatableJobs
        .filter(
          (job) =>
            job.id === BUSINESS_METRICS_REPEAT_JOB_ID ||
            job.name === 'refresh-gauges',
        )
        .map((job) => this.businessMetricsQueue.removeRepeatableByKey(job.key)),
    );

    const queuedJobs = await this.businessMetricsQueue.getJobs(
      ['wait', 'delayed'],
      0,
      49,
      true,
    );
    await Promise.all(
      queuedJobs
        .filter(
          (job) =>
            job.name === 'refresh-gauges' &&
            (job.id === BUSINESS_METRICS_BOOTSTRAP_JOB_ID ||
              job.id === BUSINESS_METRICS_REPEAT_JOB_ID),
        )
        .map((job) => job.remove()),
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      if (!isBusinessMetricsRefreshEnabled()) {
        await this.clearScheduledRefreshJobs();
        this.logger.log({
          event: 'business_metrics_refresh_disabled',
          queue: 'business-metrics-refresh',
        });
        return;
      }

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
