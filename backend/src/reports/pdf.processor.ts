import { Processor, WorkerHost, Process } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { StorageService } from '../common/services/storage.service';

// concurrency: 3 — Puppeteer é memory-intensive (~200-400 MB por instância).
// Não ultrapasse 3 por container; ajuste para 1 se o plano Railway for small.
@Processor('pdf-generation', { concurrency: 3 })
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly storageService: StorageService,
  ) {
    super();
  }

  @Process('generate')
  async handleGenerate(
    job: Job<{
      reportType: string;
      params: unknown;
      userId: string;
      companyId: string;
    }>,
  ) {
    const { reportType, params, userId, companyId } = job.data;
    this.logger.log(
      `[Job ${job.id}] Gerando PDF: tipo=${reportType} para user=${userId} company=${companyId}`,
    );

    const buffer = await this.reportsService.generateBuffer(reportType, params);

    const url = await this.storageService.uploadPdf(buffer, userId);

    this.logger.log(`[Job ${job.id}] PDF gerado e armazenado`);
    return { url };
  }
}
