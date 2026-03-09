import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Apr } from './entities/apr.entity';
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

@Injectable()
export class AprsService {
  private readonly logger = new Logger(AprsService.name);

  constructor(
    @InjectRepository(Apr)
    private aprsRepository: Repository<Apr>,
    private tenantService: TenantService,
    private readonly riskCalculationService: RiskCalculationService,
    private readonly documentBundleService: DocumentBundleService,
  ) {}

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
    this.logger.log({
      event: 'apr_created',
      aprId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async findAll(): Promise<Apr[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.aprsRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      relations: [
        'company',
        'site',
        'elaborador',
        'activities',
        'risks',
        'epis',
        'tools',
        'machines',
        'participants',
        'auditado_por',
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
        'company',
        'site',
        'elaborador',
        'activities',
        'risks',
        'epis',
        'tools',
        'machines',
        'participants',
        'auditado_por',
      ],
    });
    if (!apr) {
      throw new NotFoundException(`APR com ID ${id} não encontrada`);
    }
    return apr;
  }

  async update(id: string, updateAprDto: UpdateAprDto): Promise<Apr> {
    const apr = await this.findOne(id);
    const { activities, risks, epis, tools, machines, participants, ...rest } =
      updateAprDto;

    const next = { ...rest };
    if (next.is_modelo_padrao) {
      next.is_modelo = true;
    }
    if (next.is_modelo === false) {
      next.is_modelo_padrao = false;
    }
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

    if (activities) {
      apr.activities = activities.map((id) => ({ id }) as unknown as Activity);
    }
    if (risks) {
      apr.risks = risks.map((id) => ({ id }) as unknown as Risk);
    }
    if (epis) {
      apr.epis = epis.map((id) => ({ id }) as unknown as Epi);
    }
    if (tools) {
      apr.tools = tools.map((id) => ({ id }) as unknown as Tool);
    }
    if (machines) {
      apr.machines = machines.map((id) => ({ id }) as unknown as Machine);
    }
    if (participants) {
      apr.participants = participants.map((id) => ({ id }) as unknown as User);
    }

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
    this.logger.log({
      event: 'apr_updated',
      aprId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async remove(id: string): Promise<void> {
    const apr = await this.findOne(id);
    await this.aprsRepository.remove(apr);
    this.logger.log({
      event: 'apr_removed',
      aprId: apr.id,
      companyId: apr.company_id,
    });
  }

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

    if (tenantId) {
      query.andWhere('apr.company_id = :tenantId', { tenantId });
    }
    if (filters.companyId) {
      query.andWhere('apr.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    const results = await query.getMany();

    return results
      .filter((apr) => {
        if (!apr.created_at) return false;
        const date = new Date(apr.created_at);
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

    if (tenantId) {
      qb.andWhere('apr.company_id = :tenantId', { tenantId });
    }
    if (siteId) {
      qb.andWhere('apr.site_id = :siteId', { siteId });
    }

    const raw = await qb.getRawMany();
    const matrix = raw.map((r) => ({
      categoria: r.categoria as string,
      prob: Number(r.prob),
      sev: Number(r.sev),
      count: Number(r.count),
    }));

    return { matrix };
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
