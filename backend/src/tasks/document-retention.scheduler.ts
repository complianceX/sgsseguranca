import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import { CompaniesService } from '../companies/companies.service';
import { isApiCronDisabled } from '../common/utils/scheduler.util';

type DocumentRetentionJobData = {
  tenantId: string;
  triggeredAt: string;
};

@Injectable()
export class DocumentRetentionScheduler {
  private readonly logger = new Logger(DocumentRetentionScheduler.name);
  private readonly redisDisabled = /^true$/i.test(
    process.env.REDIS_DISABLED || '',
  );

  constructor(
    @InjectQueue('document-retention')
    private readonly retentionQueue: Queue,
    private readonly companiesService: CompaniesService,
  ) {}

  /**
   * Agenda diária de retenção documental (02:00, horário do servidor).
   * Enfileira um job por tenant para manter isolamento e rastreabilidade.
   */
  @Cron('0 2 * * *')
  async enqueueDailyRetentionJobs(): Promise<void> {
    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: retenção documental agendada foi pulada neste runtime.',
      );
      return;
    }

    if (this.redisDisabled) {
      this.logger.warn(
        'REDIS_DISABLED=true: retenção documental assíncrona foi pulada neste runtime.',
      );
      return;
    }

    const companies = await this.companiesService.findAllActive();
    const dayKey = new Date().toISOString().slice(0, 10);

    for (const company of companies) {
      const jobId = `document-retention-${company.id}-${dayKey}`;
      const data: DocumentRetentionJobData = {
        tenantId: company.id,
        triggeredAt: new Date().toISOString(),
      };

      await this.retentionQueue.add('execute-tenant-retention', data, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: 1000,
      });
    }

    this.logger.log(
      `Document retention jobs enfileirados para ${companies.length} tenants`,
    );
  }
}
