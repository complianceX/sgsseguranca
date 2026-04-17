import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { isApiCronDisabled } from '../common/utils/scheduler.util';
import { DashboardDocumentAvailabilityWarmupService } from './dashboard-document-availability-warmup.service';

@Injectable()
export class DashboardDocumentAvailabilityRefreshSchedulerService {
  private readonly logger = new Logger(
    DashboardDocumentAvailabilityRefreshSchedulerService.name,
  );

  constructor(
    private readonly warmupService: DashboardDocumentAvailabilityWarmupService,
  ) {}

  @Cron('*/5 * * * *')
  async refreshHotCompanies(): Promise<void> {
    if (
      process.env.DASHBOARD_DOCUMENT_AVAILABILITY_SCHEDULER_ENABLED === 'false'
    ) {
      return;
    }

    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: refresh agendado do snapshot documental foi pulado neste runtime.',
      );
      return;
    }

    try {
      await this.warmupService.warm();
    } catch (error) {
      this.logger.warn({
        event: 'dashboard_document_availability_scheduler_failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
