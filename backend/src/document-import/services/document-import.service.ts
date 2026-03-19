import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { DocumentImport } from '../entities/document-import.entity';
import { DocumentImportStatus } from '../entities/document-import-status.enum';
import {
  DocumentImportResponseDto,
  DocumentAnalysisDto,
  DocumentValidationResultDto,
} from '../dto/document-analysis.dto';
import { FileParserService } from './file-parser.service';
import { DocumentClassifierService } from './document-classifier.service';
import { DocumentInterpreterService } from './document-interpreter.service';
import { DocumentValidationService } from './document-validation.service';
import { DdsService } from '../../dds/dds.service';
import { TenantService } from '../../common/tenant/tenant.service';
import { ForbiddenException } from '@nestjs/common';

@Injectable()
export class DocumentImportService {
  private readonly logger = new Logger(DocumentImportService.name);

  constructor(
    @InjectRepository(DocumentImport)
    private readonly documentImportRepository: Repository<DocumentImport>,
    private readonly fileParserService: FileParserService,
    private readonly documentClassifierService: DocumentClassifierService,
    private readonly documentInterpreterService: DocumentInterpreterService,
    private readonly documentValidationService: DocumentValidationService,
    private readonly ddsService: DdsService,
    private readonly tenantService: TenantService,
  ) {}

  private assertTenantAccess(empresaId: string) {
    const tenantId = this.tenantService.getTenantId();
    const isSuperAdmin = this.tenantService.isSuperAdmin();
    if (!isSuperAdmin && tenantId && empresaId !== tenantId) {
      throw new ForbiddenException('Acesso cross-tenant negado.');
    }
  }

  async processDocument(
    fileBuffer: Buffer,
    empresaId: string,
    tipoDocumentoManual?: string,
    mimetype: string = 'application/pdf',
    originalname: string = 'document.pdf',
  ): Promise<DocumentImportResponseDto> {
    this.assertTenantAccess(empresaId);
    this.logger.log(`Processando novo documento para empresa: ${empresaId}`);

    const hash = this.fileParserService.generateFileHash(fileBuffer);
    const existingDocument = await this.documentImportRepository.findOne({
      where: { hash, empresaId },
    });

    if (existingDocument) {
      // CORREÇÃO: Lançar uma exceção específica do NestJS melhora a consistência e o tratamento de erros no controller.
      throw new BadRequestException(
        'Este documento já foi importado anteriormente.',
      );
    }

    const documentImport = this.documentImportRepository.create();
    documentImport.empresaId = empresaId;
    documentImport.hash = hash;
    documentImport.status = DocumentImportStatus.PROCESSING;
    documentImport.nomeArquivo = originalname || `upload_${Date.now()}.pdf`;
    documentImport.tipoDocumento = tipoDocumentoManual || 'DESCONHECIDO';

    await this.documentImportRepository.save(documentImport);

    try {
      const textoExtraido = await this.fileParserService.extractText(
        fileBuffer,
        mimetype,
        originalname,
      );
      const classification =
        await this.documentClassifierService.classifyDocument(textoExtraido);

      const tipoDocumentoFinal =
        tipoDocumentoManual || classification.tipoDocumento;

      await this.updateRecordWithClassification(
        documentImport.id,
        empresaId,
        tipoDocumentoFinal,
        classification.score,
      );

      const analysis = await this.documentInterpreterService.interpretDocument(
        textoExtraido,
        tipoDocumentoFinal,
      );

      const validation =
        this.documentValidationService.validateDocument(analysis);

      await this.updateRecordWithAnalysis(
        documentImport.id,
        empresaId,
        analysis,
        validation,
        textoExtraido.length,
      );

      // RECOMENDAÇÃO: Esta lógica está acoplada. No futuro, refatorar para um padrão (ex: Factory ou Strategy)
      // que delega a criação para um "handler" específico do tipo de documento,
      // tornando o sistema mais extensível para novos tipos.
      if (tipoDocumentoFinal === 'DDS') {
        try {
          const dataString =
            analysis.data instanceof Date
              ? analysis.data.toISOString()
              : analysis.data || new Date().toISOString();

          const autoCreatedEntity = await this.ddsService.create({
            tema: analysis.tema || `Importado: ${originalname}`,
            conteudo:
              analysis.conteudo ||
              analysis.resumo ||
              textoExtraido.substring(0, 500),
            data: dataString,
            company_id: empresaId,
            site_id: analysis.site_id || '', // Pode precisar ser preenchido manualmente depois
            facilitador_id: analysis.facilitador_id || '',
          });
          this.logger.log(
            `DDS auto-criado com sucesso: ${autoCreatedEntity?.id}`,
          );
        } catch (err: any) {
          this.logger.warn(
            `Falha ao auto-criar DDS: ${(err as Error).message}`,
          );
        }
      }

      this.logger.log('Processamento concluído com sucesso');

      return {
        success: true,
        documentId: documentImport.id,
        tipoDocumento: tipoDocumentoFinal,
        tipoDocumentoDescricao:
          this.documentClassifierService.getDocumentTypeDescription(
            tipoDocumentoFinal,
          ),
        analysis,
        validation,
        metadata: {
          tamanhoArquivo: fileBuffer.length,
          quantidadeTexto: textoExtraido.length,
          hash,
          timestamp: new Date(),
          scoreClassificacao: analysis.scoreConfianca || 0,
        },
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';
      await this.markAsFailed(documentImport.id, empresaId, errorMessage);
      throw error;
    }
  }

  private async updateRecordWithClassification(
    documentId: string,
    empresaId: string,
    tipoDocumento: string,
    scoreClassificacao: number,
  ): Promise<void> {
    // CORREÇÃO: Ler o registro existente antes de atualizar para evitar sobrescrever metadados.
    const record = await this.documentImportRepository.findOne({
      where: { id: documentId, empresaId },
    });

    const existingMetadata = record?.metadata || {};

    await this.documentImportRepository.update(
      { id: documentId, empresaId },
      {
        tipoDocumento: tipoDocumento,
        status: DocumentImportStatus.PROCESSING,
        metadata: {
          ...existingMetadata,
          scoreClassificacao,
        } as Record<string, any>,
      },
    );
  }

  private async updateRecordWithAnalysis(
    documentId: string,
    empresaId: string,
    analysis: DocumentAnalysisDto,
    validation: DocumentValidationResultDto,
    textoExtraidoLength: number,
  ): Promise<void> {
    const record = await this.documentImportRepository.findOne({
      where: { id: documentId, empresaId },
    });

    const existingMetadata = record?.metadata || {};

    await this.documentImportRepository.update(
      { id: documentId, empresaId },
      {
        jsonEstruturado: analysis as Record<string, any>, // jsonb column remains any for now
        status: DocumentImportStatus.COMPLETED,
        metadata: {
          ...existingMetadata,
          quantidadeTexto: textoExtraidoLength,
          validacao: validation as Record<string, any>,
          timestampFinalizacao: new Date().toISOString(),
        } as Record<string, any>,
      },
    );
  }

  private async markAsFailed(
    documentId: string,
    empresaId: string,
    errorMessage: string,
  ): Promise<void> {
    const record = await this.documentImportRepository.findOne({
      where: { id: documentId, empresaId },
    });

    const existingMetadata = record?.metadata || {};

    await this.documentImportRepository.update(
      { id: documentId, empresaId },
      {
        status: DocumentImportStatus.FAILED,
        metadata: {
          ...existingMetadata,
          erro: errorMessage,
          timestampFalha: new Date().toISOString(),
        } as Record<string, any>,
      },
    );
  }

  async getDocumentStatus(documentId: string): Promise<DocumentImport | null> {
    const tenantId = this.tenantService.getTenantId();
    return await this.documentImportRepository.findOne({
      where: tenantId
        ? { id: documentId, empresaId: tenantId }
        : { id: documentId },
    });
  }

  async getDocumentsByEmpresa(empresaId: string): Promise<DocumentImport[]> {
    this.assertTenantAccess(empresaId);
    return await this.documentImportRepository.find({
      where: { empresaId: empresaId },
      order: { createdAt: 'DESC' },
    });
  }

  async getDocumentsByStatus(
    status: DocumentImportStatus,
  ): Promise<DocumentImport[]> {
    const tenantId = this.tenantService.getTenantId();
    if (!this.tenantService.isSuperAdmin() && !tenantId) {
      // Sem tenant no contexto → fail closed
      throw new ForbiddenException('Contexto de empresa não definido.');
    }
    const where: FindOptionsWhere<DocumentImport> = tenantId
      ? { status, empresaId: tenantId }
      : { status };
    return await this.documentImportRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }
}
