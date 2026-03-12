import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Apr, AprStatus, APR_ALLOWED_TRANSITIONS } from './entities/apr.entity';
import { AprLog } from './entities/apr-log.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { CreateAprDto } from './dto/create-apr.dto';
import { UpdateAprDto } from './dto/update-apr.dto';
import { Activity } from '../activities/entities/activity.entity';
import { Risk } from '../risks/entities/risk.entity';
import { Epi } from '../epis/entities/epi.entity';
import { Tool } from '../tools/entities/tool.entity';
import { Machine } from '../machines/entities/machine.entity';
import { User } from '../users/entities/user.entity';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { plainToClass } from 'class-transformer';
import { AprListItemDto } from './dto/apr-list-item.dto';
import { RiskCalculationService } from '../common/services/risk-calculation.service';
import {
  DocumentBundleService,
  WeeklyBundleFilters,
} from '../common/services/document-bundle.service';
import { S3Service } from '../common/storage/s3.service';

@Injectable()
export class AprsService {
  private readonly logger = new Logger(AprsService.name);

  constructor(
    @InjectRepository(Apr)
    private aprsRepository: Repository<Apr>,
    @InjectRepository(AprLog)
    private aprLogsRepository: Repository<AprLog>,
    private tenantService: TenantService,
    private readonly riskCalculationService: RiskCalculationService,
    private readonly documentBundleService: DocumentBundleService,
    private readonly s3Service: S3Service,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async addLog(
    aprId: string,
    userId: string | undefined,
    acao: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const log = this.aprLogsRepository.create({
        apr_id: aprId,
        usuario_id: userId ?? undefined,
        acao,
        metadata: metadata ?? undefined,
      });
      await this.aprLogsRepository.save(log);
    } catch {
      this.logger.warn(`Falha ao gravar log de APR (${aprId}): ${acao}`);
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async create(createAprDto: CreateAprDto): Promise<Apr> {
    const { activities, risks, epis, tools, machines, participants, ...rest } =
      createAprDto;
    const initialRisk = this.riskCalculationService.calculateScore(
      rest.probability,
      rest.severity,
      rest.exposure,
    );
    const residualRisk =
      rest.residual_risk ||
      this.riskCalculationService.classifyByScore(initialRisk) ||
      null;

    if (rest.is_modelo_padrao) {
      rest.is_modelo = true;
    }

    const apr = this.aprsRepository.create({
      ...rest,
      initial_risk: initialRisk,
      residual_risk: residualRisk,
      control_evidence: Boolean(rest.control_evidence),
      company_id: this.tenantService.getTenantId(),
      activities: activities?.map((id) => ({ id }) as unknown as Activity),
      risks: risks?.map((id) => ({ id }) as unknown as Risk),
      epis: epis?.map((id) => ({ id }) as unknown as Epi),
      tools: tools?.map((id) => ({ id }) as unknown as Tool),
      machines: machines?.map((id) => ({ id }) as unknown as Machine),
      participants: participants?.map((id) => ({ id }) as unknown as User),
    });

    const saved = await this.aprsRepository.save(apr);
    if (saved.is_modelo_padrao) {
      await this.aprsRepository.update(
        { company_id: saved.company_id },
        { is_modelo_padrao: false },
      );
      await this.aprsRepository.update(
        { id: saved.id },
        { is_modelo_padrao: true, is_modelo: true },
      );
    }
    this.logger.log({ event: 'apr_created', aprId: saved.id, companyId: saved.company_id });
    return saved;
  }

  async findAll(): Promise<Apr[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.aprsRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      relations: [
        'company', 'site', 'elaborador', 'activities', 'risks',
        'epis', 'tools', 'machines', 'participants', 'auditado_por',
      ],
    });
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    companyId?: string;
    isModeloPadrao?: boolean;
  }): Promise<OffsetPage<AprListItemDto>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.aprsRepository
      .createQueryBuilder('apr')
      .select([
        'apr.id', 'apr.numero', 'apr.titulo', 'apr.descricao',
        'apr.data_inicio', 'apr.data_fim', 'apr.status', 'apr.versao',
        'apr.is_modelo', 'apr.is_modelo_padrao', 'apr.company_id',
        'apr.classificacao_resumo', 'apr.created_at',
      ])
      .orderBy('apr.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (tenantId) {
      qb.where('apr.company_id = :tenantId', { tenantId });
    } else if (opts?.companyId) {
      qb.where('apr.company_id = :companyId', { companyId: opts.companyId });
    }
    if (opts?.search) {
      const clause = 'apr.titulo ILIKE :search';
      tenantId || opts?.companyId
        ? qb.andWhere(clause, { search: `%${opts.search}%` })
        : qb.where(clause, { search: `%${opts.search}%` });
    }
    if (opts?.status) {
      qb.andWhere('apr.status = :status', { status: opts.status });
    }
    if (opts?.isModeloPadrao !== undefined) {
      qb.andWhere('apr.is_modelo_padrao = :isModeloPadrao', {
        isModeloPadrao: opts.isModeloPadrao,
      });
    }

    const [rows, total] = await qb.getManyAndCount();
    const data = rows.map((r) => plainToClass(AprListItemDto, r));
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Apr> {
    const tenantId = this.tenantService.getTenantId();
    const apr = await this.aprsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: [
        'company', 'site', 'elaborador', 'activities', 'risks',
        'epis', 'tools', 'machines', 'participants', 'auditado_por',
      ],
    });
    if (!apr) {
      throw new NotFoundException(`APR com ID ${id} não encontrada`);
    }
    return apr;
  }

  /** Busca sem eager-load de relações — usar em operações de escrita (approve, reject, update...) */
  private async findOneForWrite(id: string): Promise<Apr> {
    const tenantId = this.tenantService.getTenantId();
    const apr = await this.aprsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
    });
    if (!apr) {
      throw new NotFoundException(`APR com ID ${id} não encontrada`);
    }
    return apr;
  }

  async update(id: string, updateAprDto: UpdateAprDto): Promise<Apr> {
    const apr = await this.findOneForWrite(id);
    const { activities, risks, epis, tools, machines, participants, ...rest } =
      updateAprDto;

    const next = { ...rest };
    if (next.is_modelo_padrao) next.is_modelo = true;
    if (next.is_modelo === false) next.is_modelo_padrao = false;

    const initialRisk = this.riskCalculationService.calculateScore(
      next.probability ?? apr.probability,
      next.severity ?? apr.severity,
      next.exposure ?? apr.exposure,
    );
    const residualRisk =
      next.residual_risk ||
      this.riskCalculationService.classifyByScore(initialRisk) ||
      apr.residual_risk ||
      null;

    Object.assign(apr, {
      ...next,
      initial_risk: initialRisk,
      residual_risk: residualRisk,
      control_evidence:
        next.control_evidence !== undefined
          ? Boolean(next.control_evidence)
          : Boolean(apr.control_evidence),
    });

    if (activities) apr.activities = activities.map((id) => ({ id }) as unknown as Activity);
    if (risks) apr.risks = risks.map((id) => ({ id }) as unknown as Risk);
    if (epis) apr.epis = epis.map((id) => ({ id }) as unknown as Epi);
    if (tools) apr.tools = tools.map((id) => ({ id }) as unknown as Tool);
    if (machines) apr.machines = machines.map((id) => ({ id }) as unknown as Machine);
    if (participants) apr.participants = participants.map((id) => ({ id }) as unknown as User);

    const saved = await this.aprsRepository.save(apr);
    if (saved.is_modelo_padrao) {
      await this.aprsRepository.update(
        { company_id: saved.company_id },
        { is_modelo_padrao: false },
      );
      await this.aprsRepository.update(
        { id: saved.id },
        { is_modelo_padrao: true, is_modelo: true },
      );
    }
    this.logger.log({ event: 'apr_updated', aprId: saved.id, companyId: saved.company_id });
    return saved;
  }

  async remove(id: string, userId?: string): Promise<void> {
    const apr = await this.findOneForWrite(id);
    await this.aprsRepository.softDelete(id);
    await this.addLog(id, userId, 'removido', { companyId: apr.company_id });
    this.logger.log({ event: 'apr_soft_deleted', aprId: apr.id, companyId: apr.company_id });
  }

  // ─── Workflow ────────────────────────────────────────────────────────────────

  async approve(id: string, userId: string, reason?: string): Promise<Apr> {
    const apr = await this.findOneForWrite(id);
    const allowed = APR_ALLOWED_TRANSITIONS[apr.status as AprStatus];
    if (!allowed?.includes(AprStatus.APROVADA)) {
      throw new BadRequestException(
        `Transição inválida: ${apr.status} → Aprovada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
      );
    }
    apr.status = AprStatus.APROVADA;
    apr.aprovado_por_id = userId;
    apr.aprovado_em = new Date();
    if (reason) apr.aprovado_motivo = reason;
    const saved = await this.aprsRepository.save(apr);
    await this.addLog(id, userId, 'aprovado', { motivo: reason });
    this.logger.log({ event: 'apr_approved', aprId: id, userId });
    return saved;
  }

  async reject(id: string, userId: string, reason: string): Promise<Apr> {
    const apr = await this.findOneForWrite(id);
    const allowed = APR_ALLOWED_TRANSITIONS[apr.status as AprStatus];
    if (!allowed?.includes(AprStatus.CANCELADA)) {
      throw new BadRequestException(
        `Transição inválida: ${apr.status} → Cancelada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
      );
    }
    apr.status = AprStatus.CANCELADA;
    apr.reprovado_por_id = userId;
    apr.reprovado_em = new Date();
    apr.reprovado_motivo = reason;
    const saved = await this.aprsRepository.save(apr);
    await this.addLog(id, userId, 'reprovado', { motivo: reason });
    this.logger.log({ event: 'apr_rejected', aprId: id, userId });
    return saved;
  }

  async finalize(id: string, userId: string): Promise<Apr> {
    const apr = await this.findOneForWrite(id);
    const allowed = APR_ALLOWED_TRANSITIONS[apr.status as AprStatus];
    if (!allowed?.includes(AprStatus.ENCERRADA)) {
      throw new BadRequestException(
        `Transição inválida: ${apr.status} → Encerrada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
      );
    }
    apr.status = AprStatus.ENCERRADA;
    const saved = await this.aprsRepository.save(apr);
    await this.addLog(id, userId, 'encerrado');
    this.logger.log({ event: 'apr_finalized', aprId: id, userId });
    return saved;
  }

  async createNewVersion(id: string, userId: string): Promise<Apr> {
    const original = await this.findOneForWrite(id);
    if (original.status !== AprStatus.APROVADA) {
      throw new BadRequestException(
        `Somente APRs Aprovadas podem gerar nova versão. Status atual: ${original.status}`,
      );
    }

    const rootId = original.parent_apr_id ?? original.id;
    const maxVersionRow = await this.aprsRepository
      .createQueryBuilder('apr')
      .select('MAX(apr.versao)', 'max')
      .where('(apr.id = :rootId OR apr.parent_apr_id = :rootId)', { rootId })
      .getRawOne<{ max: string }>();
    const nextVersion = Number(maxVersionRow?.max ?? original.versao) + 1;

    const novo = this.aprsRepository.create({
      titulo: original.titulo,
      descricao: original.descricao,
      data_inicio: original.data_inicio,
      data_fim: original.data_fim,
      status: AprStatus.PENDENTE,
      is_modelo: original.is_modelo,
      is_modelo_padrao: false,
      probability: original.probability,
      severity: original.severity,
      exposure: original.exposure,
      initial_risk: original.initial_risk,
      residual_risk: original.residual_risk,
      control_description: original.control_description,
      control_evidence: original.control_evidence,
      company_id: original.company_id,
      site_id: original.site_id,
      elaborador_id: userId,
      versao: nextVersion,
      parent_apr_id: rootId,
      numero: `${original.numero}-v${nextVersion}`,
    });

    const saved = await this.aprsRepository.save(novo);
    await this.addLog(id, userId, 'nova_versao_criada', { novaAprId: saved.id, versao: nextVersion });
    this.logger.log({ event: 'apr_new_version', originalId: id, newId: saved.id, versao: nextVersion });
    return saved;
  }

  // ─── PDF Storage ─────────────────────────────────────────────────────────────

  async attachPdf(
    id: string,
    file: Express.Multer.File,
    userId?: string,
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const apr = await this.findOneForWrite(id);
    const key = this.s3Service.generateDocumentKey(
      apr.company_id,
      'aprs',
      id,
      file.originalname,
    );

    try {
      await this.s3Service.uploadFile(key, file.buffer, file.mimetype);
    } catch {
      this.logger.warn(`S3 desabilitado, armazenando referência local: ${key}`);
    }

    const folder = `aprs/${apr.company_id}`;
    await this.aprsRepository.update(id, {
      pdf_file_key: key,
      pdf_folder_path: folder,
      pdf_original_name: file.originalname,
    });
    await this.addLog(id, userId, 'pdf_anexado', { fileKey: key });

    return { fileKey: key, folderPath: folder, originalName: file.originalname };
  }

  async getPdfAccess(id: string): Promise<{
    entityId: string;
    fileKey: string;
    folderPath: string;
    originalName: string;
    url: string | null;
  }> {
    const apr = await this.findOneForWrite(id);
    if (!apr.pdf_file_key) {
      throw new NotFoundException(`APR ${id} não possui PDF armazenado`);
    }

    let url: string | null = null;
    try {
      url = await this.s3Service.getSignedUrl(apr.pdf_file_key, 3600);
    } catch {
      url = null;
    }

    return {
      entityId: apr.id,
      fileKey: apr.pdf_file_key,
      folderPath: apr.pdf_folder_path,
      originalName: apr.pdf_original_name,
      url,
    };
  }

  // ─── Logs & History ──────────────────────────────────────────────────────────

  async getLogs(id: string): Promise<AprLog[]> {
    await this.findOneForWrite(id);
    return this.aprLogsRepository.find({
      where: { apr_id: id },
      order: { data_hora: 'DESC' },
    });
  }

  async getVersionHistory(id: string): Promise<Apr[]> {
    const apr = await this.findOneForWrite(id);
    const rootId = apr.parent_apr_id ?? apr.id;
    const tenantId = this.tenantService.getTenantId();

    const qb = this.aprsRepository
      .createQueryBuilder('apr')
      .select([
        'apr.id', 'apr.numero', 'apr.versao', 'apr.status',
        'apr.parent_apr_id', 'apr.aprovado_em', 'apr.updated_at',
        'apr.classificacao_resumo',
      ])
      .where('(apr.id = :rootId OR apr.parent_apr_id = :rootId)', { rootId })
      .orderBy('apr.versao', 'ASC');

    if (tenantId) qb.andWhere('apr.company_id = :tenantId', { tenantId });

    return qb.getMany();
  }

  // ─── Analytics ────────────────────────────────────────────────────────────────

  async getAnalyticsOverview(): Promise<{
    totalAprs: number;
    aprovadas: number;
    pendentes: number;
    riscosCriticos: number;
    mediaScoreRisco: number;
  }> {
    const tenantId = this.tenantService.getTenantId();
    const baseWhere: Record<string, unknown> = {};
    if (tenantId) baseWhere.company_id = tenantId;

    const [totalAprs, aprovadas, pendentes] = await Promise.all([
      this.aprsRepository.count({ where: baseWhere as any }),
      this.aprsRepository.count({ where: { ...baseWhere, status: AprStatus.APROVADA } as any }),
      this.aprsRepository.count({ where: { ...baseWhere, status: AprStatus.PENDENTE } as any }),
    ]);

    const riskQb = this.aprsRepository
      .createQueryBuilder('apr')
      .innerJoin('apr.risk_items', 'ri')
      .select('AVG(ri.score_risco)', 'avg')
      .addSelect(
        `COUNT(CASE WHEN UPPER(ri.categoria_risco) IN ('CRÍTICO', 'CRITICO') THEN 1 END)`,
        'criticos',
      );

    if (tenantId) riskQb.where('apr.company_id = :tenantId', { tenantId });

    const riskStats = await riskQb.getRawOne<{ avg: string; criticos: string }>();

    return {
      totalAprs,
      aprovadas,
      pendentes,
      riscosCriticos: Number(riskStats?.criticos ?? 0),
      mediaScoreRisco: Math.round(Number(riskStats?.avg ?? 0)),
    };
  }

  // ─── Misc ────────────────────────────────────────────────────────────────────

  async count(options?: any): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where = options?.where || {};
    return this.aprsRepository.count({
      where: tenantId ? { ...where, company_id: tenantId } : where,
    });
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    const tenantId = this.tenantService.getTenantId();
    const query = this.aprsRepository
      .createQueryBuilder('apr')
      .where('apr.pdf_file_key IS NOT NULL');

    if (tenantId) query.andWhere('apr.company_id = :tenantId', { tenantId });
    if (filters.companyId) {
      query.andWhere('apr.company_id = :companyId', { companyId: filters.companyId });
    }

    const results = await query.getMany();

    return results
      .filter((apr) => {
        if (!apr.created_at) return false;
        const date = new Date(apr.created_at);
        if (filters.year && date.getFullYear() !== filters.year) return false;
        if (filters.week) {
          const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
          d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
          const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
          const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
          if (isoWeek !== filters.week) return false;
        }
        return true;
      })
      .map((apr) => ({
        entityId: apr.id,
        title: apr.titulo || apr.numero || 'APR',
        date: apr.data_inicio || apr.created_at,
        id: apr.id,
        titulo: apr.titulo,
        data_inicio: apr.data_inicio,
        companyId: apr.company_id,
        fileKey: apr.pdf_file_key,
        folderPath: apr.pdf_folder_path,
        originalName: apr.pdf_original_name,
      }));
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    const files = await this.listStoredFiles(filters);
    return this.documentBundleService.buildWeeklyPdfBundle(
      'APR',
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
    const qb = this.aprsRepository
      .createQueryBuilder('apr')
      .select([
        'apr.numero', 'apr.titulo', 'apr.status',
        'apr.data_inicio', 'apr.data_fim', 'apr.versao', 'apr.created_at',
      ])
      .orderBy('apr.created_at', 'DESC');
    if (tenantId) qb.where('apr.company_id = :tenantId', { tenantId });
    const aprs = await qb.getMany();

    const rows = aprs.map((a) => ({
      'Número': a.numero,
      'Título': a.titulo,
      'Status': a.status,
      'Data Início': a.data_inicio ? new Date(a.data_inicio).toLocaleDateString('pt-BR') : '',
      'Data Fim': a.data_fim ? new Date(a.data_fim).toLocaleDateString('pt-BR') : '',
      'Versão': a.versao ?? 1,
      'Criado em': new Date(a.created_at).toLocaleDateString('pt-BR'),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'APRs');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  async getRiskMatrix(siteId?: string): Promise<{ matrix: { categoria: string; prob: number; sev: number; count: number }[] }> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.aprsRepository
      .createQueryBuilder('apr')
      .innerJoin('apr.risk_items', 'ri')
      .select('ri.categoria_risco', 'categoria')
      .addSelect('ri.probabilidade', 'prob')
      .addSelect('ri.severidade', 'sev')
      .addSelect('COUNT(*)', 'count')
      .where('ri.probabilidade IS NOT NULL')
      .andWhere('ri.severidade IS NOT NULL')
      .groupBy('ri.categoria_risco')
      .addGroupBy('ri.probabilidade')
      .addGroupBy('ri.severidade');

    if (tenantId) qb.andWhere('apr.company_id = :tenantId', { tenantId });
    if (siteId) qb.andWhere('apr.site_id = :siteId', { siteId });

    const raw = await qb.getRawMany();
    return {
      matrix: raw.map((r) => ({
        categoria: r.categoria as string,
        prob: Number(r.prob),
        sev: Number(r.sev),
        count: Number(r.count),
      })),
    };
  }

  getControlSuggestions(payload: {
    probability?: number;
    severity?: number;
    exposure?: number;
    activity?: string;
    condition?: string;
  }) {
    const score = this.riskCalculationService.calculateScore(
      payload.probability,
      payload.severity,
      payload.exposure,
    );
    const riskLevel = this.riskCalculationService.classifyByScore(score);
    return {
      score,
      riskLevel,
      suggestions: this.riskCalculationService.suggestControls({
        riskLevel,
        activity: payload.activity,
        condition: payload.condition,
      }),
    };
  }
}
