import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { StorageService } from '../common/services/storage.service';
import { MetricsService } from '../common/observability/metrics.service';

// concurrency: 3 — Puppeteer é memory-intensive (~200-400 MB por instância).
// Não ultrapasse 3 por container; ajuste para 1 se o plano Railway for small.
@Processor('pdf-generation', { concurrency: 3 })
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly storageService: StorageService,
    private readonly metricsService: MetricsService,
  ) {
    super();
  }

  // BullMQ v5+: @Process() foi removido. Implementar process() e rotear por job.name.
  async process(job: Job): Promise<any> {
    const start = Date.now();
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
}
