import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CorrectiveActionsService } from '../corrective-actions/corrective-actions.service';

@Injectable()
export class CleanupTask {
  private readonly logger = new Logger(CleanupTask.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    private correctiveActionsService: CorrectiveActionsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldLogs() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.auditLogRepo.delete({
      timestamp: LessThan(thirtyDaysAgo),
    });

    this.logger.log(`Old audit logs cleaned up: ${result.affected} rows`);
  }

  // Comentado pois RefreshToken entity não existe no código lido
  /*
  @Cron('0 * /6 * * *') // A cada 6 horas
  async cleanupExpiredTokens() {
    await this.refreshTokenRepo.delete({
      expiresAt: LessThan(new Date())
    });
  }
  */

  @Cron(CronExpression.EVERY_WEEK)
  generateWeeklyReports() {
    this.logger.log('Starting weekly reports generation...');
    // Lógica de geração de relatórios semanais
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runCorrectiveActionsSlaEscalation() {
    const result = await this.correctiveActionsService.runSlaEscalationSweep();
    if (result.overdueActions > 0 || result.notificationsCreated > 0) {
      this.logger.log(
        `CAPA SLA escalation sweep: overdue=${result.overdueActions}, notifications=${result.notificationsCreated}`,
      );
    }
  }
}
