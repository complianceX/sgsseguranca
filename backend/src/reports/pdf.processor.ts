import {
  InjectQueue,
  Processor,
  WorkerHost,
  OnWorkerEvent,
} from '@nestjs/bullmq';
import { DelayedError, type Job, type Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { StorageService } from '../common/services/storage.service';
import { MetricsService } from '../common/observability/metrics.service';
import { TenantQuotaService } from '../common/queue/tenant-quota.service';
import { getPdfGenerationConcurrency } from '../common/services/pdf-runtime-config';
import { captureException } from '../common/monitoring/sentry';
import { TenantService } from '../common/tenant/tenant.service';

interface PdfGenerationJobData {
  reportType: string;
  params: unknown;
  userId: string;
  companyId: string;
}

interface DeadLetterPayload {
  originalQueue: string;
  originalJobId: string | undefined;
  originalJobName: string;
  attemptsMade: number;
  companyId?: string;
  data: unknown;
  error: {
    message: string;
    stack?: string;
  };
  failedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parsePdfGenerationJobData = (
  data: unknown,
): PdfGenerationJobData | null => {
  if (!isRecord(data)) {
    return null;
  }

  const reportType = data['reportType'];
  const userId = data['userId'];
  const companyId = data['companyId'];

  if (
    typeof reportType !== 'string' ||
    typeof userId !== 'string' ||
    typeof companyId !== 'string'
  ) {
    return null;
  }

  return {
    reportType,
    params: data['params'],
    userId,
    companyId,
  };
};

// concurrency: 3 — Puppeteer é memory-intensive (~200-400 MB por instância).
// Não ultrapasse 3 por container; ajuste para 1 se o plano Railway for small.
const PDF_GENERATION_CONCURRENCY = getPdfGenerationConcurrency();

@Processor('pdf-generation', { concurrency: PDF_GENERATION_CONCURRENCY })
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly storageService: StorageService,
    private readonly metricsService: MetricsService,
    private readonly tenantQuota: TenantQuotaService,
    private readonly tenantService: TenantService,
    @InjectQueue('pdf-generation-dlq') private readonly pdfDlq: Queue,
  ) {
    super();
  }

  // BullMQ v5+: @Process() foi removido. Implementar process() e rotear por job.name.
  async process(
    job: Job<unknown, unknown, string>,
  ): Promise<{ url: string } | void> {
    const start = Date.now();
    const jobData = parsePdfGenerationJobData(job.data);
    const companyId = jobData?.companyId;
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
          if (!jobData) {
            throw new Error(
              `Payload inválido para job de PDF ${job.id ?? 'sem-id'}.`,
            );
          }

          const result = await this.handleGenerate(job, jobData);
          this.metricsService.recordQueueJob(
            'pdf-generation',
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
        companyId,
      );
      this.metricsService.recordPdfError(
        companyId ?? 'unknown',
        err instanceof Error ? err.name || 'Error' : 'UnknownError',
      );
      throw err;
    } finally {
      await this.tenantQuota.release('pdf', companyId);
    }
  }

  private async handleGenerate(
    job: Job<unknown, unknown, string>,
    data: PdfGenerationJobData,
  ): Promise<{ url: string }> {
    const start = Date.now();
    const { reportType, params, userId, companyId } = data;
    this.logger.log({
      event: 'pdf_job_started',
      jobId: job.id,
      reportType,
      userId,
      companyId,
      concurrency: PDF_GENERATION_CONCURRENCY,
    });

    const buffer = await this.tenantService.run(
      { companyId, isSuperAdmin: false, siteScope: 'all' },
      async () => this.reportsService.generateBuffer(reportType, params),
    );

    const url = await this.storageService.uploadPdf(buffer, userId);

    this.metricsService.recordPdfGeneration(companyId, Date.now() - start);
    this.logger.log({
      event: 'pdf_job_completed',
      jobId: job.id,
      reportType,
      userId,
      companyId,
      sizeBytes: buffer.length,
      durationMs: Date.now() - start,
    });
    return { url };
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<unknown, unknown, string> | undefined, error: Error) {
    if (!job) return;
    const jobData = parsePdfGenerationJobData(job.data);

    const maxAttempts = job.opts.attempts ?? 1;
    const isFinal = job.attemptsMade >= maxAttempts;

    this.logger.error(
      `[Job ${job.id}] Falhou${isFinal ? ' definitivamente' : ''}. Tipo: ${job.name}. Erro: ${error.message}`,
      error.stack,
    );

    if (!isFinal) return;

    captureException(error, {
      tags: { queue: 'pdf-generation', jobName: job.name },
      extra: {
        jobId: job.id,
        companyId: jobData?.companyId,
        attemptsMade: job.attemptsMade,
      },
    });

    try {
      const deadLetterPayload: DeadLetterPayload = {
        originalQueue: 'pdf-generation',
        originalJobId: job.id,
        originalJobName: job.name,
        attemptsMade: job.attemptsMade,
        companyId: jobData?.companyId,
        data: job.data,
        error: { message: error.message, stack: error.stack },
        failedAt: new Date().toISOString(),
      };

      await this.pdfDlq.add('dead-letter', deadLetterPayload, {
        attempts: 1,
        backoff: undefined,
        removeOnComplete: 5000,
        removeOnFail: 5000,
      });
    } catch (dlqErr) {
      this.logger.error(
        `[Job ${job.id}] Falha ao publicar no DLQ: ${dlqErr instanceof Error ? dlqErr.message : String(dlqErr)}`,
        dlqErr instanceof Error ? dlqErr.stack : undefined,
      );
    }
  }
}
