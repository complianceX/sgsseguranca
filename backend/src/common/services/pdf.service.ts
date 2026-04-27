import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { EntityManager, Repository } from 'typeorm';
import { DocumentRegistryEntry } from '../../document-registry/entities/document-registry.entity';
import { PdfIntegrityRecord } from '../entities/pdf-integrity-record.entity';
import { PuppeteerPoolService } from './puppeteer-pool.service';
import { PdfValidatorService } from './pdf-validator.service';

type PdfGenerationOptions = {
  format?: 'A4' | 'Letter' | 'Legal' | 'Tabloid';
  landscape?: boolean;
  preferCssPageSize?: boolean;
  margin?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
};

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    @InjectRepository(PdfIntegrityRecord)
    private readonly pdfIntegrityRepository: Repository<PdfIntegrityRecord>,
    @InjectRepository(DocumentRegistryEntry)
    private readonly documentRegistryRepository: Repository<DocumentRegistryEntry>,
    private readonly puppeteerPool: PuppeteerPoolService,
    private readonly pdfValidator: PdfValidatorService,
  ) {}

  /**
   * Gera um PDF a partir de uma string HTML usando o pool do Puppeteer.
   * @param html A string HTML para converter em PDF.
   * @returns Um Buffer com o conteúdo do PDF.
   */
  async generateFromHtml(
    html: string,
    options?: PdfGenerationOptions,
  ): Promise<Buffer> {
    this.logger.log('Gerando PDF a partir de HTML...');
    this.pdfValidator.validateHtmlContent(html);

    let page: Awaited<ReturnType<PuppeteerPoolService['getPage']>>;
    try {
      page = await this.puppeteerPool.getPage();
    } catch (error) {
      this.logger.error(
        'Pool do Puppeteer indisponível para geração de PDF',
        error,
      );
      throw new ServiceUnavailableException({
        error: 'PDF_BROWSER_UNAVAILABLE',
        message:
          'O serviço de geração de PDF está temporariamente indisponível. Tente novamente em instantes.',
      });
    }

    try {
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 30_000,
      });

      const pdfOptions = {
        format: options?.format ?? 'A4',
        landscape: options?.landscape ?? false,
        preferCSSPageSize: options?.preferCssPageSize ?? false,
        printBackground: true,
        margin: options?.margin ?? {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
        timeout: 60_000,
      };

      const pdfUint8Array = await page.pdf({
        ...pdfOptions,
      });

      const pdfBuffer = Buffer.from(pdfUint8Array);

      this.pdfValidator.validatePdfBuffer(pdfBuffer, 'generation');
      this.logger.log(
        `PDF gerado com sucesso (${(pdfBuffer.length / 1024).toFixed(2)} KB)`,
      );

      return pdfBuffer;
    } catch (error) {
      this.logger.error('Erro ao gerar PDF a partir de HTML', error);
      throw new ServiceUnavailableException({
        error: 'PDF_GENERATION_FAILED',
        message:
          'Não foi possível gerar o PDF no momento. Tente novamente em instantes.',
      });
    } finally {
      await this.puppeteerPool.releasePage(page);
    }
  }

  async signAndSave(
    buffer: Buffer,
    input: {
      originalName: string;
      signedByUserId?: string | null;
      recordedByUserId?: string | null;
      companyId?: string | null;
    },
  ): Promise<string> {
    return this.registerBufferIntegrity(buffer, input);
  }

  computeHash(buffer: Buffer): string {
    this.pdfValidator.validatePdfBuffer(buffer, 'sign');
    return createHash('sha256').update(buffer).digest('hex');
  }

  async registerBufferIntegrity(
    buffer: Buffer,
    input: {
      originalName: string;
      signedByUserId?: string | null;
      recordedByUserId?: string | null;
      companyId?: string | null;
    },
    options?: {
      manager?: EntityManager;
    },
  ): Promise<string> {
    this.pdfValidator.validatePdfBuffer(buffer, 'sign');
    const hash = this.computeHash(buffer);
    await this.registerHashIntegrity(hash, input, options);
    return hash;
  }

  async registerHashIntegrity(
    hash: string,
    input: {
      originalName: string;
      signedByUserId?: string | null;
      recordedByUserId?: string | null;
      companyId?: string | null;
    },
    options?: {
      manager?: EntityManager;
    },
  ): Promise<void> {
    const integrityRepository = options?.manager
      ? options.manager.getRepository(PdfIntegrityRecord)
      : this.pdfIntegrityRepository;
    // O mesmo campo atende dois caminhos distintos:
    // - assinado digitalmente por um usuário
    // - registrado na esteira documental por um responsável operacional
    const integrityActorUserId =
      input.signedByUserId || input.recordedByUserId || null;

    await integrityRepository.upsert(
      {
        hash,
        original_name: input.originalName || null,
        signed_by_user_id: integrityActorUserId,
        company_id: input.companyId || null,
      },
      ['hash'],
    );
    this.logger.log({
      event: 'pdf_integrity_registered',
      originalName: input.originalName,
      hash,
      actorUserId: integrityActorUserId,
      mode: input.signedByUserId ? 'signed' : 'registered',
    });
  }

  async verify(hash: string): Promise<{
    hash: string;
    valid: boolean;
    originalName?: string | null;
    signedAt?: string;
    document?: {
      module: string;
      entityId: string;
      documentType: string;
      documentCode?: string | null;
      fileKey?: string;
      originalName?: string | null;
    };
  }> {
    this.logger.log({
      event: 'pdf_verify',
      hash,
    });

    const normalizedHash = String(hash || '')
      .trim()
      .toLowerCase();
    const record = await this.pdfIntegrityRepository.findOne({
      where: { hash: normalizedHash },
    });

    if (!record) {
      return { hash: normalizedHash, valid: false };
    }

    const registryEntry = await this.documentRegistryRepository.findOne({
      where: record.company_id
        ? { file_hash: normalizedHash, company_id: record.company_id }
        : { file_hash: normalizedHash },
      order: {
        updated_at: 'DESC',
      },
    });

    return {
      hash: normalizedHash,
      valid: true,
      originalName:
        record.original_name || registryEntry?.original_name || null,
      signedAt: record.created_at?.toISOString(),
      document: registryEntry
        ? {
            module: registryEntry.module,
            entityId: registryEntry.entity_id,
            documentType: registryEntry.document_type,
            documentCode: registryEntry.document_code,
            fileKey: registryEntry.file_key,
            originalName: registryEntry.original_name,
          }
        : undefined,
    };
  }
}
