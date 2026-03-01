import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job } from 'bullmq';
import { CorrectiveActionsService } from './corrective-actions.service';
import { TenantService } from '../common/tenant/tenant.service';

@Processor('sla-escalation', { concurrency: 2 })
export class SlaEscalationProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaEscalationProcessor.name);

  constructor(
    private readonly correctiveActionsService: CorrectiveActionsService,
    private readonly tenantService: TenantService,
  ) {
    super();
  }

  async process(job: Job<{ tenantId: string }>): Promise<void> {
    const { tenantId } = job.data;
    const result = await this.tenantService.run(
      { companyId: tenantId, isSuperAdmin: false },
      () => this.correctiveActionsService.runSlaEscalationSweep(),
    );
    if (result.overdueActions > 0 || result.notificationsCreated > 0) {
      this.logger.log(
        `[tenant=${tenantId}] overdue=${result.overdueActions}, notifications=${result.notificationsCreated}`,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    if (!job) return;
    this.logger.error(
      `[Job ${job.id}] tenant=${(job.data as any)?.tenantId} falhou: ${error.message}`,
      error.stack,
    );
  }
}
