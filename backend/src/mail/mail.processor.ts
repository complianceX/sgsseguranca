import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { DelayedError, type Job, type Queue } from 'bullmq';
import { MailService } from './mail.service';
import { MetricsService } from '../common/observability/metrics.service';
import { TenantQuotaService } from '../common/queue/tenant-quota.service';

// concurrency: 5 — envio de e-mail é I/O-bound (SMTP), suporta mais paralelos.
@Processor('mail', { concurrency: 5 })
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly mailService: MailService,
    private readonly metricsService: MetricsService,
    private readonly tenantQuota: TenantQuotaService,
    @InjectQueue('mail-dlq') private readonly mailDlq: Queue,
  ) {
    super();
  }

  // BullMQ v5+: @Process() foi removido. Implementar process() e rotear por job.name.
  async process(job: Job): Promise<any> {
    const start = Date.now();
    const companyId = job.data?.companyId as string | undefined;
    const quota = await this.tenantQuota.tryAcquire('mail', companyId);
    if (!quota.acquired) {
      const delayMs = this.tenantQuota.getDelayMs('mail');
      await job.moveToDelayed(Date.now() + delayMs, job.token);
      this.metricsService.recordQueueJob(
        'mail',
        job.name,
        Date.now() - start,
        'delayed',
        companyId,
      );
      throw new DelayedError();
    }
    try {
      switch (job.name) {
        case 'send-document': {
          const result = await this.handleSendDocument(job);
          this.metricsService.recordQueueJob(
            'mail',
            job.name,
            Date.now() - start,
            'success',
            job.data?.companyId,
          );
          return result;
        }
        case 'send-file-key': {
          const result = await this.handleSendFileKey(job);
          this.metricsService.recordQueueJob(
            'mail',
            job.name,
            Date.now() - start,
            'success',
            companyId,
          );
          return result;
        }
        default:
          this.logger.warn(`[Job ${job.id}] Tipo desconhecido: ${job.name}`);
          this.metricsService.recordQueueJob(
            'mail',
            job.name,
            Date.now() - start,
            'error',
          );
      }
    } catch (err) {
      this.metricsService.recordQueueJob(
        'mail',
        job.name,
        Date.now() - start,
        'error',
        companyId,
      );
      throw err;
    } finally {
      await this.tenantQuota.release('mail', companyId);
    }
  }

  private async handleSendDocument(
    job: Job<{
      documentId: string;
      documentType: string;
      email: string;
      companyId?: string;
    }>,
  ) {
    const { documentId, documentType, email, companyId } = job.data;
    this.logger.log(
      `[Job ${job.id}] Processando envio de documento: ${documentType} para ${email}`,
    );

    try {
      await this.mailService.sendStoredDocument(
        documentId,
        documentType,
        email,
        companyId,
      );
      this.logger.log(`[Job ${job.id}] E-mail enviado com sucesso.`);
    } catch (error) {
      this.logger.error(
        `[Job ${job.id}] Falha ao enviar e-mail: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async handleSendFileKey(
    job: Job<{
      fileKey: string;
      email: string;
      subject?: string;
      docName?: string;
      expiresInSeconds?: number;
      companyId?: string;
      userId?: string;
    }>,
  ) {
    const { fileKey, email, subject, docName, expiresInSeconds, companyId, userId } =
      job.data;
    this.logger.log(
      `[Job ${job.id}] Processando envio de arquivo: ${fileKey} para ${email}`,
    );

    try {
      await this.mailService.sendStoredFileKey(fileKey, email, {
        subject,
        docName,
        expiresInSeconds,
        companyId,
        userId,
      });
      this.logger.log(`[Job ${job.id}] E-mail enviado com sucesso.`);
    } catch (error) {
      this.logger.error(
        `[Job ${job.id}] Falha ao enviar e-mail: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, error: Error) {
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 1;
    const isFinal = job.attemptsMade >= maxAttempts;

    this.logger.error(
      `[Job ${job.id}] Falhou${isFinal ? ' definitivamente' : ''}. Tipo: ${job.name}. Erro: ${error.message}`,
      error.stack,
    );

    if (!isFinal) return;

    try {
      await this.mailDlq.add(
        'dead-letter',
        {
          originalQueue: 'mail',
          originalJobId: job.id,
          originalJobName: job.name,
          attemptsMade: job.attemptsMade,
          companyId: job.data?.companyId,
          data: job.data,
          error: { message: error.message, stack: error.stack },
          failedAt: new Date().toISOString(),
        },
        {
          attempts: 1,
          backoff: undefined,
          removeOnComplete: false,
          removeOnFail: false,
        },
      );
    } catch (dlqErr) {
      this.logger.error(
        `[Job ${job.id}] Falha ao publicar no DLQ: ${dlqErr instanceof Error ? dlqErr.message : String(dlqErr)}`,
        dlqErr instanceof Error ? dlqErr.stack : undefined,
      );
    }
  }
}
