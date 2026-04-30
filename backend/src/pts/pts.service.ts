import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  FindManyOptions,
  FindOptionsWhere,
  In,
  IsNull,
  LessThan,
  Repository,
} from 'typeorm';
import { jsonToExcelBuffer } from '../common/utils/excel.util';
import { Pt, PtStatus, PT_ALLOWED_TRANSITIONS } from './entities/pt.entity';
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';
import { TenantService } from '../common/tenant/tenant.service';
import { CreatePtDto } from './dto/create-pt.dto';
import { UpdatePtDto } from './dto/update-pt.dto';
import { LogPreApprovalReviewDto } from './dto/log-pre-approval-review.dto';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { Site } from '../sites/entities/site.entity';
import { Apr } from '../aprs/entities/apr.entity';
import { RiskCalculationService } from '../common/services/risk-calculation.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { WorkerOperationalStatusService } from '../users/worker-operational-status.service';
import { UpdatePtApprovalRulesDto } from './dto/update-pt-approval-rules.dto';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { DocumentBundleService } from '../common/services/document-bundle.service';
import {
  CursorPaginatedResponse,
  decodeCursorToken,
  toCursorPaginatedResponse,
} from '../common/utils/cursor-pagination.util';
import { WeeklyBundleFilters } from '../common/services/document-bundle.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { SignaturesService } from '../signatures/signatures.service';
import { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import { FORENSIC_EVENT_TYPES } from '../forensic-trail/forensic-trail.constants';
import { MetricsService } from '../common/observability/metrics.service';
import { Counter } from '@opentelemetry/api';

export const PTS_DOMAIN_METRICS = 'PTS_DOMAIN_METRICS';

// Throttle: evita UPDATE desnecessário quando múltiplas requests chegam simultaneamente.
// Valor em ms. Em produção com 2 instâncias Render cada uma tem seu próprio throttle
// — redundância intencional (ambas podem expirar, mas no máximo 1×/60s por instância).
const EXPIRE_REFRESH_THROTTLE_MS = 60_000;

import { GovernedPdfAccessAvailability } from '../common/dto/governed-pdf-access-response.dto';

type PreApprovalChecklist = Record<string, unknown>;
type PtPdfAccessAvailability = GovernedPdfAccessAvailability;
type PreApprovalReviewPayload = {
  stage?: string;
  readyForRelease?: boolean;
  blockers?: unknown;
  unansweredChecklistItems?: number;
  adverseChecklistItems?: number;
  pendingSignatures?: number;
  hasRapidRiskBlocker?: boolean;
  warnings?: unknown;
  checklist?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const PT_FINAL_PDF_ALLOWED_STATUSES = new Set<PtStatus>([
  PtStatus.APROVADA,
  PtStatus.ENCERRADA,
  PtStatus.EXPIRADA,
]);

@Injectable()
export class PtsService {
  private readonly logger = new Logger(PtsService.name);
  private readonly defaultApprovalRules = {
    blockCriticalRiskWithoutEvidence: true,
    blockWorkerWithoutValidMedicalExam: false,
    blockWorkerWithExpiredBlockingTraining: true,
    requireAtLeastOneExecutante: false,
  };

  // Throttle map: companyId → timestamp do último refresh bem-sucedido
  private readonly expireRefreshThrottle = new Map<string, number>();

  constructor(
    @InjectRepository(Pt)
    private ptsRepository: Repository<Pt>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
    private tenantService: TenantService,
    private readonly riskCalculationService: RiskCalculationService,
    private readonly auditService: AuditService,
    private readonly workerOperationalStatusService: WorkerOperationalStatusService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly documentBundleService: DocumentBundleService,
    private readonly signaturesService: SignaturesService,
    private readonly forensicTrailService: ForensicTrailService,
    @Optional() private readonly metricsService?: MetricsService,
    @Optional()
    @Inject(PTS_DOMAIN_METRICS)
    private readonly domainMetrics?: Record<string, Counter>,
  ) {}

  private assertPtDocumentMutable(pt: Pick<Pt, 'pdf_file_key'>) {
    if (pt.pdf_file_key) {
      throw new BadRequestException(
        'PT com PDF final anexado. Edição bloqueada. Gere uma nova PT para alterar o documento.',
      );
    }
  }

  private assertPtEditableStatus(status: string) {
    if (status !== PtStatus.PENDENTE.toString()) {
      throw new BadRequestException(
        'Somente PTs pendentes podem ser editadas pelo formulário. Use os fluxos formais de aprovação, cancelamento e encerramento.',
      );
    }
  }

  private assertPtReadyForFinalPdf(pt: Pick<Pt, 'status' | 'pdf_file_key'>) {
    this.assertPtDocumentMutable(pt);

    if (!PT_FINAL_PDF_ALLOWED_STATUSES.has(pt.status as PtStatus)) {
      throw new BadRequestException(
        'A PT precisa estar aprovada, encerrada ou expirada antes do anexo do PDF final.',
      );
    }
  }

  private buildPtDocumentCode(
    pt: Pick<
      Pt,
      'id' | 'numero' | 'titulo' | 'data_hora_inicio' | 'created_at'
    >,
  ): string {
    const candidateDate = pt.data_hora_inicio
      ? new Date(pt.data_hora_inicio)
      : pt.created_at
        ? new Date(pt.created_at)
        : new Date();
    const year = Number.isNaN(candidateDate.getTime())
      ? new Date().getFullYear()
      : candidateDate.getFullYear();
    const reference = String(pt.id || pt.numero || pt.titulo || 'PT')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-8)
      .toUpperCase();

    return `PT-${year}-${reference || String(Date.now()).slice(-6)}`;
  }

  private resolveStatusForGenericCreate(
    requestedStatus?: string | null,
  ): PtStatus {
    if (!requestedStatus || requestedStatus === PtStatus.PENDENTE.toString()) {
      return PtStatus.PENDENTE;
    }

    throw new BadRequestException(
      'O status da PT é controlado pelos fluxos formais de aprovação e cancelamento.',
    );
  }

  private resolveStatusForGenericUpdate(
    currentStatus: string,
    requestedStatus?: string | null,
  ): string {
    if (!requestedStatus || requestedStatus === currentStatus) {
      return currentStatus;
    }

    throw new BadRequestException(
      'O status da PT é controlado pelos fluxos formais de aprovação e cancelamento.',
    );
  }

  private async assertCompanyScopedEntityId<
    T extends { id: string; company_id: string },
  >(
    entity: { new (): T },
    companyId: string,
    id: string | null | undefined,
    label: string,
  ): Promise<void> {
    if (!id) {
      return;
    }

    const exists = await this.ptsRepository.manager
      .getRepository(entity)
      .exist({
        where: { id, company_id: companyId } as never,
      });

    if (!exists) {
      throw new BadRequestException(
        `${label} inválido para a empresa/tenant atual.`,
      );
    }
  }

  private async assertCompanyScopedEntityIds<
    T extends { id: string; company_id: string },
  >(
    entity: { new (): T },
    companyId: string,
    ids: string[] | undefined,
    label: string,
  ): Promise<void> {
    const uniqueIds = Array.from(
      new Set(
        (ids || []).filter((id): id is string =>
          Boolean(String(id || '').trim()),
        ),
      ),
    );

    if (uniqueIds.length === 0) {
      return;
    }

    const count = await this.ptsRepository.manager.getRepository(entity).count({
      where: { id: In(uniqueIds), company_id: companyId } as never,
    });

    if (count !== uniqueIds.length) {
      throw new BadRequestException(
        `${label} contém vínculo(s) inválido(s) para a empresa/tenant atual.`,
      );
    }
  }

  private async assertUsersScopedToSite(
    companyId: string,
    siteId: string | null | undefined,
    ids: Array<string | null | undefined>,
    label: string,
  ): Promise<void> {
    if (!siteId) {
      return;
    }

    const uniqueIds = Array.from(
      new Set(
        ids.filter((id): id is string => Boolean(String(id || '').trim())),
      ),
    );
    if (uniqueIds.length === 0) {
      return;
    }

    const count = await this.ptsRepository.manager.getRepository(User).count({
      where: [
        {
          id: In(uniqueIds),
          company_id: companyId,
          site_id: siteId,
        },
        {
          id: In(uniqueIds),
          company_id: companyId,
          site_id: IsNull(),
        },
      ] as never,
    });

    if (count !== uniqueIds.length) {
      throw new BadRequestException(
        `${label} contém vínculo(s) inválido(s) para a obra/setor selecionada.`,
      );
    }
  }

  private async validateRelatedEntityScope(input: {
    companyId: string;
    siteId?: string | null;
    aprId?: string | null;
    responsavelId?: string | null;
    auditadoPorId?: string | null;
    executantes?: string[];
  }): Promise<void> {
    await Promise.all([
      this.assertCompanyScopedEntityId(
        Site,
        input.companyId,
        input.siteId,
        'Site',
      ),
      this.assertCompanyScopedEntityId(
        Apr,
        input.companyId,
        input.aprId,
        'APR vinculada',
      ),
      this.assertCompanyScopedEntityId(
        User,
        input.companyId,
        input.responsavelId,
        'Responsável',
      ),
      this.assertCompanyScopedEntityId(
        User,
        input.companyId,
        input.auditadoPorId,
        'Auditado por',
      ),
      this.assertCompanyScopedEntityIds(
        User,
        input.companyId,
        input.executantes,
        'Executantes',
      ),
    ]);

    await this.assertUsersScopedToSite(
      input.companyId,
      input.siteId,
      [input.responsavelId, input.auditadoPorId, ...(input.executantes ?? [])],
      'Usuários da PT',
    );
  }

  private async refreshExpiredStatuses(companyId?: string): Promise<void> {
    const { siteId, siteScope, isSuperAdmin } = this.getTenantContextOrThrow();
    const throttleKey = companyId ?? '*';
    const lastRun = this.expireRefreshThrottle.get(throttleKey) ?? 0;

    if (Date.now() - lastRun < EXPIRE_REFRESH_THROTTLE_MS) {
      return; // Executado recentemente — pular para reduzir carga no Supabase
    }

    // Marcar antes de executar para que requests concorrentes não disparem em paralelo
    this.expireRefreshThrottle.set(throttleKey, Date.now());

    const where: FindOptionsWhere<Pt> = {
      status: PtStatus.APROVADA,
      data_hora_fim: LessThan(new Date()),
      deleted_at: IsNull(),
      ...(companyId ? { company_id: companyId } : {}),
      ...(!isSuperAdmin && siteScope !== 'all' && siteId
        ? { site_id: siteId }
        : {}),
    };

    const result = await this.ptsRepository.update(where, {
      status: PtStatus.EXPIRADA,
    });

    if ((result.affected ?? 0) > 0) {
      this.logger.log({
        event: 'pt_auto_expired',
        companyId: companyId || null,
        affected: result.affected ?? 0,
      });
    }
  }

  private getTenantContextOrThrow(): {
    companyId: string;
    siteId?: string;
    siteScope: 'single' | 'all';
    isSuperAdmin: boolean;
  } {
    const context = this.tenantService.getContext();
    if (!context?.companyId) {
      throw new BadRequestException('Contexto de empresa nao definido.');
    }

    const siteScope = context.siteScope ?? 'single';
    if (siteScope === 'single' && !context.siteId) {
      throw new BadRequestException('Contexto de obra nao definido.');
    }

    return {
      companyId: context.companyId,
      siteId: context.siteId,
      siteScope,
      isSuperAdmin: context.isSuperAdmin,
    };
  }

  private async getAllowedPtIdsForCurrentScope(): Promise<Set<string> | null> {
    const { companyId, siteId, siteScope, isSuperAdmin } =
      this.getTenantContextOrThrow();

    if (isSuperAdmin || siteScope === 'all') {
      return null;
    }

    const scopedPts = await this.ptsRepository.find({
      select: ['id'],
      where: { company_id: companyId, site_id: siteId, deleted_at: IsNull() },
    });

    return new Set(scopedPts.map((pt) => pt.id));
  }

  async create(createPtDto: CreatePtDto): Promise<Pt> {
    const { executantes, status, ...rest } = createPtDto;
    const { companyId, siteId, siteScope, isSuperAdmin } =
      this.getTenantContextOrThrow();
    const effectiveSiteId =
      !isSuperAdmin && siteScope !== 'all' ? siteId : createPtDto.site_id;

    if (
      !isSuperAdmin &&
      siteScope !== 'all' &&
      createPtDto.site_id !== siteId
    ) {
      throw new BadRequestException(
        'PT deve ser criada na obra atual do tenant.',
      );
    }

    await this.validateRelatedEntityScope({
      companyId,
      siteId: effectiveSiteId,
      aprId: createPtDto.apr_id ?? null,
      responsavelId: createPtDto.responsavel_id,
      auditadoPorId: createPtDto.auditado_por_id ?? null,
      executantes,
    });

    const initialRisk = this.riskCalculationService.calculateScore(
      rest.probability,
      rest.severity,
      rest.exposure,
    );
    const residualRisk =
      rest.residual_risk ||
      this.riskCalculationService.classifyByScore(initialRisk) ||
      null;

    const pt = this.ptsRepository.create({
      ...rest,
      status: this.resolveStatusForGenericCreate(status),
      initial_risk: initialRisk,
      residual_risk: residualRisk,
      control_evidence: Boolean(rest.control_evidence),
      company_id: companyId,
      site_id: effectiveSiteId,
      executantes: executantes?.map((id) => ({ id }) as unknown as User),
    });

    const saved = await this.ptsRepository.save(pt);
    await this.logAudit({
      action: AuditAction.CREATE,
      entityId: saved.id,
      after: saved,
    });
    this.logger.log({
      event: 'pt_created',
      ptId: saved.id,
      companyId: saved.company_id,
    });
    try {
      this.domainMetrics?.pts_created?.add(1, {
        company_id: saved.company_id,
      });
    } catch (error) {
      this.logger.warn(
        `[PTS] Falha ao registrar pts_created no domínio: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.metricsService?.incrementPtCreated(saved.company_id);
    }
    return saved;
  }

  async findAll(opts?: {
    page?: number;
    limit?: number;
  }): Promise<OffsetPage<Pt>> {
    const { companyId, siteId, siteScope, isSuperAdmin } =
      this.getTenantContextOrThrow();
    void this.refreshExpiredStatuses(companyId);
    // maxLimit: 1000 — limite de segurança para evitar OOM (5 JOINs em findOne)
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 1000,
    });

    const qb = this.ptsRepository
      .createQueryBuilder('pt')
      .select([
        'pt.id',
        'pt.numero',
        'pt.titulo',
        'pt.descricao',
        'pt.data_hora_inicio',
        'pt.data_hora_fim',
        'pt.status',
        'pt.company_id',
        'pt.site_id',
        'pt.apr_id',
        'pt.responsavel_id',
        'pt.pdf_file_key',
        'pt.created_at',
        'pt.updated_at',
      ])
      .where('pt.deleted_at IS NULL')
      .orderBy('pt.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (companyId) {
      qb.andWhere('pt.company_id = :companyId', { companyId });
    }
    if (!isSuperAdmin && siteScope !== 'all') {
      qb.andWhere('pt.site_id = :siteId', { siteId });
    }

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  // Carrega todos os registros para uso interno (exportações, relatórios).
  // Sem relações; apenas campos essenciais; take: 5000 como teto de segurança.
  async findAllForExport(): Promise<Pt[]> {
    const { companyId, siteId, siteScope, isSuperAdmin } =
      this.getTenantContextOrThrow();
    void this.refreshExpiredStatuses(companyId);
    const qb = this.ptsRepository
      .createQueryBuilder('pt')
      .select([
        'pt.id',
        'pt.numero',
        'pt.titulo',
        'pt.status',
        'pt.data_hora_inicio',
        'pt.data_hora_fim',
        'pt.company_id',
        'pt.created_at',
      ])
      .where('pt.deleted_at IS NULL')
      .orderBy('pt.created_at', 'DESC')
      .take(5000);

    if (companyId) {
      qb.andWhere('pt.company_id = :companyId', { companyId });
    }
    if (!isSuperAdmin && siteScope !== 'all') {
      qb.andWhere('pt.site_id = :siteId', { siteId });
    }

    return qb.getMany();
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<OffsetPage<Pt>> {
    const { companyId, siteId, siteScope, isSuperAdmin } =
      this.getTenantContextOrThrow();
    void this.refreshExpiredStatuses(companyId);
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.ptsRepository
      .createQueryBuilder('pt')
      .select([
        'pt.id',
        'pt.numero',
        'pt.titulo',
        'pt.descricao',
        'pt.data_hora_inicio',
        'pt.data_hora_fim',
        'pt.status',
        'pt.company_id',
        'pt.site_id',
        'pt.apr_id',
        'pt.responsavel_id',
        'pt.pdf_file_key',
        'pt.created_at',
        'pt.updated_at',
      ])
      .orderBy('pt.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    qb.where('pt.deleted_at IS NULL');

    if (companyId) {
      qb.andWhere('pt.company_id = :companyId', { companyId });
    }
    if (!isSuperAdmin && siteScope !== 'all') {
      qb.andWhere('pt.site_id = :siteId', { siteId });
    }
    if (opts?.search) {
      qb.andWhere('(pt.titulo ILIKE :search OR pt.numero ILIKE :search)', {
        search: `%${opts.search}%`,
      });
    }
    if (opts?.status) {
      qb.andWhere('pt.status = :status', { status: opts.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findByCursor(opts?: {
    cursor?: string;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<CursorPaginatedResponse<Pt>> {
    const { companyId, siteId, siteScope, isSuperAdmin } =
      this.getTenantContextOrThrow();
    void this.refreshExpiredStatuses(companyId);

    const { limit } = normalizeOffsetPagination(
      { page: 1, limit: opts?.limit },
      {
        defaultLimit: 20,
        maxLimit: 100,
      },
    );
    const decodedCursor = decodeCursorToken(opts?.cursor);
    if (opts?.cursor && !decodedCursor) {
      throw new BadRequestException('Cursor inválido para listagem de PT.');
    }

    const qb = this.ptsRepository
      .createQueryBuilder('pt')
      .select([
        'pt.id',
        'pt.numero',
        'pt.titulo',
        'pt.descricao',
        'pt.data_hora_inicio',
        'pt.data_hora_fim',
        'pt.status',
        'pt.company_id',
        'pt.site_id',
        'pt.apr_id',
        'pt.responsavel_id',
        'pt.pdf_file_key',
        'pt.created_at',
        'pt.updated_at',
      ])
      .where('pt.deleted_at IS NULL')
      .orderBy('pt.created_at', 'DESC')
      .addOrderBy('pt.id', 'DESC')
      .take(limit + 1);

    if (companyId) {
      qb.andWhere('pt.company_id = :companyId', { companyId });
    }
    if (!isSuperAdmin && siteScope !== 'all') {
      qb.andWhere('pt.site_id = :siteId', { siteId });
    }

    if (opts?.search) {
      qb.andWhere('(pt.titulo ILIKE :search OR pt.numero ILIKE :search)', {
        search: `%${opts.search}%`,
      });
    }

    if (opts?.status) {
      qb.andWhere('pt.status = :status', { status: opts.status });
    }

    if (decodedCursor) {
      qb.andWhere(
        '(pt.created_at < :cursorCreatedAt OR (pt.created_at = :cursorCreatedAt AND pt.id < :cursorId))',
        {
          cursorCreatedAt: decodedCursor.created_at,
          cursorId: decodedCursor.id,
        },
      );
    }

    const rows = await qb.getMany();
    return toCursorPaginatedResponse({
      rows,
      limit,
      getCreatedAt: (row) => row.created_at,
    });
  }

  async findOne(id: string): Promise<Pt> {
    const { companyId, siteId, siteScope, isSuperAdmin } =
      this.getTenantContextOrThrow();
    void this.refreshExpiredStatuses(companyId);
    const pt = await this.ptsRepository.findOne({
      where: { id, company_id: companyId },
      relations: ['site', 'apr', 'responsavel', 'executantes', 'auditado_por'],
    });
    if (!pt) {
      throw new NotFoundException(`PT com ID ${id} não encontrada`);
    }
    if (!isSuperAdmin && siteScope !== 'all' && pt.site_id !== siteId) {
      throw new NotFoundException(`PT com ID ${id} não encontrada`);
    }
    return pt;
  }

  async update(id: string, updatePtDto: UpdatePtDto): Promise<Pt> {
    const pt = await this.findOne(id);
    this.assertPtEditableStatus(pt.status);
    this.assertPtDocumentMutable(pt);
    const { executantes, status, ...rest } = updatePtDto;
    const before = { ...pt };

    await this.validateRelatedEntityScope({
      companyId: pt.company_id,
      siteId: rest.site_id ?? pt.site_id,
      aprId: rest.apr_id !== undefined ? rest.apr_id : pt.apr_id,
      responsavelId: rest.responsavel_id ?? pt.responsavel_id,
      auditadoPorId:
        rest.auditado_por_id !== undefined
          ? rest.auditado_por_id
          : pt.auditado_por_id,
      executantes:
        executantes ??
        (Array.isArray(pt.executantes)
          ? pt.executantes.map((executante) => executante.id)
          : []),
    });

    const initialRisk = this.riskCalculationService.calculateScore(
      rest.probability ?? pt.probability,
      rest.severity ?? pt.severity,
      rest.exposure ?? pt.exposure,
    );
    const residualRisk =
      rest.residual_risk ||
      this.riskCalculationService.classifyByScore(initialRisk) ||
      pt.residual_risk ||
      null;

    Object.assign(pt, {
      ...rest,
      status: this.resolveStatusForGenericUpdate(pt.status, status),
      initial_risk: initialRisk,
      residual_risk: residualRisk,
      control_evidence:
        rest.control_evidence !== undefined
          ? Boolean(rest.control_evidence)
          : Boolean(pt.control_evidence),
    });

    if (executantes) {
      pt.executantes = executantes.map((id) => ({ id }) as unknown as User);
    }

    const saved = await this.ptsRepository.save(pt);
    await this.logAudit({
      action: AuditAction.UPDATE,
      entityId: saved.id,
      before,
      after: saved,
    });
    this.logger.log({
      event: 'pt_updated',
      ptId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async attachPdf(
    id: string,
    file: Express.Multer.File,
    userId?: string,
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const pt = await this.findOne(id);
    this.assertPtReadyForFinalPdf(pt);
    if (!pt.site_id) {
      throw new BadRequestException(
        'PT sem obra/setor vinculado não pode receber PDF final.',
      );
    }

    const key = this.documentStorageService.generateDocumentKey(
      pt.company_id,
      'pts',
      id,
      file.originalname,
      { folderSegments: ['sites', pt.site_id] },
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
        companyId: pt.company_id,
        module: 'pt',
        entityId: pt.id,
        title: pt.titulo || pt.numero || 'PT',
        documentDate: pt.data_hora_inicio || pt.created_at,
        documentCode: this.buildPtDocumentCode(pt),
        fileKey: key,
        folderPath: folder,
        originalName: file.originalname,
        mimeType: file.mimetype,
        createdBy: userId || RequestContext.getUserId() || undefined,
        fileBuffer: file.buffer,
        persistEntityMetadata: async (manager) => {
          await manager.getRepository(Pt).update(id, {
            pdf_file_key: key,
            pdf_folder_path: folder,
            pdf_original_name: file.originalname,
          });
        },
      });
    } catch (error) {
      if (uploadedToStorage) {
        await cleanupUploadedFile(this.logger, `pt:${pt.id}`, key, (fileKey) =>
          this.documentStorageService.deleteFile(fileKey),
        );
      }
      throw error;
    }
    this.logger.log({
      event: 'pt_pdf_anexado',
      ptId: id,
      userId,
      fileKey: key,
    });

    return {
      fileKey: key,
      folderPath: folder,
      originalName: file.originalname,
    };
  }

  async getPdfAccess(id: string): Promise<{
    entityId: string;
    hasFinalPdf: boolean;
    availability: PtPdfAccessAvailability;
    message: string;
    fileKey: string | null;
    folderPath: string | null;
    originalName: string | null;
    url: string | null;
  }> {
    const pt = await this.findOne(id);
    if (!pt.pdf_file_key) {
      return {
        entityId: pt.id,
        hasFinalPdf: false,
        availability: 'not_emitted',
        message: 'A PT ainda não possui PDF final emitido.',
        fileKey: null,
        folderPath: null,
        originalName: null,
        url: null,
      };
    }

    let url: string | null = null;
    let availability: PtPdfAccessAvailability = 'ready';
    try {
      url = await this.documentStorageService.getSignedUrl(
        pt.pdf_file_key,
        3600,
      );
    } catch {
      url = null;
      availability = 'registered_without_signed_url';
    }

    return {
      entityId: pt.id,
      hasFinalPdf: true,
      availability,
      message:
        availability === 'ready'
          ? 'PDF final disponível.'
          : 'PDF final registrado, mas a URL segura não está disponível no momento.',
      fileKey: pt.pdf_file_key,
      folderPath: pt.pdf_folder_path,
      originalName: pt.pdf_original_name,
      url,
    };
  }

  /**
   * Executa uma transição de status da PT de forma atômica com SELECT FOR UPDATE.
   * Previne race conditions quando múltiplos usuários tentam alterar o status
   * simultaneamente — o segundo request recebe ConflictException imediatamente.
   */
  private async executePtWorkflowTransition(
    id: string,
    fn: (pt: Pt, manager: EntityManager) => Promise<Pt>,
  ): Promise<Pt> {
    const { companyId, siteId, siteScope, isSuperAdmin } =
      this.getTenantContextOrThrow();

    return this.ptsRepository.manager.transaction(async (manager) => {
      const siteClause =
        !isSuperAdmin && siteScope !== 'all' ? ' AND "site_id" = $3' : '';
      const rows = await manager.query<Pt[]>(
        `SELECT * FROM "pts" WHERE "id" = $1 AND "company_id" = $2${siteClause} FOR UPDATE NOWAIT`,
        !isSuperAdmin && siteScope !== 'all'
          ? [id, companyId, siteId]
          : [id, companyId],
      );

      if (!rows || rows.length === 0) {
        throw new NotFoundException(`PT com ID ${id} não encontrada`);
      }

      const pt = manager.getRepository(Pt).create(rows[0]);
      return fn(pt, manager);
    });
  }

  async approve(
    id: string,
    approvedByUserId: string,
    reason?: string,
  ): Promise<Pt> {
    const before = await this.findOne(id);
    const saved = await this.executePtWorkflowTransition(
      id,
      async (pt, manager) => {
        this.assertPtDocumentMutable(pt);
        const allowed = PT_ALLOWED_TRANSITIONS[pt.status as PtStatus];
        if (!allowed?.includes(PtStatus.APROVADA)) {
          throw new BadRequestException(
            `Transição inválida: ${pt.status} → Aprovada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
          );
        }
        await this.assertCanApprove(pt, pt.company_id);
        pt.status = PtStatus.APROVADA;
        pt.aprovado_por_id = approvedByUserId;
        pt.aprovado_em = new Date();
        pt.aprovado_motivo = reason || undefined;
        pt.reprovado_por_id = null;
        pt.reprovado_em = undefined;
        pt.reprovado_motivo = undefined;
        return manager.getRepository(Pt).save(pt);
      },
    );
    await this.logAudit({
      action: AuditAction.UPDATE,
      entityId: saved.id,
      before,
      after: saved,
      fallbackUserId: approvedByUserId,
    });
    this.logger.log({
      event: 'pt_approved',
      ptId: saved.id,
      companyId: saved.company_id,
      userId: approvedByUserId,
    });
    return saved;
  }

  async reject(
    id: string,
    rejectedByUserId: string,
    reason: string,
  ): Promise<Pt> {
    const before = await this.findOne(id);
    const saved = await this.executePtWorkflowTransition(
      id,
      async (pt, manager) => {
        this.assertPtDocumentMutable(pt);
        const allowed = PT_ALLOWED_TRANSITIONS[pt.status as PtStatus];
        if (!allowed?.includes(PtStatus.CANCELADA)) {
          throw new BadRequestException(
            `Transição inválida: ${pt.status} → Cancelada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
          );
        }
        const previousStatus = pt.status;
        pt.status = PtStatus.CANCELADA;
        pt.reprovado_por_id = rejectedByUserId;
        pt.reprovado_em = new Date();
        pt.reprovado_motivo = reason;
        const persisted = await manager.getRepository(Pt).save(pt);
        await this.forensicTrailService.append(
          {
            eventType: FORENSIC_EVENT_TYPES.DOCUMENT_CANCELED,
            module: 'pt',
            entityId: persisted.id,
            companyId: persisted.company_id,
            userId: rejectedByUserId,
            metadata: {
              previousStatus,
              currentStatus: persisted.status,
              reason,
            },
          },
          { manager },
        );
        return persisted;
      },
    );
    await this.logAudit({
      action: AuditAction.UPDATE,
      entityId: saved.id,
      before,
      after: saved,
      fallbackUserId: rejectedByUserId,
    });
    this.logger.log({
      event: 'pt_rejected',
      ptId: saved.id,
      companyId: saved.company_id,
      userId: rejectedByUserId,
    });
    return saved;
  }

  async finalize(id: string, finalizedByUserId: string): Promise<Pt> {
    const before = await this.findOne(id);
    const saved = await this.executePtWorkflowTransition(
      id,
      async (pt, manager) => {
        const allowed = PT_ALLOWED_TRANSITIONS[pt.status as PtStatus];
        if (!allowed?.includes(PtStatus.ENCERRADA)) {
          throw new BadRequestException(
            `Transição inválida: ${pt.status} → Encerrada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
          );
        }
        pt.status = PtStatus.ENCERRADA;
        return manager.getRepository(Pt).save(pt);
      },
    );
    await this.logAudit({
      action: AuditAction.UPDATE,
      entityId: saved.id,
      before,
      after: saved,
      fallbackUserId: finalizedByUserId,
    });
    this.logger.log({
      event: 'pt_finalized',
      ptId: saved.id,
      companyId: saved.company_id,
      userId: finalizedByUserId,
    });
    return saved;
  }

  async logPreApprovalReview(
    id: string,
    reviewedByUserId: string,
    payload: LogPreApprovalReviewDto,
  ): Promise<{ logged: true }> {
    const pt = await this.findOne(id);

    await this.auditService.log({
      userId: reviewedByUserId,
      action: AuditAction.PRE_APPROVAL,
      entity: 'PT',
      entityId: pt.id,
      changes: {
        after: {
          auditStage: 'pre_approval_review',
          reviewStage: payload.stage,
          pt: {
            id: pt.id,
            numero: pt.numero,
            titulo: pt.titulo,
            status: pt.status,
          },
          review: payload,
        },
      },
      ip: (RequestContext.get('ip') as string) || 'unknown',
      userAgent: (RequestContext.get('userAgent') as string) || 'unknown',
      companyId: pt.company_id,
    });

    this.logger.log({
      event: 'pt_pre_approval_review_logged',
      ptId: pt.id,
      stage: payload.stage,
      userId: reviewedByUserId,
    });

    return { logged: true };
  }

  async getPreApprovalHistory(id: string) {
    const pt = await this.findOne(id);
    const records = await this.auditLogsRepository.find({
      where: {
        entity: 'PT',
        entityId: pt.id,
        action: AuditAction.PRE_APPROVAL,
        companyId: pt.company_id,
      },
      order: {
        timestamp: 'DESC',
      },
      take: 20,
    });

    return records.map((record) => {
      const after = isRecord(record.after) ? record.after : null;
      const reviewSource = after?.review;
      const review: PreApprovalReviewPayload = isRecord(reviewSource)
        ? reviewSource
        : {};
      const checklist: PreApprovalChecklist | null = isRecord(review.checklist)
        ? review.checklist
        : null;

      return {
        id: record.id,
        action: record.action,
        userId: record.userId || null,
        createdAt: record.timestamp,
        stage: typeof review.stage === 'string' ? review.stage : null,
        readyForRelease:
          typeof review.readyForRelease === 'boolean'
            ? review.readyForRelease
            : null,
        blockers: isStringArray(review.blockers) ? review.blockers : [],
        unansweredChecklistItems:
          typeof review.unansweredChecklistItems === 'number'
            ? review.unansweredChecklistItems
            : 0,
        adverseChecklistItems:
          typeof review.adverseChecklistItems === 'number'
            ? review.adverseChecklistItems
            : 0,
        pendingSignatures:
          typeof review.pendingSignatures === 'number'
            ? review.pendingSignatures
            : 0,
        hasRapidRiskBlocker:
          typeof review.hasRapidRiskBlocker === 'boolean'
            ? review.hasRapidRiskBlocker
            : false,
        warnings: isStringArray(review.warnings) ? review.warnings : [],
        checklist,
      };
    });
  }

  async remove(id: string): Promise<void> {
    const pt = await this.findOne(id);
    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: pt.company_id,
      module: 'pt',
      entityId: pt.id,
      trailEventType: FORENSIC_EVENT_TYPES.FINAL_DOCUMENT_REMOVED,
      trailMetadata: {
        removalMode: 'soft_delete',
      },
      removeEntityState: async (manager) => {
        await manager.getRepository(Pt).softDelete(id);
      },
      cleanupStoredFile: (fileKey) =>
        this.documentStorageService.deleteFile(fileKey),
    });
    this.logger.log({ event: 'pt_soft_deleted', ptId: id });
  }

  async count(options?: FindManyOptions<Pt>): Promise<number> {
    return this.ptsRepository.count(options);
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    const files = await this.documentGovernanceService.listFinalDocuments(
      'pt',
      filters,
    );
    const allowedIds = await this.getAllowedPtIdsForCurrentScope();
    if (!allowedIds) {
      return files;
    }

    return files.filter((file) => allowedIds.has(file.entityId));
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    const files = await this.listStoredFiles(filters);
    return this.documentBundleService.buildWeeklyPdfBundle(
      'PT',
      filters,
      files.map((file) => ({
        fileKey: file.fileKey,
        title: file.title,
        originalName: file.originalName,
        date: file.date,
      })),
    );
  }

  async exportExcel(): Promise<Buffer> {
    const { companyId, siteId, siteScope, isSuperAdmin } =
      this.getTenantContextOrThrow();
    void this.refreshExpiredStatuses(companyId);
    const qb = this.ptsRepository
      .createQueryBuilder('pt')
      .select([
        'pt.numero',
        'pt.titulo',
        'pt.status',
        'pt.data_hora_inicio',
        'pt.data_hora_fim',
        'pt.created_at',
      ])
      .where('pt.deleted_at IS NULL')
      .orderBy('pt.created_at', 'DESC');
    if (companyId) qb.andWhere('pt.company_id = :companyId', { companyId });
    if (!isSuperAdmin && siteScope !== 'all') {
      qb.andWhere('pt.site_id = :siteId', { siteId });
    }
    const pts = await qb.getMany();

    const rows = pts.map((p) => ({
      Número: p.numero,
      Título: p.titulo,
      Status: p.status,
      'Data/Hora Início': p.data_hora_inicio
        ? new Date(p.data_hora_inicio).toLocaleString('pt-BR')
        : '',
      'Data/Hora Fim': p.data_hora_fim
        ? new Date(p.data_hora_fim).toLocaleString('pt-BR')
        : '',
      'Criado em': new Date(p.created_at).toLocaleDateString('pt-BR'),
    }));

    return jsonToExcelBuffer(rows, 'PTs');
  }

  async getAnalyticsOverview(): Promise<{
    totalPts: number;
    aprovadas: number;
    pendentes: number;
    canceladas: number;
    encerradas: number;
    expiradas: number;
  }> {
    const { companyId, siteId, siteScope, isSuperAdmin } =
      this.getTenantContextOrThrow();
    void this.refreshExpiredStatuses(companyId);

    const baseWhere: FindOptionsWhere<Pt> = {
      company_id: companyId,
      ...(!isSuperAdmin && siteScope !== 'all' ? { site_id: siteId } : {}),
    };

    const countByStatus = (status: PtStatus) =>
      this.ptsRepository.count({
        where: {
          ...baseWhere,
          status,
        },
      });

    const [totalPts, aprovadas, pendentes, canceladas, encerradas, expiradas] =
      await Promise.all([
        this.ptsRepository.count({ where: baseWhere }),
        countByStatus(PtStatus.APROVADA),
        countByStatus(PtStatus.PENDENTE),
        countByStatus(PtStatus.CANCELADA),
        countByStatus(PtStatus.ENCERRADA),
        countByStatus(PtStatus.EXPIRADA),
      ]);

    return {
      totalPts,
      aprovadas,
      pendentes,
      canceladas,
      encerradas,
      expiradas,
    };
  }

  async getApprovalRules() {
    const company = await this.findCurrentCompanyOrFail();
    return this.normalizeApprovalRules(company.pt_approval_rules || undefined);
  }

  async updateApprovalRules(payload: UpdatePtApprovalRulesDto) {
    const company = await this.findCurrentCompanyOrFail();
    const merged = this.normalizeApprovalRules({
      ...(company.pt_approval_rules || {}),
      ...payload,
    });
    company.pt_approval_rules = merged;
    await this.companiesRepository.save(company);
    return merged;
  }

  private async assertCanApprove(pt: Pt, companyId: string): Promise<void> {
    const reasons: string[] = [];
    const rules = await this.getApprovalRulesForCompany(companyId);

    if (
      rules.blockCriticalRiskWithoutEvidence &&
      pt.residual_risk === 'CRITICAL' &&
      !pt.control_evidence
    ) {
      reasons.push('risco residual crítico sem evidência de controle');
    }

    if (
      rules.requireAtLeastOneExecutante &&
      (!pt.executantes || pt.executantes.length === 0)
    ) {
      reasons.push('PT exige ao menos um executante vinculado');
    }

    const executantes = Array.isArray(pt.executantes) ? pt.executantes : [];
    if (executantes.length > 0) {
      const signatures = await this.signaturesService.findByDocument(
        pt.id,
        'PT',
      );
      const signedExecutanteIds = new Set(
        signatures
          .map((signature) => signature.user_id)
          .filter(
            (userId): userId is string =>
              Boolean(userId) &&
              executantes.some((executante) => executante.id === userId),
          ),
      );
      const pendingExecutantes = executantes.filter(
        (executante) => !signedExecutanteIds.has(executante.id),
      );

      if (pendingExecutantes.length > 0) {
        reasons.push(
          `assinaturas pendentes dos executantes (${pendingExecutantes
            .map((executante) => executante.nome || executante.id.slice(0, 8))
            .join(', ')})`,
        );
      }
    }

    const workerIds = [
      pt.responsavel_id,
      ...(Array.isArray(pt.executantes)
        ? pt.executantes.map((executante) => executante.id)
        : []),
    ].filter(
      (value, index, values): value is string =>
        Boolean(value) && values.indexOf(value) === index,
    );

    const workerStatuses =
      await this.workerOperationalStatusService.getByUserIds(workerIds);

    workerStatuses.forEach((status) => {
      const workerReasons: string[] = [];

      if (
        rules.blockWorkerWithExpiredBlockingTraining &&
        status.trainings.expiredBlocking.length > 0
      ) {
        workerReasons.push(
          `${status.user.nome}: treinamentos vencidos (${status.trainings.expiredBlocking
            .map((item) => item.nome)
            .join(', ')}).`,
        );
      }

      if (workerReasons.length > 0) {
        reasons.push(...workerReasons);
      }
    });

    if (reasons.length > 0) {
      throw new BadRequestException({
        code: 'PT_APPROVAL_BLOCKED',
        message: 'PT bloqueada pelas regras de segurança da empresa.',
        reasons,
        rules,
      });
    }
  }

  private normalizeApprovalRules(
    rules?: Partial<Company['pt_approval_rules']>,
  ): NonNullable<Company['pt_approval_rules']> {
    return {
      blockCriticalRiskWithoutEvidence:
        rules?.blockCriticalRiskWithoutEvidence ??
        this.defaultApprovalRules.blockCriticalRiskWithoutEvidence,
      // Regra descontinuada por decisão de produto: ASO não bloqueia emissão/aprovação de PT.
      blockWorkerWithoutValidMedicalExam: false,
      blockWorkerWithExpiredBlockingTraining:
        rules?.blockWorkerWithExpiredBlockingTraining ??
        this.defaultApprovalRules.blockWorkerWithExpiredBlockingTraining,
      requireAtLeastOneExecutante:
        rules?.requireAtLeastOneExecutante ??
        this.defaultApprovalRules.requireAtLeastOneExecutante,
    };
  }

  private async findCurrentCompanyOrFail(): Promise<Company> {
    const { companyId } = this.getTenantContextOrThrow();
    if (!companyId) {
      throw new BadRequestException(
        'Contexto de empresa não identificado para configurar regras da PT.',
      );
    }
    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(
        'Empresa não encontrada para configurar regras.',
      );
    }
    return company;
  }

  private async getApprovalRulesForCompany(companyId: string) {
    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
      select: { id: true, pt_approval_rules: true },
    });
    return this.normalizeApprovalRules(company?.pt_approval_rules || undefined);
  }

  private async logAudit(params: {
    action: AuditAction;
    entityId: string;
    before?: unknown;
    after?: unknown;
    fallbackUserId?: string;
  }) {
    const userId =
      RequestContext.getUserId() || params.fallbackUserId || 'system';
    const companyId = this.getTenantContextOrThrow().companyId;
    await this.auditService.log({
      userId,
      action: params.action,
      entity: 'PT',
      entityId: params.entityId,
      changes: {
        before: params.before ?? null,
        after: params.after ?? null,
      },
      ip: (RequestContext.get('ip') as string) || 'unknown',
      userAgent: (RequestContext.get('userAgent') as string) || 'unknown',
      companyId,
    });
  }
}
