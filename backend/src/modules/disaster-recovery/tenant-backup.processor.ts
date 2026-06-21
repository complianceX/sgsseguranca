import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { captureException } from '../../shared/monitoring/sentry';
import { TenantBackupService } from './tenant-backup.service';
import type { TenantBackupJobData } from './tenant-backup.types';
import { withJobTimeout } from '../../infra/queue/job-timeout.util';

// Timeouts por tipo de job: operacoes de backup/restore variam muito em duracao.
const TENANT_BACKUP_TIMEOUT_MS: Partial<Record<TenantBackupJobData['type'], number>> = {
  backup_tenant: 5 * 60_000,
  backup_all_active_tenants: 30 * 60_000,
  restore_tenant: 10 * 60_000,
  prune_tenant_backups: 5 * 60_000,
};
const DEFAULT_BACKUP_TIMEOUT_MS = 5 * 60_000;

@Processor('tenant-backup', { concurrency: 1 })
export class TenantBackupProcessor extends WorkerHost {
  private readonly logger = new Logger(TenantBackupProcessor.name);

  constructor(private readonly tenantBackupService: TenantBackupService) {
    super();
  }

  async process(job: Job<TenantBackupJobData>): Promise<unknown> {
    const timeoutMs =
      TENANT_BACKUP_TIMEOUT_MS[job.data.type] ?? DEFAULT_BACKUP_TIMEOUT_MS;

    try {
      return await withJobTimeout(
        async () => {
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
        },
        timeoutMs,
        { jobName: job.data.type, jobId: job.id, logger: this.logger },
      );
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