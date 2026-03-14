import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Pt, PtStatus, PT_ALLOWED_TRANSITIONS } from './entities/pt.entity';
import { S3Service } from '../common/storage/s3.service';
import { TenantService } from '../common/tenant/tenant.service';
import { CreatePtDto } from './dto/create-pt.dto';
import { UpdatePtDto } from './dto/update-pt.dto';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { RiskCalculationService } from '../common/services/risk-calculation.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { WorkerOperationalStatusService } from '../users/worker-operational-status.service';
import { UpdatePtApprovalRulesDto } from './dto/update-pt-approval-rules.dto';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import {
  DocumentBundleService,
  WeeklyBundleFilters,
} from '../common/services/document-bundle.service';
import { DocumentRegistryService } from '../document-registry/document-registry.service';

@Injectable()
export class PtsService {
  private readonly logger = new Logger(PtsService.name);
  private readonly defaultApprovalRules = {
    blockCriticalRiskWithoutEvidence: true,
    blockWorkerWithoutValidMedicalExam: true,
    blockWorkerWithExpiredBlockingTraining: true,
    requireAtLeastOneExecutante: false,
  };

  constructor(
    @InjectRepository(Pt)
    private ptsRepository: Repository<Pt>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private tenantService: TenantService,
    private readonly riskCalculationService: RiskCalculationService,
    private readonly auditService: AuditService,
    private readonly workerOperationalStatusService: WorkerOperationalStatusService,
    private readonly documentBundleService: DocumentBundleService,
    private readonly s3Service: S3Service,
    private readonly documentRegistryService: DocumentRegistryService,
  ) {}

  private async syncDocumentRegistry(
    pt: Pick<
      Pt,
      | 'id'
      | 'company_id'
      | 'titulo'
      | 'numero'
      | 'data_hora_inicio'
      | 'created_at'
      | 'pdf_file_key'
      | 'pdf_folder_path'
      | 'pdf_original_name'
    >,
    options?: {
      fileBuffer?: Buffer;
      mimeType?: string;
      createdBy?: string;
    },
  ) {
    if (!pt.pdf_file_key) {
      return;
    }

    await this.documentRegistryService.upsert({
      companyId: pt.company_id,
      module: 'pt',
      entityId: pt.id,
      title: pt.titulo || pt.numero || 'PT',
      documentDate: pt.data_hora_inicio || pt.created_at,
      fileKey: pt.pdf_file_key,
      folderPath: pt.pdf_folder_path,
      originalName: pt.pdf_original_name,
      mimeType: options?.mimeType || 'application/pdf',
      fileBuffer: options?.fileBuffer,
      createdBy: options?.createdBy,
    });
  }

  async create(createPtDto: CreatePtDto): Promise<Pt> {
    const { executantes, ...rest } = createPtDto;
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
      initial_risk: initialRisk,
      residual_risk: residualRisk,
      control_evidence: Boolean(rest.control_evidence),
      company_id: this.tenantService.getTenantId(),
      executantes: executantes?.map((id) => ({ id }) as unknown as User),
    });

    const saved = await this.ptsRepository.save(pt);
    this.logger.log({
      event: 'pt_created',
      ptId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async findAll(): Promise<Pt[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.ptsRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      relations: ['site', 'apr', 'responsavel', 'executantes', 'auditado_por'],
    });
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<OffsetPage<Pt>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.ptsRepository
      .createQueryBuilder('pt')
      .select([
        'pt.id', 'pt.numero', 'pt.titulo', 'pt.descricao',
        'pt.data_hora_inicio', 'pt.data_hora_fim', 'pt.status',
        'pt.company_id', 'pt.site_id', 'pt.apr_id',
        'pt.responsavel_id', 'pt.created_at', 'pt.updated_at',
      ])
      .orderBy('pt.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (tenantId) {
      qb.where('pt.company_id = :tenantId', { tenantId });
    }
    if (opts?.search) {
      const clause = '(pt.titulo ILIKE :search OR pt.numero ILIKE :search)';
      tenantId
        ? qb.andWhere(clause, { search: `%${opts.search}%` })
        : qb.where(clause, { search: `%${opts.search}%` });
    }
    if (opts?.status) {
      qb.andWhere('pt.status = :status', { status: opts.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Pt> {
    const tenantId = this.tenantService.getTenantId();
    const pt = await this.ptsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['site', 'apr', 'responsavel', 'executantes', 'auditado_por'],
    });
    if (!pt) {
      throw new NotFoundException(`PT com ID ${id} não encontrada`);
    }
    return pt;
  }

  async update(id: string, updatePtDto: UpdatePtDto): Promise<Pt> {
    const pt = await this.findOne(id);
    const { executantes, ...rest } = updatePtDto;
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
    await this.syncDocumentRegistry(saved, {
      createdBy: RequestContext.getUserId() || undefined,
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
    const key = this.s3Service.generateDocumentKey(
      pt.company_id,
      'pts',
      id,
      file.originalname,
    );

    try {
      await this.s3Service.uploadFile(key, file.buffer, file.mimetype);
    } catch {
      this.logger.warn(`S3 desabilitado, armazenando referência local: ${key}`);
    }

    const folder = `pts/${pt.company_id}`;
    await this.ptsRepository.update(id, {
      pdf_file_key: key,
      pdf_folder_path: folder,
      pdf_original_name: file.originalname,
    });
    await this.syncDocumentRegistry(
      {
        ...pt,
        pdf_file_key: key,
        pdf_folder_path: folder,
        pdf_original_name: file.originalname,
      },
      {
        fileBuffer: file.buffer,
        mimeType: file.mimetype,
        createdBy: userId || RequestContext.getUserId() || undefined,
      },
    );
    this.logger.log({ event: 'pt_pdf_anexado', ptId: id, userId, fileKey: key });

    return { fileKey: key, folderPath: folder, originalName: file.originalname };
  }

  async getPdfAccess(id: string): Promise<{
    entityId: string;
    fileKey: string;
    folderPath: string;
    originalName: string;
    url: string | null;
  }> {
    const pt = await this.findOne(id);
    if (!pt.pdf_file_key) {
      throw new NotFoundException(`PT ${id} não possui PDF armazenado`);
    }

    let url: string | null = null;
    try {
      url = await this.s3Service.getSignedUrl(pt.pdf_file_key, 3600);
    } catch {
      url = null;
    }

    return {
      entityId: pt.id,
      fileKey: pt.pdf_file_key,
      folderPath: pt.pdf_folder_path,
      originalName: pt.pdf_original_name,
      url,
    };
  }

  async approve(id: string, approvedByUserId: string, reason?: string): Promise<Pt> {
    const pt = await this.findOne(id);
    const allowed = PT_ALLOWED_TRANSITIONS[pt.status as PtStatus];
    if (!allowed?.includes(PtStatus.APROVADA)) {
      throw new BadRequestException(
        `Transição inválida: ${pt.status} → Aprovada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
      );
    }
    const before = { ...pt };
    await this.assertCanApprove(pt, pt.company_id);
    pt.status = PtStatus.APROVADA;
    pt.aprovado_por_id = approvedByUserId;
    pt.aprovado_em = new Date();
    pt.aprovado_motivo = reason || undefined;
    pt.reprovado_por_id = null;
    pt.reprovado_em = undefined;
    pt.reprovado_motivo = undefined;
    const saved = await this.ptsRepository.save(pt);
    await this.logAudit({
      action: AuditAction.UPDATE,
      entityId: saved.id,
      before,
      after: saved,
      fallbackUserId: approvedByUserId,
    });
    return saved;
  }

  async reject(id: string, rejectedByUserId: string, reason: string): Promise<Pt> {
    const pt = await this.findOne(id);
    const allowed = PT_ALLOWED_TRANSITIONS[pt.status as PtStatus];
    if (!allowed?.includes(PtStatus.CANCELADA)) {
      throw new BadRequestException(
        `Transição inválida: ${pt.status} → Cancelada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
      );
    }
    const before = { ...pt };
    pt.status = PtStatus.CANCELADA;
    pt.reprovado_por_id = rejectedByUserId;
    pt.reprovado_em = new Date();
    pt.reprovado_motivo = reason;
    const saved = await this.ptsRepository.save(pt);
    await this.logAudit({
      action: AuditAction.UPDATE,
      entityId: saved.id,
      before,
      after: saved,
      fallbackUserId: rejectedByUserId,
    });
    return saved;
  }

  async remove(id: string): Promise<void> {
    const pt = await this.findOne(id);
    await this.ptsRepository.softDelete(id);
    await this.documentRegistryService.remove({
      companyId: pt.company_id,
      module: 'pt',
      entityId: pt.id,
    });
    this.logger.log({ event: 'pt_soft_deleted', ptId: id });
  }

  async count(options?: any): Promise<number> {
    return this.ptsRepository.count(options);
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    const tenantId = this.tenantService.getTenantId();
    const query = this.ptsRepository
      .createQueryBuilder('pt')
      .where('pt.pdf_file_key IS NOT NULL');

    if (tenantId) {
      query.andWhere('pt.company_id = :tenantId', { tenantId });
    }
    if (filters.companyId) {
      query.andWhere('pt.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    const results = await query.getMany();

    return results
      .filter((pt) => {
        if (!pt.created_at) return false;
        const date = new Date(pt.created_at);
        if (filters.year && date.getFullYear() !== filters.year) return false;
        if (filters.week) {
          const d = new Date(
            Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
          );
          d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
          const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
          const isoWeek = Math.ceil(
            ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
          );
          if (isoWeek !== filters.week) return false;
        }
        return true;
      })
      .map((pt) => ({
        entityId: pt.id,
        title: pt.titulo || pt.numero || 'PT',
        date: pt.data_hora_inicio || pt.created_at,
        id: pt.id,
        numero: pt.numero,
        titulo: pt.titulo,
        companyId: pt.company_id,
        fileKey: pt.pdf_file_key,
        folderPath: pt.pdf_folder_path,
        originalName: pt.pdf_original_name,
      }));
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
    const tenantId = this.tenantService.getTenantId();
    const qb = this.ptsRepository
      .createQueryBuilder('pt')
      .select([
        'pt.numero', 'pt.titulo', 'pt.status',
        'pt.data_hora_inicio', 'pt.data_hora_fim', 'pt.created_at',
      ])
      .orderBy('pt.created_at', 'DESC');
    if (tenantId) qb.where('pt.company_id = :tenantId', { tenantId });
    const pts = await qb.getMany();

    const rows = pts.map((p) => ({
      'Número': p.numero,
      'Título': p.titulo,
      'Status': p.status,
      'Data/Hora Início': p.data_hora_inicio ? new Date(p.data_hora_inicio).toLocaleString('pt-BR') : '',
      'Data/Hora Fim': p.data_hora_fim ? new Date(p.data_hora_fim).toLocaleString('pt-BR') : '',
      'Criado em': new Date(p.created_at).toLocaleDateString('pt-BR'),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PTs');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
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

    if (rules.requireAtLeastOneExecutante && (!pt.executantes || pt.executantes.length === 0)) {
      reasons.push('PT exige ao menos um executante vinculado');
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
        rules.blockWorkerWithoutValidMedicalExam &&
        status.medicalExam.status !== 'VALIDO'
      ) {
        workerReasons.push(
          `${status.user.nome}: ASO ${status.medicalExam.status.toLowerCase()}.`,
        );
      }

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
      blockWorkerWithoutValidMedicalExam:
        rules?.blockWorkerWithoutValidMedicalExam ??
        this.defaultApprovalRules.blockWorkerWithoutValidMedicalExam,
      blockWorkerWithExpiredBlockingTraining:
        rules?.blockWorkerWithExpiredBlockingTraining ??
        this.defaultApprovalRules.blockWorkerWithExpiredBlockingTraining,
      requireAtLeastOneExecutante:
        rules?.requireAtLeastOneExecutante ??
        this.defaultApprovalRules.requireAtLeastOneExecutante,
    };
  }

  private async findCurrentCompanyOrFail(): Promise<Company> {
    const companyId = this.tenantService.getTenantId();
    if (!companyId) {
      throw new BadRequestException(
        'Contexto de empresa não identificado para configurar regras da PT.',
      );
    }
    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada para configurar regras.');
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
    const userId = RequestContext.getUserId() || params.fallbackUserId || 'system';
    const companyId = this.tenantService.getTenantId() || '';
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
