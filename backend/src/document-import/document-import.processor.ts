import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { MetricsService } from '../common/observability/metrics.service';
import { getDocumentImportQueueConcurrency } from './document-import-runtime-config';
import { DocumentImportService } from './services/document-import.service';

type DocumentImportQueueJobData = {
  documentId: string;
  companyId: string;
  requestedByUserId?: string;
};

type DocumentImportDeadLetterPayload = {
  originalQueue: string;
  originalJobId: string | undefined;
  originalJobName: string;
  attemptsMade: number;
  documentId?: string;
  companyId?: string;
  data: unknown;
  error: {
    message: string;
    stack?: string;
  };
  failedAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseDocumentImportJobData = (
  data: unknown,
): DocumentImportQueueJobData | null => {
  if (!isRecord(data)) {
    return null;
  }

  const documentId = data.documentId;
  const companyId = data.companyId;
  const requestedByUserId = data.requestedByUserId;

  if (typeof documentId !== 'string' || typeof companyId !== 'string') {
    return null;
  }

  return {
    documentId,
    companyId,
    requestedByUserId:
      typeof requestedByUserId === 'string' ? requestedByUserId : undefined,
  };
};

@Processor('document-import', {
  concurrency: getDocumentImportQueueConcurrency(),
})
export class DocumentImportProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentImportProcessor.name);

  constructor(
    private readonly documentImportService: DocumentImportService,
    private readonly metricsService: MetricsService,
    @InjectQueue('document-import-dlq')
    private readonly documentImportDlq: Queue,
  ) {
    super();
  }

  async process(job: Job<unknown, unknown, string>) {
    const start = Date.now();
    const jobData = parseDocumentImportJobData(job.data);

    if (!jobData) {
      throw new Error(
        `Payload inválido para job de importação ${job.id ?? 'sem-id'}.`,
      );
    }

    this.logger.log({
      event: 'document_import_job_started',
      jobId: job.id,
      documentId: jobData.documentId,
      companyId: jobData.companyId,
      attemptsMade: job.attemptsMade,
    });

    try {
      const result = await this.documentImportService.processQueuedDocument(
        jobData.documentId,
      );

      this.metricsService.recordQueueJob(
        'document-import',
        job.name,
        Date.now() - start,
        'success',
        jobData.companyId,
      );

      this.logger.log({
        event: 'document_import_job_completed',
        jobId: job.id,
        documentId: jobData.documentId,
        companyId: jobData.companyId,
        durationMs: Date.now() - start,
        status: result.status,
      });

      return {
        documentId: result.documentId,
        status: result.status,
      };
    } catch (error) {
      this.metricsService.recordQueueJob(
        'document-import',
        job.name,
        Date.now() - start,
        'error',
        jobData.companyId,
      );
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<unknown, unknown, string> | undefined, error: Error) {
    if (!job) {
      return;
    }

    const jobData = parseDocumentImportJobData(job.data);
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinal = job.attemptsMade >= maxAttempts;

    this.logger.error(
      `[Job ${job.id}] Falhou${isFinal ? ' definitivamente' : ''}. Tipo: ${job.name}. Erro: ${error.message}`,
      error.stack,
    );

    if (!isFinal) {
      return;
    }

    if (jobData) {
      await this.documentImportService.markAsDeadLetter(
        jobData.documentId,
        jobData.companyId,
        error.message,
      );
    }

    try {
      const deadLetterPayload: DocumentImportDeadLetterPayload = {
        originalQueue: 'document-import',
        originalJobId: job.id,
        originalJobName: job.name,
        attemptsMade: job.attemptsMade,
        documentId: jobData?.documentId,
        companyId: jobData?.companyId,
        data: job.data,
        error: {
          message: error.message,
          stack: error.stack,
        },
        failedAt: new Date().toISOString(),
      };

      await this.documentImportDlq.add('dead-letter', deadLetterPayload, {
        attempts: 1,
        backoff: undefined,
        removeOnComplete: false,
        removeOnFail: false,
      });
    } catch (dlqError) {
      this.logger.error(
        `[Job ${job.id}] Falha ao publicar no DLQ: ${
          dlqError instanceof Error ? dlqError.message : String(dlqError)
        }`,
        dlqError instanceof Error ? dlqError.stack : undefined,
      );
    }
  }
}
