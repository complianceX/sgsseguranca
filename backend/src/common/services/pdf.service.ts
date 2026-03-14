import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { PdfIntegrityRecord } from '../entities/pdf-integrity-record.entity';
import { PuppeteerPoolService } from './puppeteer-pool.service';
import { PdfValidatorService } from './pdf-validator.service';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    @InjectRepository(PdfIntegrityRecord)
    private readonly pdfIntegrityRepository: Repository<PdfIntegrityRecord>,
    private readonly puppeteerPool: PuppeteerPoolService,
    private readonly pdfValidator: PdfValidatorService,
  ) {}

  /**
   * Gera um PDF a partir de uma string HTML usando o pool do Puppeteer.
   * @param html A string HTML para converter em PDF.
   * @returns Um Buffer com o conteúdo do PDF.
   */
  async generateFromHtml(html: string): Promise<Buffer> {
    this.logger.log('Gerando PDF a partir de HTML...');
    this.pdfValidator.validateHtmlContent(html);

    const page = await this.puppeteerPool.getPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfUint8Array = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
      });

      const pdfBuffer = Buffer.from(pdfUint8Array);

      this.pdfValidator.validatePdfBuffer(pdfBuffer, 'generation');
      this.logger.log(
        `PDF gerado com sucesso (${(pdfBuffer.length / 1024).toFixed(2)} KB)`,
      );

      return pdfBuffer;
    } catch (error) {
      this.logger.error('Erro ao gerar PDF a partir de HTML', error);
      throw error;
    } finally {
      await this.puppeteerPool.releasePage(page);
    }
  }

  async signAndSave(
    buffer: Buffer,
    input: {
      originalName: string;
      signedByUserId?: string | null;
      companyId?: string | null;
    },
  ): Promise<string> {
    this.pdfValidator.validatePdfBuffer(buffer, 'sign');
    const hash = createHash('sha256').update(buffer).digest('hex');
    await this.pdfIntegrityRepository.upsert(
      {
        hash,
        original_name: input.originalName || null,
        signed_by_user_id: input.signedByUserId || null,
        company_id: input.companyId || null,
      },
      ['hash'],
    );
    this.logger.log({
      event: 'pdf_signed',
      originalName: input.originalName,
      hash,
    });
    return hash;
  }

  async verify(hash: string): Promise<{
    hash: string;
    valid: boolean;
    originalName?: string | null;
    signedAt?: string;
  }> {
    this.logger.log({
      event: 'pdf_verify',
      hash,
    });

    const record = await this.pdfIntegrityRepository.findOne({
      where: { hash },
    });

    if (!record) {
      return { hash, valid: false };
    }

    return {
      hash,
      valid: true,
      originalName: record.original_name,
      signedAt: record.created_at?.toISOString(),
    };
  }
}
