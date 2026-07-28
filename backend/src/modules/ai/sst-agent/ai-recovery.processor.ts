import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { TenantService } from '../../../shared/tenant/tenant.service';
import { SstAgentService } from './sst-agent.service';
import {
  type AiRecoveryJobData,
  sanitizeAiRecoveryJobData,
} from './ai-recovery-job-data';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

@Processor('ai-recovery', { concurrency: 1 })
export class AiRecoveryProcessor extends WorkerHost {
  private readonly logger = new Logger(AiRecoveryProcessor.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly sstAgentService: SstAgentService,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    const sanitized = sanitizeAiRecoveryJobData(job.data);
    if (sanitized.changed) {
      await job.updateData(sanitized.data);
    }
    const payload = sanitized.data;
    const now = Date.now();
    const payloadQueuedAt = Date.parse(String(payload.queuedAt || ''));
    const bullMqQueuedAt = Number(job.timestamp);
    const queuedAt = Number.isFinite(payloadQueuedAt)
      ? payloadQueuedAt
      : bullMqQueuedAt;
    const maxAgeMs = this.getMaxRecoveryAgeMs();
    if (
      !Number.isFinite(queuedAt) ||
      queuedAt > now + MAX_FUTURE_CLOCK_SKEW_MS ||
      now - queuedAt > maxAgeMs
    ) {
      this.logger.warn(
        `[ai-recovery] job=${job.id ?? 'unknown'} descartado por timestamp ausente ou fora da janela permitida.`,
      );
      return;
    }

    const tenantId = payload.tenantId;
    const interactionId = payload.interactionId;
    if (!UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(interactionId)) {
      this.logger.warn(
        `[ai-recovery] job=${job.id ?? 'unknown'} descartado por payload legado ou inválido.`,
      );
      return;
    }

    await this.tenantService.run(
      {
        companyId: tenantId,
        isSuperAdmin: false,
      },
      () => this.sstAgentService.recoverInteraction(interactionId),
    );
  }

  private getMaxRecoveryAgeMs(): number {
    const raw = Number(process.env.AI_RECOVERY_MAX_AGE_MS);
    if (!Number.isFinite(raw)) {
      return 24 * 60 * 60 * 1000;
    }
    return Math.min(Math.max(Math.floor(raw), 60_000), 7 * 24 * 60 * 60 * 1000);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<AiRecoveryJobData> | undefined, error: Error): void {
    this.logger.warn(
      `[ai-recovery] job=${job?.id ?? 'unknown'} falhou: ${error.message}`,
    );
  }
}
