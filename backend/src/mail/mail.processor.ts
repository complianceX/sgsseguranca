import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MailService } from './mail.service';
import { MetricsService } from '../common/observability/metrics.service';

// concurrency: 5 — envio de e-mail é I/O-bound (SMTP), suporta mais paralelos.
@Processor('mail', { concurrency: 5 })
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly mailService: MailService,
    private readonly metricsService: MetricsService,
  ) {
    super();
  }

  // BullMQ v5+: @Process() foi removido. Implementar process() e rotear por job.name.
  async process(job: Job): Promise<any> {
    const start = Date.now();
    try {
      switch (job.name) {
        case 'send-document': {
          const result = await this.handleSendDocument(job);
          this.metricsService.recordQueueJob(
            'mail',
            job.name,
            Date.now() - start,
            'success',
            (job.data as any)?.companyId,
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
        (job.data as any)?.companyId,
      );
      throw err;
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
    }>,
  ) {
    const { fileKey, email, subject, docName, expiresInSeconds } = job.data;
    this.logger.log(
      `[Job ${job.id}] Processando envio de arquivo: ${fileKey} para ${email}`,
    );

    try {
      await this.mailService.sendStoredFileKey(fileKey, email, {
        subject,
        docName,
        expiresInSeconds,
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
  onFailed(job: Job | undefined, error: Error) {
    this.logger.error(
      `[Job ${job?.id}] Falhou definitivamente após todas as tentativas. Tipo: ${job?.name}. Erro: ${error.message}`,
      error.stack,
    );
  }
}
