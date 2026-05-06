import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Audit } from './entities/audit.entity';
import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto } from './dto/create-audit.dto';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import {
  TenantRepository,
  TenantRepositoryFactory,
} from '../common/tenant/tenant-repository';
import {
  DocumentBundleService,
  WeeklyBundleFilters,
} from '../common/services/document-bundle.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';
import { FORENSIC_EVENT_TYPES } from '../forensic-trail/forensic-trail.constants';
import { TenantService } from '../common/tenant/tenant.service';
import { escapeLikePattern } from '../common/utils/sql.util';
import {
  GovernedPdfAccessAvailability,
  GovernedPdfAccessResponseDto,
} from '../common/dto/governed-pdf-access-response.dto';

type AuditPdfAccessAvailability = GovernedPdfAccessAvailability;
type AuditPdfAccessResponse = GovernedPdfAccessResponseDto;

@Injectable()
export class AuditsService {
  private readonly logger = new Logger(AuditsService.name);
  private readonly tenantRepo: TenantRepository<Audit>;

  constructor(
    @InjectRepository(Audit)
    private auditsRepository: Repository<Audit>,
    tenantRepositoryFactory: TenantRepositoryFactory,
    private readonly documentStorageService: DocumentStorageService,
    private readonly documentBundleService: DocumentBundleService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    @Optional() private readonly tenantService?: TenantService,
  ) {
    this.tenantRepo = tenantRepositoryFactory.wrap(this.auditsRepository);
  }

  async create(createAuditDto: CreateAuditDto, companyId: string) {
    const audit = this.auditsRepository.create({
      ...createAuditDto,
      company_id: companyId,
    });
    const saved = await this.auditsRepository.save(audit);
    this.logger.log({
      event: 'audit_created',
      auditId: saved.id,
      companyId,
    });
    return saved;
  }

  async findAll(companyId: string) {
    return await this.auditsRepository.find({
      where: { company_id: companyId, deleted_at: IsNull() },
      relations: ['site', 'auditor'],
      order: { created_at: 'DESC' },
      take: 100,
    });
  }

  async findPaginated(
    opts: { page?: number; limit?: number; search?: string },
    companyId: string,
  ): Promise<OffsetPage<Audit>> {
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.auditsRepository
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.site', 'site')
      .leftJoinAndSelect('a.auditor', 'auditor')
      .where('a.company_id = :companyId', { companyId })
      .andWhere('a.deleted_at IS NULL')
      .orderBy('a.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (opts?.search?.trim()) {
      const search = `%${escapeLikePattern(opts.search.trim())}%`;
      qb.andWhere(
        "(a.titulo ILIKE :search ESCAPE '\\' OR a.tipo_auditoria ILIKE :search ESCAPE '\\')",
        { search },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async countPendingActionItems(companyId?: string): Promise<number> {
    const params = companyId ? [companyId] : [];
    const where = companyId ? 'WHERE a.company_id = $1' : '';

    const rows: Array<{ total?: number | string }> =
      await this.auditsRepository.query(
        `
        SELECT COALESCE(
          SUM(
            (
              SELECT COUNT(*)
              FROM jsonb_array_elements(COALESCE(a.plano_acao::jsonb, '[]'::jsonb)) AS item
              WHERE LOWER(COALESCE(item->>'status', '')) NOT LIKE '%conclu%'
                AND LOWER(COALESCE(item->>'status', '')) NOT LIKE '%encerr%'
            )
          ),
          0
        )::int AS total
        FROM audits a
        ${where ? `${where} AND a.deleted_at IS NULL` : 'WHERE a.deleted_at IS NULL'}
      `,
        params,
      );

    return Number(rows[0]?.total ?? 0);
  }

  async findOne(id: string, companyId: string) {
    const audit = await this.tenantRepo.findOne(id, companyId, {
      relations: ['site', 'auditor', 'company'],
    });

    if (!audit) {
      throw new NotFoundException(`Auditoria com ID ${id} não encontrada`);
    }

    return audit;
  }

  async update(id: string, updateAuditDto: UpdateAuditDto, companyId: string) {
    const audit = await this.findOne(id, companyId);
    if (audit.pdf_file_key) {
      throw new BadRequestException(
        'Auditoria com PDF final anexado. Edição bloqueada. Gere uma nova auditoria para alterar o documento.',
      );
    }
    Object.assign(audit, updateAuditDto);
    const saved = await this.auditsRepository.save(audit);
    this.logger.log({
      event: 'audit_updated',
      auditId: saved.id,
      companyId,
    });
    return saved;
  }

  async remove(id: string, companyId: string) {
    const audit = await this.findOne(id, companyId);
    const auditId = audit.id;
    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: audit.company_id,
      module: 'audit',
      entityId: auditId,
      trailEventType: FORENSIC_EVENT_TYPES.FINAL_DOCUMENT_REMOVED,
      trailMetadata: {
        removalMode: 'soft_delete',
      },
      removeEntityState: async (manager) => {
        await manager.getRepository(Audit).softDelete(auditId);
      },
      cleanupStoredFile: (fileKey) =>
        this.documentStorageService.deleteFile(fileKey),
    });
    this.logger.log({
      event: 'audit_removed',
      auditId,
      companyId,
    });
  }

  async attachPdf(
    id: string,
    companyId: string,
    file: Express.Multer.File,
    userId?: string,
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const audit = await this.findOne(id, companyId);
    if (audit.pdf_file_key) {
      throw new BadRequestException(
        'Esta auditoria já possui PDF final anexado. Gere uma nova auditoria para substituir o documento.',
      );
    }
    if (!audit.site_id) {
      throw new BadRequestException(
        'Auditoria sem obra/setor vinculado não pode receber PDF final.',
      );
    }

    const key = this.documentStorageService.generateDocumentKey(
      audit.company_id,
      'audits',
      audit.id,
      file.originalname,
      { folderSegments: ['sites', audit.site_id] },
    );
    await this.documentStorageService.uploadFile(
      key,
      file.buffer,
      file.mimetype,
    );
    const uploadedToStorage = true;

    const folder = key.split('/').slice(0, -1).join('/');
    try {
      await this.documentGovernanceService.registerFinalDocument({
        companyId: audit.company_id,
        module: 'audit',
        entityId: audit.id,
        title: audit.titulo || 'Auditoria',
        documentDate: audit.data_auditoria || audit.created_at,
        fileKey: key,
        folderPath: folder,
        originalName: file.originalname,
        mimeType: file.mimetype,
        createdBy: userId || undefined,
        fileBuffer: file.buffer,
        persistEntityMetadata: async (manager, computedHash) => {
          await manager.getRepository(Audit).update(id, {
            pdf_file_key: key,
            pdf_folder_path: folder,
            pdf_original_name: file.originalname,
            pdf_file_hash: computedHash,
            pdf_generated_at: new Date(),
          });
        },
      });
    } catch (error) {
      if (uploadedToStorage) {
        await cleanupUploadedFile(
          this.logger,
          `audit:${audit.id}`,
          key,
          (fileKey) => this.documentStorageService.deleteFile(fileKey),
        );
      }
      throw error;
    }

    this.logger.log({
      event: 'audit_pdf_attached',
      auditId: audit.id,
      companyId: audit.company_id,
      userId,
      fileKey: key,
    });

    return {
      fileKey: key,
      folderPath: folder,
      originalName: file.originalname,
    };
  }

  async getPdfAccess(
    id: string,
    companyId: string,
  ): Promise<AuditPdfAccessResponse> {
    const audit = await this.findOne(id, companyId);
    if (!audit.pdf_file_key) {
      return {
        entityId: audit.id,
        hasFinalPdf: false,
        availability: 'not_emitted',
        message: 'PDF final ainda não emitido para esta auditoria.',
        fileKey: null,
        folderPath: audit.pdf_folder_path ?? null,
        originalName: audit.pdf_original_name ?? null,
        url: null,
      };
    }

    let url: string | null = null;
    let availability: AuditPdfAccessAvailability = 'ready';
    let message: string | null = null;
    try {
      url = await this.documentStorageService.getSignedUrl(
        audit.pdf_file_key,
        3600,
      );
    } catch {
      url = null;
      availability = 'registered_without_signed_url';
      message =
        'PDF final emitido, mas a URL segura não está disponível no momento.';
    }

    return {
      entityId: audit.id,
      hasFinalPdf: true,
      availability,
      message,
      fileKey: audit.pdf_file_key,
      folderPath: audit.pdf_folder_path ?? null,
      originalName: audit.pdf_original_name ?? null,
      url,
    };
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    const files = await this.documentGovernanceService.listFinalDocuments(
      'audit',
      filters,
    );
    const context = this.tenantService?.getContext();
    if (
      !context?.companyId ||
      context.isSuperAdmin ||
      context.siteScope === 'all' ||
      !context.siteId ||
      files.length === 0
    ) {
      return files;
    }

    const visibleAudits = await this.auditsRepository.find({
      select: { id: true },
      where: {
        id: In(files.map((file) => file.entityId)),
        company_id: context.companyId,
        site_id: context.siteId,
        deleted_at: IsNull(),
      },
    });
    const visibleIds = new Set(visibleAudits.map((audit) => audit.id));

    return files.filter((file) => visibleIds.has(file.entityId));
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    const files = await this.listStoredFiles(filters);
    return this.documentBundleService.buildWeeklyPdfBundle(
      'Auditoria',
      filters,
      files.map((file) => ({
        fileKey: file.fileKey,
        title: file.title,
        originalName: file.originalName,
        date: file.date,
      })),
    );
  }
}
