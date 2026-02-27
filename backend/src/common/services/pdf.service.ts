import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PuppeteerPoolService } from './puppeteer-pool.service';
import { PdfValidatorService } from './pdf-validator.service';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
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

  signAndSave(buffer: Buffer, originalName: string): Promise<string> {
    this.pdfValidator.validatePdfBuffer(buffer, 'sign');
    const hash = createHash('sha256').update(buffer).digest('hex');
    this.logger.log({
      event: 'pdf_signed',
      originalName,
      hash,
    });
    return Promise.resolve(hash);
  }

  verify(hash: string): Promise<{ hash: string; valid: boolean }> {
    this.logger.log({
      event: 'pdf_verify',
      hash,
    });
    return Promise.resolve({ hash, valid: false });
  }
}
