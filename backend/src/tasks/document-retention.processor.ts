import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentRetentionService } from '../common/storage/document-retention.service';
import { captureException } from '../common/monitoring/sentry';

type DocumentRetentionJobData = {
  tenantId: string;
  triggeredAt: string;
};

@Processor('document-retention', { concurrency: 1 })
export class DocumentRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentRetentionProcessor.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly documentRetentionService: DocumentRetentionService,
  ) {
    super();
  }

  async process(job: Job<DocumentRetentionJobData>): Promise<void> {
    if (job.name !== 'execute-tenant-retention') {
      return;
    }

    const tenantId = String(job.data?.tenantId || '').trim();
    if (!tenantId) {
      throw new Error(
        `Payload inválido para document-retention ${job.id ?? 'sem-id'}.`,
      );
    }

    await this.tenantService.run(
      { companyId: tenantId, isSuperAdmin: false, siteScope: 'all' },
      async () => {
        const result =
          await this.documentRetentionService.executeTenantExpiry(tenantId);

        this.logger.log(
          `[tenant=${tenantId}] document-retention: expired=${result.expired} failed=${result.failed}`,
        );
      },
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<DocumentRetentionJobData> | undefined, error: Error) {
    if (!job) return;
    this.logger.error(
      `[Job ${job.id}] tenant=${job.data.tenantId} document-retention falhou: ${error.message}`,
      error.stack,
    );
    captureException(error, {
      tags: { queue: 'document-retention' },
      extra: {
        jobId: job.id,
        tenantId: job.data.tenantId,
        attemptsMade: job.attemptsMade,
      },
    });
  }
}
