import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import * as crypto from 'crypto';

interface PDFData {
  text: string;
  numpages: number;
  info: unknown;
  metadata: unknown;
  version: string;
}
import * as mammoth from 'mammoth';
import { excelSheetToText } from '../../common/utils/excel.util';
import {
  getDocumentImportExtractedTextMaxBytes,
  getDocumentImportOfficeArchiveMaxEntries,
  getDocumentImportOfficeArchiveMaxUncompressedBytes,
} from '../document-import-runtime-config';

const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_EOCD_MIN_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 0xffff;

type PdfParseFn = (data: Buffer) => Promise<PDFData>;
let pdfParseLoader: Promise<PdfParseFn> | null = null;

async function loadPdfParse(): Promise<PdfParseFn> {
  if (!pdfParseLoader) {
    pdfParseLoader = import('pdf-parse').then((module) => {
      const candidate = module.default;
      return candidate as unknown as PdfParseFn;
    });
  }

  return pdfParseLoader;
}

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
      let extractedText: string;
      if (isPdf) {
        extractedText = await this.extractTextFromPdf(buffer);
      } else if (isDocx) {
        this.assertOfficeArchiveWithinBudget(buffer);
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } else if (isXlsx) {
        this.assertOfficeArchiveWithinBudget(buffer);
        extractedText = await excelSheetToText(buffer);
      } else if (isTxt || this.isLikelyText(buffer)) {
        extractedText = buffer.toString('utf-8');
      } else {
        throw new BadRequestException(
          `Formato ${mimetype || 'desconhecido'} não suportado para extração direta de texto.`,
        );
      }
      return this.assertExtractedTextWithinBudget(extractedText);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Erro ao extrair texto do arquivo:', message);
      if (error instanceof PayloadTooLargeException) {
        throw error;
      }
      throw new BadRequestException('Falha ao ler o conteúdo do arquivo.');
    }
  }

  async extractTextFromPdf(buffer: Buffer): Promise<string> {
    try {
      this.logger.log('Iniciando extração de texto do PDF com pdf-parse...');
      const parsePdf = await loadPdfParse();
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
      throw new BadRequestException('Falha ao processar o arquivo PDF.');
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

  private assertExtractedTextWithinBudget(text: string): string {
    const maxBytes = getDocumentImportExtractedTextMaxBytes();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new PayloadTooLargeException(
        'Texto extraído excede o limite permitido para importação.',
      );
    }
    return text;
  }

  private assertOfficeArchiveWithinBudget(buffer: Buffer): void {
    const eocdOffset = this.findZipEndOfCentralDirectoryOffset(buffer);
    if (eocdOffset < 0) {
      throw new BadRequestException('Arquivo Office compactado inválido.');
    }

    const entries = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
    const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
    if (
      entries === 0xffff ||
      centralDirectorySize === 0xffffffff ||
      centralDirectoryOffset === 0xffffffff
    ) {
      throw new BadRequestException(
        'Arquivos Office no formato ZIP64 não são suportados para importação.',
      );
    }

    if (entries > getDocumentImportOfficeArchiveMaxEntries()) {
      throw new PayloadTooLargeException(
        'Arquivo Office contém entradas demais para importação.',
      );
    }

    const directoryEnd = centralDirectoryOffset + centralDirectorySize;
    if (directoryEnd > buffer.length || directoryEnd > eocdOffset) {
      throw new BadRequestException('Diretório do arquivo Office inválido.');
    }

    let cursor = centralDirectoryOffset;
    let totalUncompressedBytes = 0;
    const maxUncompressedBytes =
      getDocumentImportOfficeArchiveMaxUncompressedBytes();
    for (let index = 0; index < entries; index += 1) {
      if (
        cursor + 46 > directoryEnd ||
        buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
      ) {
        throw new BadRequestException('Entrada ZIP Office inválida.');
      }

      const uncompressedBytes = buffer.readUInt32LE(cursor + 24);
      if (uncompressedBytes === 0xffffffff) {
        throw new BadRequestException(
          'Arquivos Office no formato ZIP64 não são suportados para importação.',
        );
      }
      totalUncompressedBytes += uncompressedBytes;
      if (totalUncompressedBytes > maxUncompressedBytes) {
        throw new PayloadTooLargeException(
          'Arquivo Office excede o limite expandido para importação.',
        );
      }

      const fileNameLength = buffer.readUInt16LE(cursor + 28);
      const extraLength = buffer.readUInt16LE(cursor + 30);
      const commentLength = buffer.readUInt16LE(cursor + 32);
      cursor += 46 + fileNameLength + extraLength + commentLength;
    }
  }

  private findZipEndOfCentralDirectoryOffset(buffer: Buffer): number {
    const firstCandidate = Math.max(
      0,
      buffer.length - ZIP_EOCD_MIN_BYTES - ZIP_MAX_COMMENT_BYTES,
    );
    for (
      let cursor = buffer.length - ZIP_EOCD_MIN_BYTES;
      cursor >= firstCandidate;
      cursor -= 1
    ) {
      if (
        buffer.readUInt32LE(cursor) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE
      ) {
        return cursor;
      }
    }
    return -1;
  }

  validateFile(
    buffer: Buffer,
    _mimetype: string,
    maxSize: number = 20 * 1024 * 1024,
  ): void {
    if (buffer.length > maxSize) {
      throw new BadRequestException(
        `Arquivo excede o tamanho máximo de ${maxSize / 1024 / 1024}MB`,
      );
    }
  }

  generateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
