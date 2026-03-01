import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository, LessThan } from 'typeorm';
import type { Queue } from 'bullmq';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CompaniesService } from '../companies/companies.service';

@Injectable()
export class CleanupTask {
  private readonly logger = new Logger(CleanupTask.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    @InjectQueue('sla-escalation') private readonly slaQueue: Queue,
    private readonly companiesService: CompaniesService,
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

  @Cron(CronExpression.EVERY_WEEK)
  generateWeeklyReports() {
    this.logger.log('Starting weekly reports generation...');
    // Lógica de geração de relatórios semanais
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runCorrectiveActionsSlaEscalation() {
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
