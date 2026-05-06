import {
  InjectQueue,
  Processor,
  WorkerHost,
  OnWorkerEvent,
} from '@nestjs/bullmq';
import { DelayedError, type Job, type Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { MetricsService } from '../common/observability/metrics.service';
import { TenantQuotaService } from '../common/queue/tenant-quota.service';
import { getPdfGenerationConcurrency } from '../common/services/pdf-runtime-config';
import { captureException } from '../common/monitoring/sentry';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';

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

const PDF_RSS_WARN_THRESHOLD_MB = parseInt(
  process.env.PDF_GENERATION_RSS_WARN_MB || '900',
  10,
);

function checkRssAndWarn(logger: { warn: (msg: object) => void }): void {
  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  if (rssMb >= PDF_RSS_WARN_THRESHOLD_MB) {
    logger.warn({
      event: 'pdf_worker_rss_high',
      rssMb,
      thresholdMb: PDF_RSS_WARN_THRESHOLD_MB,
      message:
        'RSS do worker de PDF próximo do limite — considere reduzir PDF_GENERATION_CONCURRENCY',
    });
  }
}

@Processor('pdf-generation', { concurrency: PDF_GENERATION_CONCURRENCY })
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly documentGovernanceService: DocumentGovernanceService,
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
  ): Promise<{ url: string | null } | void> {
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
  ): Promise<{ url: string | null }> {
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

    const artifact = await this.tenantService.run(
      { companyId, isSuperAdmin: false, siteScope: 'all' },
      async () => this.reportsService.generateBuffer(reportType, params),
    );
    const previousFileKey = artifact.report.pdf_file_key || null;
    const fileKey = this.documentStorageService.generateDocumentKey(
      artifact.report.company_id,
      'reports',
      artifact.report.id,
      artifact.originalName,
    );
    const folderPath = fileKey.split('/').slice(0, -1).join('/');

    await this.documentStorageService.uploadFile(
      fileKey,
      artifact.buffer,
      'application/pdf',
    );

    const { registryEntry } =
      await this.documentGovernanceService.registerFinalDocument({
        companyId: artifact.report.company_id,
        module: 'report',
        entityId: artifact.report.id,
        title: artifact.title,
        documentDate: artifact.report.created_at,
        documentCode: artifact.documentCode,
        fileKey,
        folderPath,
        originalName: artifact.originalName,
        mimeType: 'application/pdf',
        fileBuffer: artifact.buffer,
        createdBy: userId,
        persistEntityMetadata: async (manager, computedHash) => {
          await manager.getRepository('reports').update(artifact.report.id, {
            pdf_file_key: fileKey,
            pdf_folder_path: folderPath,
            pdf_original_name: artifact.originalName,
            pdf_file_hash: computedHash,
            pdf_generated_at: new Date(),
          });
        },
      });

    if (previousFileKey && previousFileKey !== fileKey) {
      await this.documentStorageService
        .deleteFile(previousFileKey)
        .catch((error) => {
          this.logger.warn(
            `Falha ao limpar PDF mensal anterior (${previousFileKey}) após reemissão de ${artifact.report.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    const url = await this.documentStorageService
      .getSignedUrl(fileKey)
      .catch(() => null);

    this.metricsService.recordPdfGeneration(companyId, Date.now() - start);
    this.logger.log({
      event: 'pdf_job_completed',
      jobId: job.id,
      reportType,
      userId,
      companyId,
      sizeBytes: artifact.buffer.length,
      durationMs: Date.now() - start,
      reportId: artifact.report.id,
      fileKey,
      documentCode: registryEntry.document_code || artifact.documentCode,
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
    checkRssAndWarn(this.logger);
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
