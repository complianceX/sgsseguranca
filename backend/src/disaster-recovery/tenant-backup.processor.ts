import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { captureException } from '../common/monitoring/sentry';
import { TenantBackupService } from './tenant-backup.service';
import type { TenantBackupJobData } from './tenant-backup.types';

@Processor('tenant-backup', { concurrency: 1 })
export class TenantBackupProcessor extends WorkerHost {
  private readonly logger = new Logger(TenantBackupProcessor.name);

  constructor(private readonly tenantBackupService: TenantBackupService) {
    super();
  }

  async process(job: Job<TenantBackupJobData>): Promise<unknown> {
    try {
      switch (job.data.type) {
        case 'backup_tenant':
          return this.tenantBackupService.backupTenant(job.data.companyId, {
            triggerSource: job.data.triggerSource,
            requestedByUserId: job.data.requestedByUserId,
          });
        case 'backup_all_active_tenants':
          return this.tenantBackupService.backupAllActiveTenants(
            job.data.requestedByUserId,
          );
        case 'restore_tenant':
          return this.tenantBackupService.restoreBackup({
            sourceCompanyId: job.data.sourceCompanyId,
            mode: job.data.mode,
            targetCompanyId: job.data.targetCompanyId,
            backupId: job.data.backupId,
            backupFilePath: job.data.backupFilePath,
            requestedByUserId: job.data.requestedByUserId,
            confirmCompanyId: job.data.confirmCompanyId,
            confirmPhrase: job.data.confirmPhrase,
            targetCompanyName: job.data.targetCompanyName,
            targetCompanyCnpj: job.data.targetCompanyCnpj,
          });
        case 'prune_tenant_backups':
          return this.tenantBackupService.pruneBackups();
        default: {
          const exhaustive: never = job.data;
          return exhaustive;
        }
      }
    } catch (error) {
      captureException(error, {
        tags: {
          module: 'tenant-backup',
          queue: 'tenant-backup',
          job: job.name,
        },
      });
      this.logger.error({
        event: 'tenant_backup_job_failed',
        jobId: String(job.id),
        jobName: job.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
