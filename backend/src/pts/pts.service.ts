import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Pt } from './entities/pt.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { CreatePtDto } from './dto/create-pt.dto';
import { UpdatePtDto } from './dto/update-pt.dto';
import { User } from '../users/entities/user.entity';
import { RiskCalculationService } from '../common/services/risk-calculation.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { WorkerOperationalStatusService } from '../users/worker-operational-status.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

@Injectable()
export class PtsService {
  private readonly logger = new Logger(PtsService.name);

  constructor(
    @InjectRepository(Pt)
    private ptsRepository: Repository<Pt>,
    private tenantService: TenantService,
    private readonly riskCalculationService: RiskCalculationService,
    private readonly auditService: AuditService,
    private readonly workerOperationalStatusService: WorkerOperationalStatusService,
  ) {}

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
    this.logger.log({
      event: 'pt_updated',
      ptId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async approve(id: string, approvedByUserId: string, reason?: string): Promise<Pt> {
    const pt = await this.findOne(id);
    const before = { ...pt };
    await this.assertCanApprove(pt);
    pt.status = 'Aprovada';
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
    const before = { ...pt };
    pt.status = 'Cancelada';
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
    await this.ptsRepository.remove(pt);
  }

  async count(options?: any): Promise<number> {
    return this.ptsRepository.count(options);
  }

  async listStoredFiles(filters: {
    companyId?: string;
    year?: number;
    week?: number;
  }) {
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
        id: pt.id,
        numero: pt.numero,
        titulo: pt.titulo,
        companyId: pt.company_id,
        fileKey: pt.pdf_file_key,
        folderPath: pt.pdf_folder_path,
        originalName: pt.pdf_original_name,
      }));
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

  private async assertCanApprove(pt: Pt): Promise<void> {
    const reasons: string[] = [];

    if (pt.residual_risk === 'CRITICAL' && !pt.control_evidence) {
      reasons.push('risco residual crítico sem evidência de controle');
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
      if (status.blocked) {
        reasons.push(`${status.user.nome}: ${status.reasons.join(' ')}`.trim());
      }
    });

    if (reasons.length > 0) {
      throw new BadRequestException(`PT bloqueada: ${reasons.join(' | ')}.`);
    }
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
