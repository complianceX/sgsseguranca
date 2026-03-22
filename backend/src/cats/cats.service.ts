import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import * as path from 'path';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { StorageService } from '../common/services/storage.service';
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { DocumentRegistryService } from '../document-registry/document-registry.service';
import { DocumentVideosService } from '../document-videos/document-videos.service';
import {
  normalizeOffsetPagination,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';
import { CloseCatDto } from './dto/close-cat.dto';
import { CreateCatDto } from './dto/create-cat.dto';
import { StartCatInvestigationDto } from './dto/start-cat-investigation.dto';
import { UpdateCatDto } from './dto/update-cat.dto';
import {
  Cat,
  CatAttachment,
  CatAttachmentCategory,
  CatStatus,
} from './entities/cat.entity';

type CatPdfAvailability =
  | 'ready'
  | 'registered_without_signed_url'
  | 'not_emitted';

@Injectable()
export class CatsService {
  private readonly logger = new Logger(CatsService.name);

  constructor(
    @InjectRepository(Cat)
    private readonly catsRepository: Repository<Cat>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Site)
    private readonly sitesRepository: Repository<Site>,
    private readonly tenantService: TenantService,
    private readonly storageService: StorageService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly documentRegistryService: DocumentRegistryService,
    private readonly documentVideosService: DocumentVideosService,
    private readonly auditService: AuditService,
  ) {}

  async create(createDto: CreateCatDto, actorId?: string): Promise<Cat> {
    const companyId = this.getTenantIdOrThrow();
    await this.validateScopedRelations(companyId, {
      site_id: createDto.site_id,
      worker_id: createDto.worker_id,
    });
    const numero = this.normalizeCatNumber(
      createDto.numero?.trim() || (await this.generateCatNumber(companyId)),
    );
    await this.ensureUniqueNumber(companyId, numero);

    const cat = this.catsRepository.create({
      ...createDto,
      numero,
      company_id: companyId,
      data_ocorrencia: new Date(createDto.data_ocorrencia),
      tipo: createDto.tipo || 'tipico',
      gravidade: createDto.gravidade || 'moderada',
      status: 'aberta',
      opened_by_id: actorId,
      opened_at: new Date(),
    });

    const saved = await this.catsRepository.save(cat);
    await this.writeAuditLog(AuditAction.CREATE, saved, actorId, {
      event: 'cat_opened',
      companyId,
      status: saved.status,
    });
    return saved;
  }

  async findAll(filters?: {
    status?: CatStatus;
    worker_id?: string;
    site_id?: string;
  }): Promise<Cat[]> {
    const page = await this.findPaginated({
      ...filters,
      page: 1,
      limit: 100,
    });
    return page.data;
  }

  async findPaginated(filters?: {
    status?: CatStatus;
    worker_id?: string;
    site_id?: string;
    page?: number;
    limit?: number;
  }) {
    const companyId = this.getTenantIdOrThrow();
    const { page, limit, skip } = normalizeOffsetPagination(filters, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.catsRepository
      .createQueryBuilder('cat')
      .leftJoinAndSelect('cat.site', 'site')
      .leftJoinAndSelect('cat.worker', 'worker')
      .leftJoinAndSelect('cat.opened_by', 'opened_by')
      .leftJoinAndSelect('cat.investigated_by', 'investigated_by')
      .leftJoinAndSelect('cat.closed_by', 'closed_by')
      .where('cat.company_id = :companyId', { companyId })
      .orderBy('cat.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (filters?.status) {
      query.andWhere('cat.status = :status', { status: filters.status });
    }

    if (filters?.worker_id) {
      query.andWhere('cat.worker_id = :workerId', {
        workerId: filters.worker_id,
      });
    }

    if (filters?.site_id) {
      query.andWhere('cat.site_id = :siteId', { siteId: filters.site_id });
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Cat> {
    const companyId = this.getTenantIdOrThrow();
    const cat = await this.catsRepository.findOne({
      where: { id, company_id: companyId },
      relations: [
        'company',
        'site',
        'worker',
        'opened_by',
        'investigated_by',
        'closed_by',
      ],
    });

    if (!cat) {
      throw new NotFoundException(`CAT com ID ${id} não encontrada`);
    }

    return cat;
  }

  async update(
    id: string,
    updateDto: UpdateCatDto,
    actorId?: string,
  ): Promise<Cat> {
    const cat = await this.findOne(id);
    const companyId = cat.company_id;
    if (cat.status === 'fechada') {
      throw new BadRequestException(
        'CAT fechada não pode ser alterada por atualização genérica.',
      );
    }

    await this.validateScopedRelations(companyId, {
      site_id: updateDto.site_id,
      worker_id: updateDto.worker_id,
    });

    const nextNumber = updateDto.numero
      ? this.normalizeCatNumber(updateDto.numero)
      : undefined;
    if (nextNumber && nextNumber !== cat.numero) {
      await this.ensureUniqueNumber(companyId, nextNumber, cat.id);
    }

    Object.assign(cat, {
      ...updateDto,
      ...(nextNumber ? { numero: nextNumber } : {}),
      ...(updateDto.data_ocorrencia
        ? { data_ocorrencia: new Date(updateDto.data_ocorrencia) }
        : {}),
    });

    const saved = await this.catsRepository.save(cat);
    await this.writeAuditLog(AuditAction.UPDATE, saved, actorId, {
      event: 'cat_updated',
      companyId: saved.company_id,
      status: saved.status,
      fields: Object.keys(updateDto),
    });
    return saved;
  }

  async startInvestigation(
    id: string,
    dto: StartCatInvestigationDto,
    actorId?: string,
  ): Promise<Cat> {
    const cat = await this.findOne(id);
    if (cat.status === 'fechada') {
      throw new BadRequestException(
        'CAT já está fechada e não pode voltar para investigação.',
      );
    }

    cat.status = 'investigacao';
    cat.investigacao_detalhes = dto.investigacao_detalhes;
    cat.causa_raiz = dto.causa_raiz || cat.causa_raiz;
    cat.acao_imediata = dto.acao_imediata || cat.acao_imediata;
    cat.investigated_by_id = actorId;
    cat.investigated_at = new Date();

    const saved = await this.catsRepository.save(cat);
    await this.writeAuditLog(AuditAction.UPDATE, saved, actorId, {
      event: 'cat_investigation_started',
      companyId: saved.company_id,
      status: saved.status,
    });
    return saved;
  }

  async close(id: string, dto: CloseCatDto, actorId?: string): Promise<Cat> {
    const cat = await this.findOne(id);
    if (cat.status === 'fechada') {
      throw new BadRequestException('CAT já está fechada.');
    }

    cat.status = 'fechada';
    cat.plano_acao_fechamento = dto.plano_acao_fechamento;
    cat.licoes_aprendidas = dto.licoes_aprendidas || cat.licoes_aprendidas;
    cat.causa_raiz = dto.causa_raiz || cat.causa_raiz;
    cat.closed_by_id = actorId;
    cat.closed_at = new Date();

    const saved = await this.catsRepository.save(cat);
    await this.writeAuditLog(AuditAction.UPDATE, saved, actorId, {
      event: 'cat_closed',
      companyId: saved.company_id,
      status: saved.status,
    });
    return saved;
  }

  async addAttachment(
    id: string,
    input: {
      fileBuffer: Buffer;
      originalName?: string;
      mimeType?: string;
      category?: CatAttachmentCategory;
    },
    actorId?: string,
  ): Promise<CatAttachment> {
    if (!input.fileBuffer?.length) {
      throw new BadRequestException('Arquivo de anexo não enviado.');
    }

    const cat = await this.findOne(id);
    const timestamp = new Date();
    const safeName = this.sanitizeFilename(
      input.originalName || `cat-anexo-${Date.now()}.bin`,
    );
    const folder = path.posix.join(
      'cats',
      cat.company_id,
      String(timestamp.getUTCFullYear()),
      String(timestamp.getUTCMonth() + 1).padStart(2, '0'),
    );
    const fileHash = createHash('sha256')
      .update(input.fileBuffer)
      .digest('hex');
    const fileKey = path.posix.join(
      folder,
      `${cat.id}-${Date.now()}-${fileHash.slice(0, 12)}-${safeName}`,
    );

    await this.storageService.uploadFile(
      fileKey,
      input.fileBuffer,
      input.mimeType || 'application/octet-stream',
    );

    const attachment: CatAttachment = {
      id: randomUUID(),
      file_name: safeName,
      file_key: fileKey,
      file_type: input.mimeType || 'application/octet-stream',
      file_hash: fileHash,
      category: input.category || 'geral',
      uploaded_by_id: actorId,
      uploaded_at: timestamp,
    };

    try {
      cat.attachments = [...(cat.attachments || []), attachment];
      await this.catsRepository.save(cat);
      await this.writeAuditLog(AuditAction.UPDATE, cat, actorId, {
        event: 'cat_attachment_added',
        companyId: cat.company_id,
        attachmentId: attachment.id,
        category: attachment.category,
        fileKey: attachment.file_key,
        fileHash: attachment.file_hash,
      });
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        'cats.addAttachment',
        fileKey,
        (key) => this.storageService.deleteFile(key),
      );
      throw error;
    }

    return attachment;
  }

  async removeAttachment(
    id: string,
    attachmentId: string,
    actorId?: string,
  ): Promise<void> {
    const cat = await this.findOne(id);
    const current = cat.attachments || [];
    const attachment = current.find((item) => item.id === attachmentId);
    if (!attachment) {
      throw new NotFoundException('Anexo não encontrado para esta CAT.');
    }

    cat.attachments = current.filter((item) => item.id !== attachmentId);
    await this.catsRepository.save(cat);
    let storageCleanup: 'deleted' | 'pending_manual_cleanup' = 'deleted';
    try {
      await this.storageService.deleteFile(attachment.file_key);
    } catch (error) {
      storageCleanup = 'pending_manual_cleanup';
      this.logger.error(
        `Falha ao remover arquivo do storage para anexo da CAT ${attachment.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
    await this.writeAuditLog(AuditAction.UPDATE, cat, actorId, {
      event: 'cat_attachment_removed',
      companyId: cat.company_id,
      attachmentId,
      fileKey: attachment.file_key,
      storageCleanup,
    });
  }

  async getAttachmentAccess(
    id: string,
    attachmentId: string,
    actorId?: string,
  ): Promise<{
    attachmentId: string;
    fileName: string;
    fileType: string;
    url: string;
  }> {
    const cat = await this.findOne(id);
    const attachment = (cat.attachments || []).find(
      (item) => item.id === attachmentId,
    );
    if (!attachment) {
      throw new NotFoundException('Anexo não encontrado para esta CAT.');
    }

    const url = await this.storageService.getPresignedDownloadUrl(
      attachment.file_key,
    );
    await this.writeAuditLog(AuditAction.READ, cat, actorId, {
      event: 'cat_attachment_accessed',
      companyId: cat.company_id,
      attachmentId: attachment.id,
      category: attachment.category,
      fileKey: attachment.file_key,
    });
    return {
      attachmentId: attachment.id,
      fileName: attachment.file_name,
      fileType: attachment.file_type,
      url,
    };
  }

  async listVideoAttachments(id: string) {
    const cat = await this.findOne(id);
    return this.documentVideosService.listByDocument({
      companyId: cat.company_id,
      module: 'cat',
      documentId: cat.id,
    });
  }

  async uploadVideoAttachment(
    id: string,
    input: {
      buffer: Buffer;
      originalName: string;
      mimeType: string;
    },
    actorId?: string,
  ) {
    const cat = await this.findOne(id);
    this.assertCatVideoMutable(cat);
    const result = await this.documentVideosService.uploadForDocument({
      companyId: cat.company_id,
      module: 'cat',
      documentId: cat.id,
      buffer: input.buffer,
      originalName: input.originalName,
      mimeType: input.mimeType,
      uploadedById: actorId,
    });
    await this.writeAuditLog(AuditAction.UPDATE, cat, actorId, {
      event: 'cat_video_attachment_uploaded',
      attachmentId: result.attachment.id,
      mimeType: result.attachment.mime_type,
      storageKey: result.attachment.storage_key,
    });
    return result;
  }

  async getVideoAttachmentAccess(
    id: string,
    attachmentId: string,
    actorId?: string,
  ) {
    const cat = await this.findOne(id);
    const result = await this.documentVideosService.getAccess({
      companyId: cat.company_id,
      module: 'cat',
      documentId: cat.id,
      attachmentId,
    });
    await this.writeAuditLog(AuditAction.READ, cat, actorId, {
      event: 'cat_video_attachment_accessed',
      attachmentId,
      availability: result.availability,
    });
    return result;
  }

  async removeVideoAttachment(
    id: string,
    attachmentId: string,
    actorId?: string,
  ) {
    const cat = await this.findOne(id);
    this.assertCatVideoMutable(cat);
    const result = await this.documentVideosService.removeFromDocument({
      companyId: cat.company_id,
      module: 'cat',
      documentId: cat.id,
      attachmentId,
      removedById: actorId,
    });
    await this.writeAuditLog(AuditAction.UPDATE, cat, actorId, {
      event: 'cat_video_attachment_removed',
      attachmentId,
    });
    return result;
  }

  async attachPdf(
    id: string,
    file: Express.Multer.File,
    actorId?: string,
  ): Promise<{
    catId: string;
    hasFinalPdf: boolean;
    availability: CatPdfAvailability;
    message: string;
    degraded: boolean;
    fileKey: string;
    folderPath: string;
    originalName: string;
    documentCode: string;
    fileHash: string;
  }> {
    const cat = await this.findOne(id);
    this.assertReadyForFinalPdf(cat);
    const originalName =
      file.originalname?.trim() || `${cat.numero || `cat-${cat.id}`}.pdf`;
    const fileKey = this.documentStorageService.generateDocumentKey(
      cat.company_id,
      'cats',
      cat.id,
      originalName,
    );
    const folderPath = `cats/${cat.company_id}`;

    await this.documentStorageService.uploadFile(
      fileKey,
      file.buffer,
      file.mimetype,
    );

    try {
      const { hash, registryEntry } =
        await this.documentGovernanceService.registerFinalDocument({
          companyId: cat.company_id,
          module: 'cat',
          entityId: cat.id,
          title: `CAT ${cat.numero}`,
          documentDate: cat.data_ocorrencia || cat.created_at,
          documentCode: this.buildDocumentCode(cat),
          fileKey,
          folderPath,
          originalName,
          mimeType: file.mimetype || 'application/pdf',
          fileBuffer: file.buffer,
          createdBy: actorId || null,
          persistEntityMetadata: async (manager, computedHash) => {
            await manager.getRepository(Cat).update(cat.id, {
              pdf_file_key: fileKey,
              pdf_folder_path: folderPath,
              pdf_original_name: originalName,
              pdf_file_hash: computedHash,
              pdf_generated_at: new Date(),
            });
          },
        });

      await this.writeAuditLog(AuditAction.UPDATE, cat, actorId, {
        event: 'cat_final_pdf_emitted',
        companyId: cat.company_id,
        status: cat.status,
        fileKey,
        folderPath,
        originalName,
        documentCode: registryEntry.document_code,
        fileHash: hash,
      });

      return {
        catId: cat.id,
        hasFinalPdf: true,
        availability: 'ready',
        message: 'PDF final da CAT emitido e governado com sucesso.',
        degraded: false,
        fileKey,
        folderPath,
        originalName,
        documentCode:
          registryEntry.document_code || this.buildDocumentCode(cat),
        fileHash: hash,
      };
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        `cats.attachPdf:${cat.id}`,
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }
  }

  async getPdfAccess(
    id: string,
    actorId?: string,
  ): Promise<{
    catId: string;
    hasFinalPdf: boolean;
    availability: CatPdfAvailability;
    message: string;
    degraded: boolean;
    fileKey: string | null;
    folderPath: string | null;
    originalName: string | null;
    fileHash: string | null;
    documentCode: string | null;
    url: string | null;
  }> {
    const cat = await this.findOne(id);
    const registryEntry = await this.documentRegistryService.findByDocument(
      'cat',
      cat.id,
      'pdf',
      cat.company_id,
    );

    if (!cat.pdf_file_key) {
      const payload = {
        catId: cat.id,
        hasFinalPdf: false,
        availability: 'not_emitted' as const,
        message:
          'A CAT ainda não possui PDF final emitido. Gere o documento final governado para habilitar download e envio oficial.',
        degraded: false,
        fileKey: null,
        folderPath: null,
        originalName: null,
        fileHash: null,
        documentCode:
          registryEntry?.document_code || this.buildDocumentCode(cat),
        url: null,
      };
      await this.writeAuditLog(AuditAction.READ, cat, actorId, {
        event: 'cat_pdf_access_checked',
        companyId: cat.company_id,
        availability: payload.availability,
        hasFinalPdf: payload.hasFinalPdf,
      });
      return payload;
    }

    let url: string | null = null;
    let availability: CatPdfAvailability = 'ready';
    let degraded = false;
    let message = 'PDF final governado disponível para acesso.';

    try {
      url = await this.documentStorageService.getSignedUrl(cat.pdf_file_key);
    } catch (error) {
      availability = 'registered_without_signed_url';
      degraded = true;
      message =
        'PDF final registrado, mas a URL segura não está disponível no momento. Tente novamente quando o storage estiver saudável.';
      this.logger.warn(
        `URL assinada indisponível para PDF final da CAT ${cat.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const payload = {
      catId: cat.id,
      hasFinalPdf: true,
      availability,
      message,
      degraded,
      fileKey: cat.pdf_file_key,
      folderPath: cat.pdf_folder_path || null,
      originalName: cat.pdf_original_name || null,
      fileHash: registryEntry?.file_hash || cat.pdf_file_hash || null,
      documentCode: registryEntry?.document_code || this.buildDocumentCode(cat),
      url,
    };

    await this.writeAuditLog(AuditAction.READ, cat, actorId, {
      event: 'cat_pdf_access_checked',
      companyId: cat.company_id,
      availability: payload.availability,
      hasFinalPdf: payload.hasFinalPdf,
      degraded: payload.degraded,
      fileKey: payload.fileKey,
    });

    return payload;
  }

  async getSummary() {
    const companyId = this.getTenantIdOrThrow();
    const [total, abertas, investigacao, fechadas] = await Promise.all([
      this.catsRepository.count({ where: { company_id: companyId } }),
      this.catsRepository.count({
        where: { company_id: companyId, status: 'aberta' },
      }),
      this.catsRepository.count({
        where: { company_id: companyId, status: 'investigacao' },
      }),
      this.catsRepository.count({
        where: { company_id: companyId, status: 'fechada' },
      }),
    ]);

    const bySeverityRaw = await this.catsRepository
      .createQueryBuilder('cat')
      .select('cat.gravidade', 'gravidade')
      .addSelect('COUNT(*)', 'total')
      .where('cat.company_id = :companyId', { companyId })
      .groupBy('cat.gravidade')
      .getRawMany<{ gravidade: string; total: string }>();

    const bySeverity = bySeverityRaw.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.gravidade] = Number(row.total);
        return acc;
      },
      {},
    );

    return {
      total,
      aberta: abertas,
      investigacao,
      fechada: fechadas,
      bySeverity,
    };
  }

  async getStatistics() {
    const companyId = this.getTenantIdOrThrow();

    const [
      total,
      fatalCount,
      openCount,
      byTipoRaw,
      byGravidadeRaw,
      byMonthRaw,
    ] = await Promise.all([
      this.catsRepository.count({ where: { company_id: companyId } }),
      this.catsRepository.count({
        where: { company_id: companyId, gravidade: 'fatal' },
      }),
      this.catsRepository.count({
        where: { company_id: companyId, status: 'aberta' },
      }),
      this.catsRepository
        .createQueryBuilder('cat')
        .select('cat.tipo', 'tipo')
        .addSelect('COUNT(*)', 'total')
        .where('cat.company_id = :companyId', { companyId })
        .groupBy('cat.tipo')
        .getRawMany<{ tipo: string; total: string }>(),
      this.catsRepository
        .createQueryBuilder('cat')
        .select('cat.gravidade', 'gravidade')
        .addSelect('COUNT(*)', 'total')
        .where('cat.company_id = :companyId', { companyId })
        .groupBy('cat.gravidade')
        .getRawMany<{ gravidade: string; total: string }>(),
      this.catsRepository
        .createQueryBuilder('cat')
        .select("DATE_TRUNC('month', cat.data_ocorrencia)", 'month')
        .addSelect('COUNT(*)', 'total')
        .where('cat.company_id = :companyId', { companyId })
        .andWhere("cat.data_ocorrencia >= NOW() - INTERVAL '12 months'")
        .groupBy("DATE_TRUNC('month', cat.data_ocorrencia)")
        .orderBy("DATE_TRUNC('month', cat.data_ocorrencia)", 'ASC')
        .getRawMany<{ month: string; total: string }>(),
    ]);

    const byTipo = byTipoRaw.reduce<Record<string, number>>((acc, r) => {
      acc[r.tipo] = Number(r.total);
      return acc;
    }, {});

    const byGravidade = byGravidadeRaw.reduce<Record<string, number>>(
      (acc, r) => {
        acc[r.gravidade] = Number(r.total);
        return acc;
      },
      {},
    );

    const byMonth = byMonthRaw.map((r) => ({
      month: r.month ? new Date(r.month).toISOString().slice(0, 7) : '',
      total: Number(r.total),
    }));

    return { total, fatalCount, openCount, byTipo, byGravidade, byMonth };
  }

  async validateByCode(code: string): Promise<{
    valid: boolean;
    code: string;
    message?: string;
    document?: {
      id: string;
      module: string;
      document_type: string;
      title: string;
      document_date: string | null;
      original_name: string | null;
      file_hash: string | null;
      updated_at: string;
    };
    final_document?: {
      has_final_pdf: boolean;
      document_code: string | null;
      original_name: string | null;
      file_hash: string | null;
      emitted_at: string | null;
    };
  }> {
    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase();
    const match = normalizedCode.match(/^CAT-(\d{4})-([A-Z0-9]{8})$/);

    if (!match) {
      return {
        valid: false,
        code: normalizedCode,
        message: 'Código de CAT inválido.',
      };
    }

    const prefix = match[2].toLowerCase();
    const candidate = await this.catsRepository
      .createQueryBuilder('cat')
      .leftJoinAndSelect('cat.worker', 'worker')
      .leftJoinAndSelect('cat.site', 'site')
      .where('LOWER(cat.id) LIKE :prefix', { prefix: `${prefix}%` })
      .getOne();

    if (!candidate || this.buildDocumentCode(candidate) !== normalizedCode) {
      return {
        valid: false,
        code: normalizedCode,
        message: 'CAT não encontrada para este código.',
      };
    }

    const registryEntry = await this.documentRegistryService.findByDocument(
      'cat',
      candidate.id,
      'pdf',
      candidate.company_id,
    );

    return {
      valid: true,
      code: normalizedCode,
      document: {
        id: candidate.id,
        module: registryEntry?.module || 'cat',
        document_type: registryEntry?.document_type || 'cat',
        title: `CAT ${candidate.numero}`,
        document_date: registryEntry?.document_date
          ? registryEntry.document_date.toISOString()
          : candidate.data_ocorrencia
            ? candidate.data_ocorrencia.toISOString()
            : null,
        original_name:
          registryEntry?.original_name || candidate.pdf_original_name || null,
        file_hash: registryEntry?.file_hash || candidate.pdf_file_hash || null,
        updated_at: registryEntry?.updated_at
          ? registryEntry.updated_at.toISOString()
          : candidate.updated_at.toISOString(),
      },
      final_document: {
        has_final_pdf: Boolean(candidate.pdf_file_key),
        document_code:
          registryEntry?.document_code || this.buildDocumentCode(candidate),
        original_name:
          registryEntry?.original_name || candidate.pdf_original_name || null,
        file_hash: registryEntry?.file_hash || candidate.pdf_file_hash || null,
        emitted_at: candidate.pdf_generated_at
          ? candidate.pdf_generated_at.toISOString()
          : null,
      },
    };
  }

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto de empresa não definido.');
    }
    return tenantId;
  }

  private async generateCatNumber(companyId: string): Promise<string> {
    const now = new Date();
    const datePart = `${now.getUTCFullYear()}${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const prefix = `CAT-${datePart}-`;
    const totalToday = await this.catsRepository
      .createQueryBuilder('cat')
      .where('cat.company_id = :companyId', { companyId })
      .andWhere('cat.numero LIKE :prefix', { prefix: `${prefix}%` })
      .getCount();
    return `${prefix}${String(totalToday + 1).padStart(4, '0')}`;
  }

  private sanitizeFilename(name: string): string {
    const base = path.basename(name);
    return base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 140);
  }

  buildDocumentCode(cat: Pick<Cat, 'id' | 'data_ocorrencia'>): string {
    const date = new Date(cat.data_ocorrencia);
    const year = Number.isNaN(date.getTime())
      ? new Date().getFullYear()
      : date.getFullYear();
    return `CAT-${year}-${cat.id.slice(0, 8).toUpperCase()}`;
  }

  private normalizeCatNumber(numero: string): string {
    return String(numero || '')
      .trim()
      .toUpperCase();
  }

  private assertReadyForFinalPdf(cat: Cat): void {
    if (cat.pdf_file_key) {
      throw new BadRequestException(
        'A CAT já possui PDF final governado emitido.',
      );
    }
    if (cat.status !== 'fechada') {
      throw new BadRequestException(
        'A CAT precisa estar fechada antes da emissão do PDF final governado.',
      );
    }
  }

  private assertCatVideoMutable(
    cat: Pick<Cat, 'status' | 'pdf_file_key'>,
  ): void {
    if (cat.pdf_file_key) {
      throw new BadRequestException(
        'CAT com PDF final emitido não aceita novos vídeos.',
      );
    }

    if (cat.status === 'fechada') {
      throw new BadRequestException(
        'CAT fechada não aceita novos vídeos por fluxo comum.',
      );
    }
  }

  private async validateScopedRelations(
    companyId: string,
    payload: {
      site_id?: string;
      worker_id?: string;
    },
  ): Promise<void> {
    if (payload.site_id) {
      const siteExists = await this.sitesRepository.exist({
        where: {
          id: payload.site_id,
          company_id: companyId,
        },
      });

      if (!siteExists) {
        throw new BadRequestException(
          'Obra/setor informado não pertence à empresa atual.',
        );
      }
    }

    if (payload.worker_id) {
      const workerExists = await this.usersRepository.exist({
        where: {
          id: payload.worker_id,
          company_id: companyId,
        },
      });

      if (!workerExists) {
        throw new BadRequestException(
          'Colaborador informado não pertence à empresa atual.',
        );
      }
    }
  }

  private async ensureUniqueNumber(
    companyId: string,
    numero: string,
    excludeId?: string,
  ): Promise<void> {
    const normalizedNumero = this.normalizeCatNumber(numero);
    const query = this.catsRepository
      .createQueryBuilder('cat')
      .where('cat.company_id = :companyId', { companyId })
      .andWhere('UPPER(cat.numero) = :numero', { numero: normalizedNumero });

    if (excludeId) {
      query.andWhere('cat.id != :excludeId', { excludeId });
    }

    const alreadyExists = (await query.getCount()) > 0;
    if (alreadyExists) {
      throw new BadRequestException('Já existe uma CAT com este número.');
    }
  }

  private async writeAuditLog(
    action: AuditAction,
    cat: Cat,
    userId?: string,
    metadata?: Record<string, unknown>,
  ) {
    const actorId = userId || RequestContext.getUserId() || 'system';
    const requestId = RequestContext.getRequestId();
    await this.auditService.log({
      userId: actorId,
      action,
      entity: 'CAT',
      entityId: cat.id,
      changes: {
        ...(metadata || {}),
        ...(requestId ? { requestId } : {}),
      },
      ip: (RequestContext.get('ip') as string) || 'unknown',
      userAgent: (RequestContext.get('userAgent') as string) || 'unknown',
      companyId: cat.company_id,
    });
  }
}
