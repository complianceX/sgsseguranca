import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ObservabilityModule } from './observability.module';
import { BusinessMetricsRefreshProcessor } from './business-metrics-refresh.processor';
import { BusinessMetricsSchedulerService } from './business-metrics-scheduler.service';

/**
 * Worker-only module for background observability jobs.
 *
 * Today, it schedules and processes the "business-metrics-refresh" queue.
 * This MUST NOT run in the web runtime to avoid competing with HTTP requests.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'business-metrics-refresh' }),
    ObservabilityModule,
  ],
  providers: [BusinessMetricsRefreshProcessor, BusinessMetricsSchedulerService],
})
export class ObservabilityWorkerModule {}

