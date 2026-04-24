import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GDPRDeletionService } from '../admin/services/gdpr-deletion.service';
import { isApiCronDisabled } from '../common/utils/scheduler.util';

@Injectable()
export class GdprRetentionCleanupScheduler {
  private readonly logger = new Logger(GdprRetentionCleanupScheduler.name);

  constructor(private readonly gdprDeletionService: GDPRDeletionService) {}

  /**
   * Executa a retenção LGPD diariamente no worker.
   * O serviço grava um run auditável em gdpr_retention_cleanup_runs.
   */
  @Cron('30 3 * * *')
  async runDailyCleanup(): Promise<void> {
    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: limpeza LGPD agendada foi pulada neste runtime.',
      );
      return;
    }

    const result = await this.gdprDeletionService.deleteExpiredData({
      triggeredBy: 'scheduled',
      triggerSource: 'worker:gdpr-retention-cleanup',
    });

    if (result.status === 'success') {
      this.logger.log(
        `Limpeza LGPD agendada concluida: run=${result.run_id ?? 'n/a'} rows=${result.total_rows_deleted}`,
      );
      return;
    }

    this.logger.error(
      `Limpeza LGPD agendada falhou: run=${result.run_id ?? 'n/a'} error=${result.error ?? 'unknown'}`,
    );
  }
}
