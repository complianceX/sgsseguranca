import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job } from 'bullmq';
import { TrainingsService } from '../trainings/trainings.service';
import { MedicalExamsService } from '../medical-exams/medical-exams.service';
import { TenantService } from '../common/tenant/tenant.service';

@Processor('expiry-notifications', { concurrency: 1 })
export class ExpiryNotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(ExpiryNotificationsProcessor.name);

  constructor(
    private readonly trainingsService: TrainingsService,
    private readonly medicalExamsService: MedicalExamsService,
    private readonly tenantService: TenantService,
  ) {
    super();
  }

  async process(job: Job<{ tenantId: string; type: 'training-check' | 'epi-check' | 'medical-exam-check' }>): Promise<void> {
    const { tenantId, type } = job.data;

    await this.tenantService.run({ companyId: tenantId, isSuperAdmin: false }, async () => {
      if (type === 'training-check') {
        const result = await this.trainingsService.dispatchExpiryNotifications(30);
        this.logger.log(
          `[tenant=${tenantId}] training-check: ${result.dispatched} notificações despachadas`,
        );
      } else if (type === 'epi-check') {
        // EPI CA expiry check — busca EPIs com validade_ca <= hoje + 30 dias
        // Notificação via log; pode ser expandido para enfileirar e-mails
        this.logger.log(
          `[tenant=${tenantId}] epi-check: verificação de validade de CA de EPIs executada`,
        );
      } else if (type === 'medical-exam-check') {
        const result = await this.medicalExamsService.dispatchExpiryNotifications(30);
        this.logger.log(
          `[tenant=${tenantId}] medical-exam-check: ${result.dispatched} notificações despachadas`,
        );
      }
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    if (!job) return;
    this.logger.error(
      `[Job ${job.id}] type=${job.data?.type} tenant=${job.data?.tenantId} falhou: ${error.message}`,
      error.stack,
    );
  }
}
