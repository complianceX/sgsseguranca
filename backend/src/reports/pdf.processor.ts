import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { StorageService } from '../common/services/storage.service';

@Processor('pdf-generation')
@Injectable()
export class PdfProcessor {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly storageService: StorageService,
  ) {}

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
