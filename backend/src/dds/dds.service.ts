import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Dds, DdsStatus, DDS_ALLOWED_TRANSITIONS } from './entities/dds.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { CreateDdsDto } from './dto/create-dds.dto';
import { UpdateDdsDto } from './dto/update-dds.dto';
import { UpdateDdsAuditDto } from './dto/update-dds-audit.dto';
import { ReplaceDdsSignaturesDto } from './dto/replace-dds-signatures.dto';
import { User } from '../users/entities/user.entity';
import { Site } from '../sites/entities/site.entity';
import { WeeklyBundleFilters } from '../common/services/document-bundle.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import {
  CursorPaginatedResponse,
  decodeCursorToken,
  toCursorPaginatedResponse,
} from '../common/utils/cursor-pagination.util';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { DocumentVideosService } from '../document-videos/document-videos.service';
import { SignaturesService } from '../signatures/signatures.service';
import { Signature } from '../signatures/entities/signature.entity';
import { FORENSIC_EVENT_TYPES } from '../forensic-trail/forensic-trail.constants';
import { MetricsService } from '../common/observability/metrics.service';
import { Counter } from '@opentelemetry/api';

export const DDS_DOMAIN_METRICS = 'DDS_DOMAIN_METRICS';

const TEAM_PHOTO_SIGNATURE_PREFIX = 'team_photo';
const TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE = 'team_photo_reuse_justification';

/** Limite padrão de DDSs históricos consultados para detecção de foto reutilizada */
const HISTORICAL_PHOTO_HASH_LIMIT = parseTenantConfigInt(
  process.env.DDS_HISTORICAL_PHOTO_HASH_LIMIT,
  100,
);

/** Expiração (segundos) da URL assinada do PDF final */
const DDS_PDF_SIGNED_URL_EXPIRY_SECONDS = parseTenantConfigInt(
  process.env.DDS_PDF_SIGNED_URL_EXPIRY_SECONDS,
  3600,
);

function parseTenantConfigInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type HistoricalPhotoHashes = {
  ddsId: string;
  tema: string;
  data: string;
  hashes: string[];
};

type DdsPdfAvailability =
  | 'ready'
  | 'registered_without_signed_url'
  | 'not_emitted';

type TeamPhotoEvidence = {
  imageData: string;
  capturedAt: string;
  hash: string;
  metadata: {
    userAgent: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  };
};

@Injectable()
export class DdsService {
  private readonly logger = new Logger(DdsService.name);

  constructor(
    @InjectRepository(Dds)
    private ddsRepository: Repository<Dds>,
    private tenantService: TenantService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly documentVideosService: DocumentVideosService,
    private readonly signaturesService: SignaturesService,
    @Optional() private readonly metricsService?: MetricsService,
    @Optional()
    @Inject(DDS_DOMAIN_METRICS)
    private readonly domainMetrics?: Record<string, Counter>,
  ) {}

  private buildTenantScopedIdsWhere(ids: string[], tenantId?: string) {
    return ids.map((id) => ({
      id,
      deleted_at: IsNull(),
      ...(tenantId ? { company_id: tenantId } : {}),
    }));
  }

  async create(createDdsDto: CreateDdsDto): Promise<Dds> {
    const { participants, company_id, ...rest } = createDdsDto;
    const tenantId = this.tenantService.getTenantId();
    const resolvedCompanyId = tenantId || company_id;
    if (!resolvedCompanyId) {
      throw new BadRequestException('Empresa não definida para o DDS');
    }
    const participantIds = this.normalizeUniqueIds(participants);
    await this.assertRelationsBelongToCompany({
      companyId: resolvedCompanyId,
      siteId: rest.site_id,
      facilitatorId: rest.facilitador_id,
      participantIds,
      auditorId: rest.auditado_por_id,
    });

    const dds = this.ddsRepository.create({
      ...rest,
      company_id: resolvedCompanyId,
      participants: participantIds.map((id) => ({ id }) as unknown as User),
    });

    const saved = await this.ddsRepository.save(dds);
    this.logger.log({
      event: 'dds_created',
      ddsId: saved.id,
      companyId: saved.company_id,
    });
    try {
      this.domainMetrics?.dds_created?.add(1, {
        company_id: saved.company_id,
      });
    } catch (error) {
      this.logger.warn(
        `[DDS] Falha ao registrar dds_created no domínio: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.metricsService?.incrementDdsCreated(saved.company_id);
    }
    return saved;
  }

  async findAll(opts?: {
    page?: number;
    limit?: number;
  }): Promise<OffsetPage<Dds>> {
    const tenantId = this.tenantService.getTenantId();
    // maxLimit: 1000 — limite de segurança para evitar OOM em tenants grandes
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 1000,
    });

    const idsQuery = this.ddsRepository
      .createQueryBuilder('dds')
      .select('dds.id', 'id')
      .where('dds.deleted_at IS NULL')
      .orderBy('dds.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const countQuery = this.ddsRepository
      .createQueryBuilder('dds')
      .where('dds.deleted_at IS NULL');

    if (tenantId) {
      idsQuery.andWhere('dds.company_id = :tenantId', { tenantId });
      countQuery.andWhere('dds.company_id = :tenantId', { tenantId });
    }

    const [rows, total] = await Promise.all([
      idsQuery.getRawMany<{ id: string }>(),
      countQuery.getCount(),
    ]);

    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      return toOffsetPage([], total, page, limit);
    }

    const data = await this.ddsRepository.find({
      where: this.buildTenantScopedIdsWhere(ids, tenantId),
      relations: ['site', 'facilitador', 'participants'],
    });

    const ordered = ids
      .map((id) => data.find((item) => item.id === id))
      .filter((item): item is Dds => Boolean(item));

    return toOffsetPage(ordered, total, page, limit);
  }

  // Carrega todos os registros para uso interno (exportações, relatórios).
  // Sem relações pesadas; take: 5000 como teto de segurança.
  async findAllForExport(): Promise<Dds[]> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.ddsRepository
      .createQueryBuilder('dds')
      .select([
        'dds.id',
        'dds.tema',
        'dds.data',
        'dds.status',
        'dds.is_modelo',
        'dds.company_id',
        'dds.site_id',
        'dds.created_at',
      ])
      .where('dds.deleted_at IS NULL')
      .orderBy('dds.created_at', 'DESC')
      .take(5000);

    if (tenantId) {
      qb.andWhere('dds.company_id = :tenantId', { tenantId });
    }

    return qb.getMany();
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    kind?: 'all' | 'model' | 'regular';
  }): Promise<OffsetPage<Dds>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const idsQuery = this.ddsRepository
      .createQueryBuilder('dds')
      .select('dds.id', 'id')
      .orderBy('dds.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const countQuery = this.ddsRepository
      .createQueryBuilder('dds')
      .orderBy('dds.created_at', 'DESC');

    idsQuery.where('dds.deleted_at IS NULL');
    countQuery.where('dds.deleted_at IS NULL');

    if (tenantId) {
      idsQuery.andWhere('dds.company_id = :tenantId', { tenantId });
      countQuery.andWhere('dds.company_id = :tenantId', { tenantId });
    }

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      idsQuery
        .leftJoin('dds.site', 'search_site')
        .leftJoin('dds.facilitador', 'search_facilitador')
        .andWhere(
          '(LOWER(dds.tema) LIKE :search OR LOWER(search_site.nome) LIKE :search OR LOWER(search_facilitador.nome) LIKE :search)',
          { search },
        );
      countQuery
        .leftJoin('dds.site', 'search_site')
        .leftJoin('dds.facilitador', 'search_facilitador')
        .andWhere(
          '(LOWER(dds.tema) LIKE :search OR LOWER(search_site.nome) LIKE :search OR LOWER(search_facilitador.nome) LIKE :search)',
          { search },
        );
    }

    if (opts?.kind === 'model') {
      idsQuery.andWhere('dds.is_modelo = true');
      countQuery.andWhere('dds.is_modelo = true');
    } else if (opts?.kind === 'regular') {
      idsQuery.andWhere('dds.is_modelo = false');
      countQuery.andWhere('dds.is_modelo = false');
    }

    const [rows, total] = await Promise.all([
      idsQuery.getRawMany<{ id: string }>(),
      countQuery.getCount(),
    ]);

    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      return toOffsetPage([], total, page, limit);
    }

    const data = await this.ddsRepository.find({
      where: this.buildTenantScopedIdsWhere(ids, tenantId),
      relations: ['site', 'facilitador', 'participants', 'company'],
    });

    const ordered = ids
      .map((id) => data.find((item) => item.id === id))
      .filter((item): item is Dds => Boolean(item));

    return toOffsetPage(ordered, total, page, limit);
  }

  async findByCursor(opts?: {
    cursor?: string;
    limit?: number;
    search?: string;
    kind?: 'all' | 'model' | 'regular';
  }): Promise<CursorPaginatedResponse<Dds>> {
    const tenantId = this.tenantService.getTenantId();
    const { limit } = normalizeOffsetPagination(
      { page: 1, limit: opts?.limit },
      {
        defaultLimit: 20,
        maxLimit: 100,
      },
    );

    const decodedCursor = decodeCursorToken(opts?.cursor);
    if (opts?.cursor && !decodedCursor) {
      throw new BadRequestException('Cursor inválido para listagem de DDS.');
    }

    const idsQuery = this.ddsRepository
      .createQueryBuilder('dds')
      .select('dds.id', 'id')
      .addSelect('dds.created_at', 'created_at')
      .where('dds.deleted_at IS NULL')
      .orderBy('dds.created_at', 'DESC')
      .addOrderBy('dds.id', 'DESC')
      .take(limit + 1);

    if (tenantId) {
      idsQuery.andWhere('dds.company_id = :tenantId', { tenantId });
    }

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      idsQuery
        .leftJoin('dds.site', 'search_site')
        .leftJoin('dds.facilitador', 'search_facilitador')
        .andWhere(
          '(LOWER(dds.tema) LIKE :search OR LOWER(search_site.nome) LIKE :search OR LOWER(search_facilitador.nome) LIKE :search)',
          { search },
        );
    }

    if (opts?.kind === 'model') {
      idsQuery.andWhere('dds.is_modelo = true');
    } else if (opts?.kind === 'regular') {
      idsQuery.andWhere('dds.is_modelo = false');
    }

    if (decodedCursor) {
      idsQuery.andWhere(
        '(dds.created_at < :cursorCreatedAt OR (dds.created_at = :cursorCreatedAt AND dds.id < :cursorId))',
        {
          cursorCreatedAt: decodedCursor.created_at,
          cursorId: decodedCursor.id,
        },
      );
    }

    const rows = await idsQuery.getRawMany<{ id: string; created_at: Date }>();
    const cursorPage = toCursorPaginatedResponse({
      rows,
      limit,
      getCreatedAt: (row) => row.created_at,
    });

    const ids = cursorPage.data.map((row) => row.id);
    if (ids.length === 0) {
      return {
        data: [],
        cursor: null,
        hasMore: false,
      };
    }

    const data = await this.ddsRepository.find({
      where: this.buildTenantScopedIdsWhere(ids, tenantId),
      relations: ['site', 'facilitador', 'participants', 'company'],
    });

    const ordered = ids
      .map((id) => data.find((item) => item.id === id))
      .filter((item): item is Dds => Boolean(item));

    return {
      data: ordered,
      cursor: cursorPage.cursor,
      hasMore: cursorPage.hasMore,
    };
  }

  async findOne(id: string): Promise<Dds> {
    const tenantId = this.tenantService.getTenantId();
    const dds = await this.ddsRepository.findOne({
      where: tenantId
        ? { id, company_id: tenantId, deleted_at: IsNull() }
        : { id, deleted_at: IsNull() },
      relations: ['site', 'facilitador', 'participants'],
    });
    if (!dds) {
      throw new NotFoundException(`DDS com ID ${id} não encontrado`);
    }
    return dds;
  }

  async updateStatus(id: string, status: DdsStatus): Promise<Dds> {
    const dds = await this.findOne(id);
    this.assertFinalDocumentMutable(dds);
    if (
      dds.is_modelo &&
      (status === DdsStatus.PUBLICADO || status === DdsStatus.AUDITADO)
    ) {
      throw new BadRequestException(
        'Modelos de DDS não podem ser publicados ou auditados. Gere um DDS operacional a partir do modelo.',
      );
    }
    const allowed = DDS_ALLOWED_TRANSITIONS[dds.status];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Transição inválida: ${dds.status} → ${status}. Permitidas: ${allowed.join(', ') || 'nenhuma'}`,
      );
    }

    if (status === DdsStatus.AUDITADO) {
      const missing: string[] = [];
      if (!dds.auditado_por_id) missing.push('auditado_por_id');
      if (!dds.data_auditoria) missing.push('data_auditoria');
      if (!dds.resultado_auditoria) missing.push('resultado_auditoria');
      if (missing.length > 0) {
        throw new BadRequestException(
          `Para marcar como auditado, preencha os campos obrigatórios: ${missing.join(', ')}.`,
        );
      }
    }
    const previousStatus = dds.status;
    dds.status = status;
    const saved = await this.ddsRepository.save(dds);
    this.logger.log({
      event: 'dds_status_updated',
      ddsId: saved.id,
      companyId: saved.company_id,
      previousStatus,
      nextStatus: saved.status,
    });
    return saved;
  }

  async attachPdf(
    id: string,
    file: Express.Multer.File,
  ): Promise<{
    fileKey: string;
    folderPath: string;
    originalName: string;
    storageMode: 's3';
    degraded: boolean;
    message: string;
  }> {
    const dds = await this.findOne(id);
    this.assertFinalDocumentMutable(dds);
    await this.assertReadyForFinalDocument(dds);
    const companyId = dds.company_id;
    const key = this.documentStorageService.generateDocumentKey(
      companyId,
      'dds',
      id,
      file.originalname,
    );
    const storageMode = 's3' as const;
    await this.documentStorageService.uploadFile(
      key,
      file.buffer,
      file.mimetype,
    );
    const uploadedToStorage = true;

    const folder = `dds/${companyId}`;
    try {
      await this.documentGovernanceService.registerFinalDocument({
        companyId: dds.company_id,
        module: 'dds',
        entityId: dds.id,
        title: dds.tema || 'DDS',
        documentDate: dds.data || dds.created_at,
        documentCode: this.buildDdsDocumentCode(dds),
        fileKey: key,
        folderPath: folder,
        originalName: file.originalname,
        mimeType: file.mimetype,
        createdBy: undefined,
        fileBuffer: file.buffer,
        persistEntityMetadata: async (manager) => {
          await manager.getRepository(Dds).update(id, {
            pdf_file_key: key,
            pdf_folder_path: folder,
            pdf_original_name: file.originalname,
          });
        },
      });
    } catch (error) {
      if (uploadedToStorage) {
        await cleanupUploadedFile(
          this.logger,
          `dds:${dds.id}`,
          key,
          (fileKey) => this.documentStorageService.deleteFile(fileKey),
        );
      }
      throw error;
    }

    this.logger.log({
      event: 'dds_pdf_attached',
      ddsId: dds.id,
      companyId: dds.company_id,
      storageMode,
      fileKey: key,
    });
    return {
      fileKey: key,
      folderPath: folder,
      originalName: file.originalname,
      storageMode,
      degraded: false,
      message: 'PDF final do DDS emitido e registrado com sucesso.',
    };
  }

  async getPdfAccess(id: string): Promise<{
    ddsId: string;
    hasFinalPdf: boolean;
    availability: DdsPdfAvailability;
    message: string;
    degraded: boolean;
    fileKey: string | null;
    folderPath: string | null;
    originalName: string | null;
    url: string | null;
  }> {
    const dds = await this.findOne(id);
    if (!dds.pdf_file_key) {
      const payload = {
        ddsId: dds.id,
        hasFinalPdf: false,
        availability: 'not_emitted' as const,
        message:
          'O DDS ainda não possui PDF final emitido. Gere o documento final para habilitar download governado.',
        degraded: false,
        fileKey: null,
        folderPath: null,
        originalName: null,
        url: null,
      };
      this.logger.log({
        event: 'dds_pdf_access_resolved',
        ddsId: dds.id,
        companyId: dds.company_id,
        availability: payload.availability,
        degraded: payload.degraded,
      });
      return payload;
    }

    let url: string | null = null;
    let availability: DdsPdfAvailability = 'ready';
    let degraded = false;
    let message = 'PDF final governado disponível para acesso.';
    try {
      url = await this.documentStorageService.getSignedUrl(
        dds.pdf_file_key,
        DDS_PDF_SIGNED_URL_EXPIRY_SECONDS,
      );
    } catch {
      // S3 desabilitado ou indisponível — retorna sem URL segura
      url = null;
      availability = 'registered_without_signed_url';
      degraded = true;
      message =
        'PDF final registrado, mas a URL segura não está disponível no momento. O storage está em modo degradado.';
    }

    const payload = {
      ddsId: dds.id,
      hasFinalPdf: true,
      availability,
      message,
      degraded,
      fileKey: dds.pdf_file_key,
      folderPath: dds.pdf_folder_path,
      originalName: dds.pdf_original_name,
      url,
    };
    this.logger.log({
      event: 'dds_pdf_access_resolved',
      ddsId: dds.id,
      companyId: dds.company_id,
      availability: payload.availability,
      degraded: payload.degraded,
    });
    return payload;
  }

  async getHistoricalPhotoHashes(
    limit = HISTORICAL_PHOTO_HASH_LIMIT,
    excludeDocumentId?: string,
    companyId?: string,
  ): Promise<HistoricalPhotoHashes[]> {
    const tenantId = this.tenantService.getTenantId();
    const companyScopeId = tenantId || companyId;

    const recent = await this.ddsRepository
      .createQueryBuilder('dds')
      .select(['dds.id AS id', 'dds.tema AS tema', 'dds.data AS data'])
      .where(companyScopeId ? 'dds.company_id = :companyScopeId' : '1=1', {
        companyScopeId,
      })
      .andWhere('dds.deleted_at IS NULL')
      .andWhere(excludeDocumentId ? 'dds.id != :excludeDocumentId' : '1=1', {
        excludeDocumentId,
      })
      .orderBy('dds.created_at', 'DESC')
      .limit(limit)
      .getRawMany<{ id: string; tema: string; data: string }>();

    const documentIds = recent.map((item) => item.id);
    const signatures = await this.signaturesService.findManyByDocuments(
      documentIds,
      'DDS',
      {
        companyId: companyScopeId || undefined,
        typePrefix: TEAM_PHOTO_SIGNATURE_PREFIX,
      },
    );
    const hashesByDocument = signatures.reduce<Record<string, string[]>>(
      (accumulator, signature) => {
        const hash = this.parseTeamPhotoHash(signature);
        if (!hash) {
          return accumulator;
        }
        const current = accumulator[signature.document_id] || [];
        current.push(hash);
        accumulator[signature.document_id] = current;
        return accumulator;
      },
      {},
    );

    return recent.map((item) => ({
      ddsId: item.id,
      tema: item.tema,
      data: item.data,
      hashes: hashesByDocument[item.id] || [],
    }));
  }

  async replaceSignatures(
    id: string,
    dto: ReplaceDdsSignaturesDto,
    authenticatedUserId: string,
  ): Promise<{
    participantSignatures: number;
    teamPhotos: number;
    duplicatePhotoWarnings: string[];
  }> {
    const dds = await this.findOne(id);
    this.assertFinalDocumentMutable(dds);
    if (dds.is_modelo) {
      throw new BadRequestException(
        'Modelos de DDS não podem receber assinaturas de execução.',
      );
    }

    const participantIds = this.getParticipantIds(dds);
    if (participantIds.length === 0) {
      throw new BadRequestException(
        'O DDS precisa ter participantes definidos antes das assinaturas.',
      );
    }

    const providedParticipantSignatures = dto.participant_signatures || [];
    const uniqueParticipantSignatures = new Map(
      providedParticipantSignatures.map((signature) => [
        signature.user_id,
        signature,
      ]),
    );

    if (uniqueParticipantSignatures.size !== participantIds.length) {
      throw new BadRequestException(
        'Todos os participantes do DDS precisam possuir assinatura registrada.',
      );
    }

    const invalidParticipant = Array.from(
      uniqueParticipantSignatures.keys(),
    ).find((userId) => !participantIds.includes(userId));
    if (invalidParticipant) {
      throw new BadRequestException(
        'Assinatura recebida para um participante que nao pertence a este DDS.',
      );
    }

    const missingParticipants = participantIds.filter(
      (participantId) => !uniqueParticipantSignatures.has(participantId),
    );
    if (missingParticipants.length > 0) {
      throw new BadRequestException(
        'Todos os participantes do DDS precisam possuir assinatura registrada.',
      );
    }

    const teamPhotos = dto.team_photos || [];
    const duplicateWarnings = await this.findDuplicateTeamPhotoHashes(
      dds,
      teamPhotos,
    );
    if (
      duplicateWarnings.length > 0 &&
      String(dto.photo_reuse_justification || '').trim().length < 20
    ) {
      throw new BadRequestException(
        'Detectamos reuso potencial de foto. Informe uma justificativa com pelo menos 20 caracteres.',
      );
    }

    const signaturesToPersist = [
      ...Array.from(uniqueParticipantSignatures.values()).map((signature) => ({
        user_id: signature.user_id,
        signer_user_id: signature.user_id,
        signature_data:
          signature.type === 'hmac' ? 'HMAC_PENDING' : signature.signature_data,
        type: signature.type,
        pin: signature.type === 'hmac' ? signature.pin : undefined,
        company_id: dds.company_id,
        document_id: id,
        document_type: 'DDS',
      })),
      ...teamPhotos.map((photo, index) => ({
        user_id: dds.facilitador_id,
        signer_user_id: dds.facilitador_id,
        signature_data: JSON.stringify(photo),
        type: `${TEAM_PHOTO_SIGNATURE_PREFIX}_${index + 1}`,
        company_id: dds.company_id,
        document_id: id,
        document_type: 'DDS',
      })),
    ];

    const justification =
      duplicateWarnings.length > 0
        ? String(dto.photo_reuse_justification || '').trim()
        : null;

    await this.ddsRepository.manager.transaction(async (manager) => {
      // Pessimistic write lock: garante que uploads concorrentes de assinaturas
      // não sobrescrevam uns aos outros de forma silenciosa.
      await manager
        .getRepository(Dds)
        .createQueryBuilder('dds')
        .setLock('pessimistic_write')
        .whereInIds([id])
        .getOne();

      await this.signaturesService.replaceDocumentSignatures({
        document_id: id,
        document_type: 'DDS',
        company_id: dds.company_id,
        authenticated_user_id: authenticatedUserId,
        signatures: signaturesToPersist,
      });
      await manager.getRepository(Dds).update(id, {
        photo_reuse_justification: justification,
      });
    });
    this.logger.log({
      event: 'dds_signatures_replaced',
      ddsId: dds.id,
      companyId: dds.company_id,
      participantSignatures: participantIds.length,
      teamPhotos: teamPhotos.length,
      duplicateWarnings: duplicateWarnings.length,
    });

    return {
      participantSignatures: participantIds.length,
      teamPhotos: teamPhotos.length,
      duplicatePhotoWarnings: duplicateWarnings,
    };
  }

  async listVideoAttachments(id: string) {
    const dds = await this.findOne(id);
    return this.documentVideosService.listByDocument({
      companyId: dds.company_id,
      module: 'dds',
      documentId: dds.id,
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
    const dds = await this.findOne(id);
    this.assertDdsVideoMutable(dds);

    const result = await this.documentVideosService.uploadForDocument({
      companyId: dds.company_id,
      module: 'dds',
      documentId: dds.id,
      buffer: input.buffer,
      originalName: input.originalName,
      mimeType: input.mimeType,
      uploadedById: actorId,
    });

    this.logger.log({
      event: 'dds_video_attachment_uploaded',
      ddsId: dds.id,
      companyId: dds.company_id,
      attachmentId: result.attachment.id,
      mimeType: result.attachment.mime_type,
      storageKey: result.attachment.storage_key,
      actorId: actorId || null,
    });

    return result;
  }

  async getVideoAttachmentAccess(
    id: string,
    attachmentId: string,
    actorId?: string,
  ) {
    const dds = await this.findOne(id);
    const result = await this.documentVideosService.getAccess({
      companyId: dds.company_id,
      module: 'dds',
      documentId: dds.id,
      attachmentId,
    });

    this.logger.log({
      event: 'dds_video_attachment_accessed',
      ddsId: dds.id,
      companyId: dds.company_id,
      attachmentId,
      availability: result.availability,
      actorId: actorId || null,
    });

    return result;
  }

  async removeVideoAttachment(
    id: string,
    attachmentId: string,
    actorId?: string,
  ) {
    const dds = await this.findOne(id);
    this.assertDdsVideoMutable(dds);

    const result = await this.documentVideosService.removeFromDocument({
      companyId: dds.company_id,
      module: 'dds',
      documentId: dds.id,
      attachmentId,
      removedById: actorId,
    });

    this.logger.log({
      event: 'dds_video_attachment_removed',
      ddsId: dds.id,
      companyId: dds.company_id,
      attachmentId,
      actorId: actorId || null,
    });

    return result;
  }

  async update(id: string, updateDdsDto: UpdateDdsDto): Promise<Dds> {
    const dds = await this.findOne(id);
    this.assertFinalDocumentMutable(dds);
    const { participants, confirm_signature_reset, ...rest } = updateDdsDto;
    const participantIds =
      participants !== undefined
        ? this.normalizeUniqueIds(participants)
        : this.getParticipantIds(dds);
    await this.assertRelationsBelongToCompany({
      companyId: dds.company_id,
      siteId: rest.site_id ?? dds.site_id,
      facilitatorId: rest.facilitador_id ?? dds.facilitador_id,
      participantIds,
      auditorId:
        rest.auditado_por_id !== undefined
          ? rest.auditado_por_id
          : dds.auditado_por_id,
    });

    const signatureResetReasons = this.getSignatureResetReasons(
      dds,
      rest,
      participantIds,
    );

    if (signatureResetReasons.length > 0 && !confirm_signature_reset) {
      throw new BadRequestException({
        message:
          'Esta alteração irá invalidar as assinaturas existentes do DDS. ' +
          'Reenvie a requisição com confirm_signature_reset: true para confirmar.',
        signatureResetReasons,
      });
    }

    Object.assign(dds, rest);
    dds.participants = participantIds.map(
      (participantId) => ({ id: participantId }) as User,
    );

    const saved = await this.ddsRepository.manager.transaction(
      async (manager) => {
        const persistedDds = await manager.getRepository(Dds).save(dds);
        if (signatureResetReasons.length > 0) {
          await manager.getRepository(Signature).delete({
            document_id: id,
            document_type: 'DDS',
            company_id: dds.company_id,
          });
        }
        return persistedDds;
      },
    );

    this.logger.log({
      event: 'dds_updated',
      ddsId: saved.id,
      companyId: saved.company_id,
    });
    if (signatureResetReasons.length > 0) {
      this.logger.warn({
        event: 'dds_signatures_invalidated',
        ddsId: saved.id,
        companyId: saved.company_id,
        reasons: signatureResetReasons,
      });
    }
    return saved;
  }

  /**
   * Cria uma cópia operacional a partir de um template (is_modelo=true).
   * O novo DDS herda tema, conteudo, site_id e facilitador_id do modelo,
   * com data do dia atual e status RASCUNHO.
   */
  async operationalizeTemplate(id: string, overrides: { data?: string; facilitador_id?: string; site_id?: string } = {}): Promise<Dds> {
    const template = await this.findOne(id);
    if (!template.is_modelo) {
      throw new BadRequestException(
        'Somente modelos (is_modelo=true) podem ser operacionalizados.',
      );
    }
    const newDds = this.ddsRepository.create({
      company_id: template.company_id,
      tema: template.tema,
      conteudo: template.conteudo,
      site_id: overrides.site_id ?? template.site_id,
      facilitador_id: overrides.facilitador_id ?? template.facilitador_id,
      data: overrides.data
        ? (overrides.data as unknown as Date)
        : (this.toDateString(new Date()) as unknown as Date),
      is_modelo: false,
      status: DdsStatus.RASCUNHO,
    });
    const saved = await this.ddsRepository.save(newDds);
    this.logger.log({
      event: 'dds_operationalized',
      sourceTemplateId: id,
      newDdsId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  /** Busca múltiplos DDSs por IDs (máximo 50) */
  async findByIds(ids: string[]): Promise<Dds[]> {
    if (ids.length === 0) return [];
    const tenantId = this.tenantService.getTenantId();
    const safeIds = ids.slice(0, 50);
    return this.ddsRepository.find({
      where: safeIds.map((id) => ({
        id,
        deleted_at: IsNull(),
        ...(tenantId ? { company_id: tenantId } : {}),
      })),
      relations: ['site', 'facilitador', 'participants', 'company'],
    });
  }

  /**
   * Atualiza exclusivamente os campos de auditoria do DDS.
   * Não revalida nem invalida assinaturas — campos de auditoria são
   * independentes do conteúdo técnico do documento.
   */
  async updateAudit(id: string, dto: UpdateDdsAuditDto): Promise<Dds> {
    const dds = await this.findOne(id);
    if (dds.status === DdsStatus.ARQUIVADO) {
      throw new BadRequestException(
        'DDS arquivado não pode ter campos de auditoria alterados.',
      );
    }
    await this.assertRelationsBelongToCompany({
      companyId: dds.company_id,
      siteId: dds.site_id,
      facilitatorId: dds.facilitador_id,
      participantIds: this.getParticipantIds(dds),
      auditorId: dto.auditado_por_id,
    });
    Object.assign(dds, {
      auditado_por_id: dto.auditado_por_id,
      data_auditoria: dto.data_auditoria,
      resultado_auditoria: dto.resultado_auditoria,
      notas_auditoria: dto.notas_auditoria ?? dds.notas_auditoria,
    });
    const saved = await this.ddsRepository.save(dds);
    this.logger.log({
      event: 'dds_audit_updated',
      ddsId: saved.id,
      companyId: saved.company_id,
      resultado: saved.resultado_auditoria,
    });
    return saved;
  }

  async remove(id: string): Promise<void> {
    const dds = await this.findOne(id);
    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: dds.company_id,
      module: 'dds',
      entityId: dds.id,
      trailEventType: FORENSIC_EVENT_TYPES.FINAL_DOCUMENT_REMOVED,
      trailMetadata: {
        removalMode: 'soft_delete',
      },
      removeEntityState: async (manager) => {
        await manager.getRepository(Dds).softDelete(id);
      },
      cleanupStoredFile: (fileKey) =>
        this.documentStorageService.deleteFile(fileKey),
    });
    this.logger.log({
      event: 'dds_archived',
      ddsId: dds.id,
      companyId: dds.company_id,
    });
  }

  async count(options?: { where?: Record<string, unknown> }): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where = options?.where || {};
    return this.ddsRepository.count({
      where: tenantId
        ? ({
            ...where,
            company_id: tenantId,
            deleted_at: IsNull(),
          } as Record<string, unknown>)
        : ({ ...where, deleted_at: IsNull() } as Record<string, unknown>),
    });
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.listFinalDocuments('dds', filters);
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.getModuleWeeklyBundle(
      'dds',
      'DDS',
      filters,
    );
  }

  private async assertReadyForFinalDocument(dds: Dds): Promise<void> {
    if (dds.is_modelo) {
      throw new BadRequestException(
        'Modelos de DDS nao podem receber PDF final. Gere um DDS operacional a partir do modelo.',
      );
    }

    if (dds.status === DdsStatus.RASCUNHO) {
      throw new BadRequestException(
        'O DDS precisa estar publicado ou auditado antes do anexo do PDF final.',
      );
    }

    const participantIds = this.getParticipantIds(dds);
    if (participantIds.length === 0) {
      throw new BadRequestException(
        'O DDS precisa ter participantes definidos antes do PDF final.',
      );
    }

    const signatures = await this.signaturesService.findByDocument(
      dds.id,
      'DDS',
    );
    const participantSigners = new Set(
      signatures
        .filter(
          (signature) =>
            !this.isTeamPhotoSignature(signature.type) &&
            signature.type !== TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE,
        )
        .map((signature) => signature.user_id),
    );

    const missingParticipants = participantIds.filter(
      (participantId) => !participantSigners.has(participantId),
    );

    if (missingParticipants.length > 0) {
      throw new BadRequestException(
        'Todos os participantes precisam assinar o DDS antes do anexo do PDF final.',
      );
    }

    const duplicateWarnings = await this.findDuplicateTeamPhotoHashes(
      dds,
      signatures
        .filter((signature) => this.isTeamPhotoSignature(signature.type))
        .map((signature) => this.parseTeamPhoto(signature))
        .filter((photo): photo is TeamPhotoEvidence => Boolean(photo)),
    );

    if (
      duplicateWarnings.length > 0 &&
      String(dds.photo_reuse_justification || '').trim().length < 20
    ) {
      throw new BadRequestException(
        'O DDS possui foto potencialmente reutilizada e exige justificativa registrada antes do PDF final.',
      );
    }
  }

  private async findDuplicateTeamPhotoHashes(
    dds: Dds,
    teamPhotos: TeamPhotoEvidence[],
  ): Promise<string[]> {
    if (teamPhotos.length === 0) {
      return [];
    }

    const historicalHashes = await this.getHistoricalPhotoHashes(HISTORICAL_PHOTO_HASH_LIMIT, dds.id);
    const knownHashes = new Set(
      historicalHashes.flatMap((item) => item.hashes).filter(Boolean),
    );

    return Array.from(
      new Set(
        teamPhotos
          .map((photo) => photo.hash)
          .filter((hash) => Boolean(hash) && knownHashes.has(hash)),
      ),
    );
  }

  private getParticipantIds(dds: Dds): string[] {
    return Array.from(
      new Set((dds.participants || []).map((participant) => participant.id)),
    );
  }

  private isTeamPhotoSignature(type: string): boolean {
    return /^team_photo_\d+$/i.test(type);
  }

  private parseTeamPhotoHash(signature: Signature): string | null {
    return this.parseTeamPhoto(signature)?.hash || null;
  }

  private parseTeamPhoto(signature: Signature): TeamPhotoEvidence | null {
    try {
      const parsed = JSON.parse(signature.signature_data) as TeamPhotoEvidence;
      if (!parsed?.hash || !parsed?.imageData) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private assertFinalDocumentMutable(dds: Dds): void {
    if (dds.pdf_file_key) {
      throw new BadRequestException(
        'DDS com PDF final anexado. Edição bloqueada. Gere um novo DDS para alterar o documento.',
      );
    }
    if (dds.status === DdsStatus.ARQUIVADO) {
      throw new BadRequestException(
        'DDS arquivado. Gere um novo DDS para retomar o fluxo operacional.',
      );
    }
  }

  private assertDdsVideoMutable(dds: Dds): void {
    this.assertFinalDocumentMutable(dds);

    if (dds.is_modelo) {
      throw new BadRequestException(
        'Modelos de DDS não aceitam evidências em vídeo. Gere um DDS operacional antes de anexar o vídeo.',
      );
    }
  }

  private normalizeUniqueIds(ids?: string[]): string[] {
    return Array.from(new Set((ids || []).filter(Boolean)));
  }

  private async assertRelationsBelongToCompany(input: {
    companyId: string;
    siteId: string;
    facilitatorId: string;
    participantIds: string[];
    auditorId?: string;
  }): Promise<void> {
    await this.assertSiteBelongsToCompany(input.siteId, input.companyId);
    await this.assertUsersBelongToCompany(
      [input.facilitatorId],
      input.companyId,
      'Facilitador',
    );
    if (input.auditorId) {
      await this.assertUsersBelongToCompany(
        [input.auditorId],
        input.companyId,
        'Auditor',
      );
    }
    if (input.participantIds.length > 0) {
      await this.assertUsersBelongToCompany(
        input.participantIds,
        input.companyId,
        'Participantes',
      );
    }
  }

  private async assertSiteBelongsToCompany(
    siteId: string,
    companyId: string,
  ): Promise<void> {
    const site = await this.ddsRepository.manager.getRepository(Site).findOne({
      where: { id: siteId, company_id: companyId },
      select: ['id'],
    });
    if (!site) {
      throw new BadRequestException(
        'O site informado não pertence à empresa atual do DDS.',
      );
    }
  }

  private async assertUsersBelongToCompany(
    userIds: string[],
    companyId: string,
    label: string,
  ): Promise<void> {
    const uniqueUserIds = this.normalizeUniqueIds(userIds);
    if (uniqueUserIds.length === 0) {
      return;
    }

    const users = await this.ddsRepository.manager.getRepository(User).find({
      where: {
        id: In(uniqueUserIds),
        company_id: companyId,
        deletedAt: IsNull(),
      },
      select: ['id'],
    });
    const foundIds = new Set(users.map((user) => user.id));
    const missingIds = uniqueUserIds.filter((userId) => !foundIds.has(userId));
    if (missingIds.length > 0) {
      throw new BadRequestException(
        `${label} informado(s) não pertencem à empresa atual do DDS.`,
      );
    }
  }

  private getSignatureResetReasons(
    dds: Dds,
    nextValues: Omit<UpdateDdsDto, 'participants'>,
    nextParticipantIds: string[],
  ): string[] {
    const reasons: string[] = [];
    const currentParticipantIds = [...this.getParticipantIds(dds)].sort();
    const sortedNextParticipantIds = [...nextParticipantIds].sort();

    if (
      JSON.stringify(currentParticipantIds) !==
      JSON.stringify(sortedNextParticipantIds)
    ) {
      reasons.push('participants_changed');
    }

    const nextTema = nextValues.tema ?? dds.tema;
    const nextConteudo = nextValues.conteudo ?? dds.conteudo ?? '';
    const nextData = nextValues.data ?? this.toDateString(dds.data);
    const nextSiteId = nextValues.site_id ?? dds.site_id;
    const nextFacilitadorId = nextValues.facilitador_id ?? dds.facilitador_id;
    const nextIsModelo = nextValues.is_modelo ?? dds.is_modelo;

    if (nextTema !== dds.tema) {
      reasons.push('theme_changed');
    }
    if (nextConteudo !== (dds.conteudo ?? '')) {
      reasons.push('content_changed');
    }
    if (nextData !== this.toDateString(dds.data)) {
      reasons.push('date_changed');
    }
    if (nextSiteId !== dds.site_id) {
      reasons.push('site_changed');
    }
    if (nextFacilitadorId !== dds.facilitador_id) {
      reasons.push('facilitator_changed');
    }
    if (nextIsModelo !== dds.is_modelo) {
      reasons.push('model_flag_changed');
    }

    return reasons;
  }

  private toDateString(value?: Date | string | null): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
  }

  private buildDdsDocumentCode(
    dds: Pick<Dds, 'id' | 'tema' | 'data' | 'created_at'>,
  ): string {
    const candidateDate = dds.data
      ? new Date(dds.data)
      : dds.created_at
        ? new Date(dds.created_at)
        : new Date();
    const year = Number.isNaN(candidateDate.getTime())
      ? new Date().getFullYear()
      : candidateDate.getFullYear();
    const reference = String(dds.id || dds.tema || 'DDS')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-8)
      .toUpperCase();

    return `DDS-${year}-${reference || String(Date.now()).slice(-6)}`;
  }
}
