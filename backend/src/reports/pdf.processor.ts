import { InjectQueue, Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { DelayedError, type Job, type Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { StorageService } from '../common/services/storage.service';
import { MetricsService } from '../common/observability/metrics.service';
import { TenantQuotaService } from '../common/queue/tenant-quota.service';

// concurrency: 3 — Puppeteer é memory-intensive (~200-400 MB por instância).
// Não ultrapasse 3 por container; ajuste para 1 se o plano Railway for small.
@Processor('pdf-generation', { concurrency: 3 })
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly storageService: StorageService,
    private readonly metricsService: MetricsService,
    private readonly tenantQuota: TenantQuotaService,
    @InjectQueue('pdf-generation-dlq') private readonly pdfDlq: Queue,
  ) {
    super();
  }

  // BullMQ v5+: @Process() foi removido. Implementar process() e rotear por job.name.
  async process(job: Job): Promise<any> {
    const start = Date.now();
    const companyId = (job.data as any)?.companyId as string | undefined;
    const quota = await this.tenantQuota.tryAcquire('pdf', companyId);
    if (!quota.acquired) {
      const delayMs = this.tenantQuota.getDelayMs('pdf');
      await job.moveToDelayed(Date.now() + delayMs, job.token);
      this.metricsService.recordQueueJob(
        'pdf-generation',
        job.name,
        Date.now() - start,
        'delayed',
        companyId,
      );
      throw new DelayedError();
    }
    try {
      switch (job.name) {
        case 'generate': {
          const result = await this.handleGenerate(job);
          this.metricsService.recordQueueJob(
            'pdf-generation',
            job.name,
            Date.now() - start,
            'success',
            (job.data as any)?.companyId,
          );
          return result;
        }
        default:
          this.logger.warn(`[Job ${job.id}] Tipo desconhecido: ${job.name}`);
          this.metricsService.recordQueueJob(
            'pdf-generation',
            job.name,
            Date.now() - start,
            'error',
          );
      }
    } catch (err) {
      this.metricsService.recordQueueJob(
        'pdf-generation',
        job.name,
        Date.now() - start,
        'error',
        (job.data as any)?.companyId,
      );
      throw err;
    } finally {
      await this.tenantQuota.release('pdf', companyId);
    }
  }

  private async handleGenerate(
    job: Job<{
      reportType: string;
      params: unknown;
      userId: string;
      companyId: string;
    }>,
  ) {
    const start = Date.now();
    const { reportType, params, userId, companyId } = job.data;
    this.logger.log(
      `[Job ${job.id}] Gerando PDF: tipo=${reportType} para user=${userId} company=${companyId}`,
    );

    const buffer = await this.reportsService.generateBuffer(reportType, params);

    const url = await this.storageService.uploadPdf(buffer, userId);

    this.metricsService.recordPdfGeneration(companyId, Date.now() - start);
    this.logger.log(`[Job ${job.id}] PDF gerado e armazenado`);
    return { url };
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
      await this.pdfDlq.add(
        'dead-letter',
        {
          originalQueue: 'pdf-generation',
          originalJobId: job.id,
          originalJobName: job.name,
          attemptsMade: job.attemptsMade,
          companyId: (job.data as any)?.companyId,
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
