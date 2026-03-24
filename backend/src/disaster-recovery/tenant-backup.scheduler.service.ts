import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { withDefaultJobOptions } from '../queue/default-job-options';

const DAILY_BACKUP_REPEAT_JOB_ID = 'tenant-backup-daily-all-tenants';
const DAILY_PRUNE_REPEAT_JOB_ID = 'tenant-backup-daily-prune';

@Injectable()
export class TenantBackupSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TenantBackupSchedulerService.name);

  constructor(
    @InjectQueue('tenant-backup')
    private readonly tenantBackupQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.tenantBackupQueue.add(
        'backup-all-active-tenants',
        {
          type: 'backup_all_active_tenants',
          triggerSource: 'scheduled_daily',
        },
        withDefaultJobOptions({
          jobId: DAILY_BACKUP_REPEAT_JOB_ID,
          repeat: {
            pattern: '0 3 * * *',
          },
          timeout: 60 * 60 * 1000,
          removeOnComplete: 50,
          removeOnFail: 50,
        }),
      );

      await this.tenantBackupQueue.add(
        'prune-tenant-backups',
        {
          type: 'prune_tenant_backups',
        },
        withDefaultJobOptions({
          jobId: DAILY_PRUNE_REPEAT_JOB_ID,
          repeat: {
            pattern: '30 3 * * *',
          },
          timeout: 30 * 60 * 1000,
          removeOnComplete: 50,
          removeOnFail: 50,
        }),
      );

      this.logger.log({
        event: 'tenant_backup_schedule_ready',
        queue: 'tenant-backup',
        dailyBackupCron: '0 3 * * *',
        pruneCron: '30 3 * * *',
      });
    } catch (error) {
      this.logger.warn(
        `Falha ao registrar agendamentos de backup por tenant (não bloqueante): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
