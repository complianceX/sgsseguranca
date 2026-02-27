import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import pdfParse from 'pdf-parse';

interface PDFData {
  text: string;
  numpages: number;
  info: any;
  metadata: any;
  version: string;
}
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';

@Injectable()
export class FileParserService {
  private readonly logger = new Logger(FileParserService.name);

  async extractText(
    buffer: Buffer,
    mimetype: string,
    originalname: string,
  ): Promise<string> {
    const lowerName = originalname.toLowerCase();
    const isPdf = mimetype === 'application/pdf' || lowerName.endsWith('.pdf');
    const isDocx =
      mimetype ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx');
    const isXlsx =
      mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimetype === 'application/vnd.ms-excel' ||
      lowerName.endsWith('.xlsx') ||
      lowerName.endsWith('.xls');
    const isTxt = mimetype.startsWith('text/') || lowerName.endsWith('.txt');

    try {
      if (isPdf) {
        return await this.extractTextFromPdf(buffer);
      } else if (isDocx) {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      } else if (isXlsx) {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_txt(sheet);
      } else if (isTxt || this.isLikelyText(buffer)) {
        return buffer.toString('utf-8');
      } else {
        throw new BadRequestException(
          `Formato ${mimetype || 'desconhecido'} não suportado para extração direta de texto.`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Erro ao extrair texto do arquivo:', message);
      throw new BadRequestException('Falha ao ler o conteúdo do arquivo.');
    }
  }

  async extractTextFromPdf(buffer: Buffer): Promise<string> {
    try {
      this.logger.log('Iniciando extração de texto do PDF com pdf-parse...');

      const parsePdf: (data: Buffer) => Promise<PDFData> =
        pdfParse as unknown as (data: Buffer) => Promise<PDFData>;

      const result: PDFData = await parsePdf(buffer);
      const fullText = typeof result.text === 'string' ? result.text : '';

      if (!fullText || fullText.trim().length === 0) {
        this.logger.warn('PDF não contém texto extraível');
        return '';
      }

      return this.cleanExtractedText(fullText);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Erro ao extrair texto do PDF:', message);
      throw new Error('Falha ao processar o arquivo PDF');
    }
  }

  private cleanExtractedText(text: string): string {
    let cleaned = text.replace(/\s+/g, ' ');
    // eslint-disable-next-line no-control-regex
    cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    cleaned = cleaned.replace(/-(\n|\r|\r\n)/g, '');
    cleaned = cleaned.replace(/(\n|\r|\r\n)+/g, '\n');
    cleaned = cleaned.replace(/\s+\n/g, '\n');
    cleaned = cleaned.replace(/\n\s+/g, '\n');
    return cleaned.trim();
  }

  private isLikelyText(buffer: Buffer): boolean {
    for (let i = 0; i < Math.min(buffer.length, 512); i++) {
      const charCode = buffer[i];
      if (charCode < 9 || (charCode > 13 && charCode < 32)) {
        return false;
      }
    }
    return true;
  }

  validateFile(
    buffer: Buffer,
    mimetype: string,
    maxSize: number = 20 * 1024 * 1024,
  ): void {
    if (buffer.length > maxSize) {
      throw new Error(
        `Arquivo excede o tamanho máximo de ${maxSize / 1024 / 1024}MB`,
      );
    }
  }

  generateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
