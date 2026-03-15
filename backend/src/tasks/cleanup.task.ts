import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository, LessThan } from 'typeorm';
import type { Queue } from 'bullmq';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CompaniesService } from '../companies/companies.service';
import { isApiCronDisabled } from '../common/utils/scheduler.util';

@Injectable()
export class CleanupTask {
  private readonly logger = new Logger(CleanupTask.name);
  private readonly redisDisabled = /^true$/i.test(
    process.env.REDIS_DISABLED || '',
  );

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    @InjectQueue('sla-escalation') private readonly slaQueue: Queue,
    @InjectQueue('expiry-notifications') private readonly expiryQueue: Queue,
    private readonly companiesService: CompaniesService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldLogs() {
    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: limpeza agendada de logs foi pulada neste runtime.',
      );
      return;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.auditLogRepo.delete({
      timestamp: LessThan(thirtyDaysAgo),
    });

    this.logger.log(`Old audit logs cleaned up: ${result.affected} rows`);
  }

  @Cron(CronExpression.EVERY_WEEK)
  generateWeeklyReports() {
    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: geração semanal agendada foi pulada neste runtime.',
      );
      return;
    }

    this.logger.log('Starting weekly reports generation...');
    // Lógica de geração de relatórios semanais
  }

  @Cron('0 8 * * *') // Daily at 08:00
  async runExpiryNotifications() {
    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: notificações agendadas de vencimento foram puladas neste runtime.',
      );
      return;
    }

    if (this.redisDisabled) {
      this.logger.warn(
        'REDIS_DISABLED=true: notificações assíncronas de vencimento foram puladas neste runtime.',
      );
      return;
    }

    const tenants = await this.companiesService.findAllActive();
    for (const tenant of tenants) {
      await this.expiryQueue.add(
        'training-check',
        { tenantId: tenant.id, type: 'training-check' },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        },
      );
      await this.expiryQueue.add(
        'epi-check',
        { tenantId: tenant.id, type: 'epi-check' },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        },
      );
      await this.expiryQueue.add(
        'medical-exam-check',
        { tenantId: tenant.id, type: 'medical-exam-check' },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        },
      );
    }
    this.logger.log(
      `Expiry notifications enqueued for ${tenants.length} tenants`,
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runCorrectiveActionsSlaEscalation() {
    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: varredura agendada de SLA foi pulada neste runtime.',
      );
      return;
    }

    if (this.redisDisabled) {
      this.logger.warn(
        'REDIS_DISABLED=true: varredura assíncrona de SLA foi pulada neste runtime.',
      );
      return;
    }

    const tenants = await this.companiesService.findAllActive();
    for (const tenant of tenants) {
      await this.slaQueue.add(
        'run-sla-sweep',
        { tenantId: tenant.id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }
    this.logger.log(`SLA sweep enqueued for ${tenants.length} tenants`);
  }
}
