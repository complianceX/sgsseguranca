import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job } from 'bullmq';
import { TrainingsService } from '../trainings/trainings.service';
import { MedicalExamsService } from '../medical-exams/medical-exams.service';
import { EpisService } from '../epis/epis.service';
import { TenantService } from '../../shared/tenant/tenant.service';
import { captureException } from '../../shared/monitoring/sentry';
import { withJobTimeout } from '../../infra/queue/job-timeout.util';

type ExpiryNotificationJobData = {
  tenantId: string;
  type: 'training-check' | 'epi-check' | 'medical-exam-check';
};

const isExpiryNotificationType = (
  value: unknown,
): value is ExpiryNotificationJobData['type'] =>
  value === 'training-check' ||
  value === 'epi-check' ||
  value === 'medical-exam-check';

const EXPIRY_NOTIFICATIONS_TIMEOUT_MS = 60_000;

@Processor('expiry-notifications', { concurrency: 1 })
export class ExpiryNotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(ExpiryNotificationsProcessor.name);

  constructor(
    private readonly trainingsService: TrainingsService,
    private readonly medicalExamsService: MedicalExamsService,
    private readonly episService: EpisService,
    private readonly tenantService: TenantService,
  ) {
    super();
  }

  async process(job: Job<ExpiryNotificationJobData>): Promise<void> {
    const tenantId = String(job.data?.tenantId || '').trim();
    const type = job.data?.type;

    if (!tenantId || !isExpiryNotificationType(type)) {
      throw new Error(
        `Payload invalido para expiry-notifications ${job.id ?? 'sem-id'}.`,
      );
    }

    await withJobTimeout(
      () =>
        this.tenantService.run(
          { companyId: tenantId, isSuperAdmin: false, siteScope: 'all' },
          async () => {
            if (type === 'training-check') {
              const result =
                await this.trainingsService.dispatchExpiryNotifications(30);
              this.logger.log(
                `[tenant=${tenantId}] training-check: ${result.dispatched} notificacoes despachadas`,
              );
            } else if (type === 'epi-check') {
              const result =
                await this.episService.dispatchExpiryNotifications(30);
              this.logger.log(
                `[tenant=${tenantId}] epi-check: ${result.dispatched} EPIs com CA vencendo em 30 dias identificados`,
              );
            } else if (type === 'medical-exam-check') {
              const result =
                await this.medicalExamsService.dispatchExpiryNotifications(30);
              this.logger.log(
                `[tenant=${tenantId}] medical-exam-check: ${result.dispatched} notificacoes despachadas`,
              );
            }
          },
        ),
      EXPIRY_NOTIFICATIONS_TIMEOUT_MS,
      { jobName: job.name, jobId: job.id, logger: this.logger },
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ExpiryNotificationJobData> | undefined, error: Error) {
    if (!job) return;
    this.logger.error(
      `[Job ${job.id}] type=${job.data.type} tenant=${job.data.tenantId} falhou: ${error.message}`,
      error.stack,
    );
    captureException(error, {
      tags: { queue: 'expiry-notifications', jobType: job.data.type },
      extra: {
        jobId: job.id,
        tenantId: job.data.tenantId,
        attemptsMade: job.attemptsMade,
      },
    });
  }
}
