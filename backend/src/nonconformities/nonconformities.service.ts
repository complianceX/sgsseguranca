import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { NonConformity } from './entities/nonconformity.entity';
import {
  CreateNonConformityDto,
  UpdateNonConformityDto,
} from './dto/create-nonconformity.dto';
import { TenantService } from '../common/tenant/tenant.service';
import { StorageService } from '../common/services/storage.service';
import {
  DocumentBundleService,
  WeeklyBundleFilters,
} from '../common/services/document-bundle.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { Site } from '../sites/entities/site.entity';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

export enum NcStatus {
  ABERTA = 'ABERTA',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  AGUARDANDO_VALIDACAO = 'AGUARDANDO_VALIDACAO',
  ENCERRADA = 'ENCERRADA',
}

const ALLOWED_TRANSITIONS: Record<NcStatus, NcStatus[]> = {
  [NcStatus.ABERTA]: [NcStatus.EM_ANDAMENTO],
  [NcStatus.EM_ANDAMENTO]: [NcStatus.AGUARDANDO_VALIDACAO, NcStatus.ABERTA],
  [NcStatus.AGUARDANDO_VALIDACAO]: [NcStatus.ENCERRADA, NcStatus.ABERTA],
  [NcStatus.ENCERRADA]: [NcStatus.ABERTA],
};

@Injectable()
export class NonConformitiesService {
  constructor(
    @InjectRepository(NonConformity)
    private nonConformitiesRepository: Repository<NonConformity>,
    @InjectRepository(Site)
    private sitesRepository: Repository<Site>,
    private tenantService: TenantService,
    private storageService: StorageService,
    private readonly documentBundleService: DocumentBundleService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly auditService: AuditService,
  ) {}

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException(
        'Contexto de empresa não identificado para a não conformidade.',
      );
    }
    return tenantId;
  }

  private normalizeRequiredText(value: string): string {
    return value.trim();
  }

  private normalizeOptionalText(value?: string | null): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private normalizeStringArray(values?: string[]): string[] {
    return Array.from(
      new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
    );
  }

  private canonicalizeStatus(value?: string | null): string {
    return (
      value
        ?.trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase() || ''
    );
  }

  private normalizeStatus(value?: string | null): NcStatus {
    const normalized = this.canonicalizeStatus(value);
    const statusMap: Record<string, NcStatus> = {
      ABERTA: NcStatus.ABERTA,
      EM_ANDAMENTO: NcStatus.EM_ANDAMENTO,
      EM_TRATAMENTO: NcStatus.EM_ANDAMENTO,
      AGUARDANDO_VALIDACAO: NcStatus.AGUARDANDO_VALIDACAO,
      AGUARDANDO_VALIDACAO_FINAL: NcStatus.AGUARDANDO_VALIDACAO,
      ENCERRADA: NcStatus.ENCERRADA,
      FINALIZADA: NcStatus.ENCERRADA,
      CONCLUIDA: NcStatus.ENCERRADA,
    };
    const mappedStatus = statusMap[normalized];

    if (mappedStatus) {
      return mappedStatus;
    }

    throw new BadRequestException('Status de não conformidade inválido.');
  }

  private buildCreatePayload(
    dto: CreateNonConformityDto,
    tenantId: string,
  ): Partial<NonConformity> {
    return {
      company_id: tenantId,
      codigo_nc: this.normalizeRequiredText(dto.codigo_nc),
      tipo: this.normalizeRequiredText(dto.tipo),
      data_identificacao: dto.data_identificacao as unknown as Date,
      site_id: dto.site_id,
      local_setor_area: this.normalizeRequiredText(dto.local_setor_area),
      atividade_envolvida: this.normalizeRequiredText(dto.atividade_envolvida),
      responsavel_area: this.normalizeRequiredText(dto.responsavel_area),
      auditor_responsavel: this.normalizeRequiredText(dto.auditor_responsavel),
      classificacao: this.normalizeStringArray(dto.classificacao),
      descricao: this.normalizeRequiredText(dto.descricao),
      evidencia_observada: this.normalizeRequiredText(dto.evidencia_observada),
      condicao_insegura: this.normalizeRequiredText(dto.condicao_insegura),
      ato_inseguro: this.normalizeOptionalText(dto.ato_inseguro),
      requisito_nr: this.normalizeRequiredText(dto.requisito_nr),
      requisito_item: this.normalizeRequiredText(dto.requisito_item),
      requisito_procedimento: this.normalizeOptionalText(
        dto.requisito_procedimento,
      ),
      requisito_politica: this.normalizeOptionalText(dto.requisito_politica),
      risco_perigo: this.normalizeRequiredText(dto.risco_perigo),
      risco_associado: this.normalizeRequiredText(dto.risco_associado),
      risco_consequencias: this.normalizeStringArray(dto.risco_consequencias),
      risco_nivel: this.normalizeRequiredText(dto.risco_nivel),
      causa: this.normalizeStringArray(dto.causa),
      causa_outro: this.normalizeOptionalText(dto.causa_outro),
      acao_imediata_descricao: this.normalizeOptionalText(
        dto.acao_imediata_descricao,
      ),
      acao_imediata_data: dto.acao_imediata_data as unknown as Date,
      acao_imediata_responsavel: this.normalizeOptionalText(
        dto.acao_imediata_responsavel,
      ),
      acao_imediata_status: this.normalizeOptionalText(
        dto.acao_imediata_status,
      ),
      acao_definitiva_descricao: this.normalizeOptionalText(
        dto.acao_definitiva_descricao,
      ),
      acao_definitiva_prazo: dto.acao_definitiva_prazo as unknown as Date,
      acao_definitiva_responsavel: this.normalizeOptionalText(
        dto.acao_definitiva_responsavel,
      ),
      acao_definitiva_recursos: this.normalizeOptionalText(
        dto.acao_definitiva_recursos,
      ),
      acao_definitiva_data_prevista:
        dto.acao_definitiva_data_prevista as unknown as Date,
      acao_preventiva_medidas: this.normalizeOptionalText(
        dto.acao_preventiva_medidas,
      ),
      acao_preventiva_treinamento: this.normalizeOptionalText(
        dto.acao_preventiva_treinamento,
      ),
      acao_preventiva_revisao_procedimento: this.normalizeOptionalText(
        dto.acao_preventiva_revisao_procedimento,
      ),
      acao_preventiva_melhoria_processo: this.normalizeOptionalText(
        dto.acao_preventiva_melhoria_processo,
      ),
      acao_preventiva_epc_epi: this.normalizeOptionalText(
        dto.acao_preventiva_epc_epi,
      ),
      verificacao_resultado: this.normalizeOptionalText(
        dto.verificacao_resultado,
      ),
      verificacao_evidencias: this.normalizeOptionalText(
        dto.verificacao_evidencias,
      ),
      verificacao_data: dto.verificacao_data as unknown as Date,
      verificacao_responsavel: this.normalizeOptionalText(
        dto.verificacao_responsavel,
      ),
      status: this.normalizeStatus(dto.status),
      observacoes_gerais: this.normalizeOptionalText(dto.observacoes_gerais),
      anexos: this.normalizeStringArray(dto.anexos),
      assinatura_responsavel_area: this.normalizeOptionalText(
        dto.assinatura_responsavel_area,
      ),
      assinatura_tecnico_auditor: this.normalizeOptionalText(
        dto.assinatura_tecnico_auditor,
      ),
      assinatura_gestao: this.normalizeOptionalText(dto.assinatura_gestao),
    };
  }

  private buildUpdatePayload(
    dto: UpdateNonConformityDto,
  ): Partial<NonConformity> {
    const payload: Partial<NonConformity> = {};

    if (dto.codigo_nc !== undefined)
      payload.codigo_nc = this.normalizeRequiredText(dto.codigo_nc);
    if (dto.tipo !== undefined)
      payload.tipo = this.normalizeRequiredText(dto.tipo);
    if (dto.data_identificacao !== undefined) {
      payload.data_identificacao = dto.data_identificacao as unknown as Date;
    }
    if (dto.site_id !== undefined) payload.site_id = dto.site_id;
    if (dto.local_setor_area !== undefined) {
      payload.local_setor_area = this.normalizeRequiredText(
        dto.local_setor_area,
      );
    }
    if (dto.atividade_envolvida !== undefined) {
      payload.atividade_envolvida = this.normalizeRequiredText(
        dto.atividade_envolvida,
      );
    }
    if (dto.responsavel_area !== undefined) {
      payload.responsavel_area = this.normalizeRequiredText(
        dto.responsavel_area,
      );
    }
    if (dto.auditor_responsavel !== undefined) {
      payload.auditor_responsavel = this.normalizeRequiredText(
        dto.auditor_responsavel,
      );
    }
    if (dto.classificacao !== undefined) {
      payload.classificacao = this.normalizeStringArray(dto.classificacao);
    }
    if (dto.descricao !== undefined)
      payload.descricao = this.normalizeRequiredText(dto.descricao);
    if (dto.evidencia_observada !== undefined) {
      payload.evidencia_observada = this.normalizeRequiredText(
        dto.evidencia_observada,
      );
    }
    if (dto.condicao_insegura !== undefined) {
      payload.condicao_insegura = this.normalizeRequiredText(
        dto.condicao_insegura,
      );
    }
    if (dto.ato_inseguro !== undefined) {
      payload.ato_inseguro = this.normalizeOptionalText(dto.ato_inseguro);
    }
    if (dto.requisito_nr !== undefined) {
      payload.requisito_nr = this.normalizeRequiredText(dto.requisito_nr);
    }
    if (dto.requisito_item !== undefined) {
      payload.requisito_item = this.normalizeRequiredText(dto.requisito_item);
    }
    if (dto.requisito_procedimento !== undefined) {
      payload.requisito_procedimento = this.normalizeOptionalText(
        dto.requisito_procedimento,
      );
    }
    if (dto.requisito_politica !== undefined) {
      payload.requisito_politica = this.normalizeOptionalText(
        dto.requisito_politica,
      );
    }
    if (dto.risco_perigo !== undefined) {
      payload.risco_perigo = this.normalizeRequiredText(dto.risco_perigo);
    }
    if (dto.risco_associado !== undefined) {
      payload.risco_associado = this.normalizeRequiredText(dto.risco_associado);
    }
    if (dto.risco_consequencias !== undefined) {
      payload.risco_consequencias = this.normalizeStringArray(
        dto.risco_consequencias,
      );
    }
    if (dto.risco_nivel !== undefined) {
      payload.risco_nivel = this.normalizeRequiredText(dto.risco_nivel);
    }
    if (dto.causa !== undefined) {
      payload.causa = this.normalizeStringArray(dto.causa);
    }
    if (dto.causa_outro !== undefined) {
      payload.causa_outro = this.normalizeOptionalText(dto.causa_outro);
    }
    if (dto.acao_imediata_descricao !== undefined) {
      payload.acao_imediata_descricao = this.normalizeOptionalText(
        dto.acao_imediata_descricao,
      );
    }
    if (dto.acao_imediata_data !== undefined) {
      payload.acao_imediata_data = dto.acao_imediata_data as unknown as Date;
    }
    if (dto.acao_imediata_responsavel !== undefined) {
      payload.acao_imediata_responsavel = this.normalizeOptionalText(
        dto.acao_imediata_responsavel,
      );
    }
    if (dto.acao_imediata_status !== undefined) {
      payload.acao_imediata_status = this.normalizeOptionalText(
        dto.acao_imediata_status,
      );
    }
    if (dto.acao_definitiva_descricao !== undefined) {
      payload.acao_definitiva_descricao = this.normalizeOptionalText(
        dto.acao_definitiva_descricao,
      );
    }
    if (dto.acao_definitiva_prazo !== undefined) {
      payload.acao_definitiva_prazo =
        dto.acao_definitiva_prazo as unknown as Date;
    }
    if (dto.acao_definitiva_responsavel !== undefined) {
      payload.acao_definitiva_responsavel = this.normalizeOptionalText(
        dto.acao_definitiva_responsavel,
      );
    }
    if (dto.acao_definitiva_recursos !== undefined) {
      payload.acao_definitiva_recursos = this.normalizeOptionalText(
        dto.acao_definitiva_recursos,
      );
    }
    if (dto.acao_definitiva_data_prevista !== undefined) {
      payload.acao_definitiva_data_prevista =
        dto.acao_definitiva_data_prevista as unknown as Date;
    }
    if (dto.acao_preventiva_medidas !== undefined) {
      payload.acao_preventiva_medidas = this.normalizeOptionalText(
        dto.acao_preventiva_medidas,
      );
    }
    if (dto.acao_preventiva_treinamento !== undefined) {
      payload.acao_preventiva_treinamento = this.normalizeOptionalText(
        dto.acao_preventiva_treinamento,
      );
    }
    if (dto.acao_preventiva_revisao_procedimento !== undefined) {
      payload.acao_preventiva_revisao_procedimento = this.normalizeOptionalText(
        dto.acao_preventiva_revisao_procedimento,
      );
    }
    if (dto.acao_preventiva_melhoria_processo !== undefined) {
      payload.acao_preventiva_melhoria_processo = this.normalizeOptionalText(
        dto.acao_preventiva_melhoria_processo,
      );
    }
    if (dto.acao_preventiva_epc_epi !== undefined) {
      payload.acao_preventiva_epc_epi = this.normalizeOptionalText(
        dto.acao_preventiva_epc_epi,
      );
    }
    if (dto.verificacao_resultado !== undefined) {
      payload.verificacao_resultado = this.normalizeOptionalText(
        dto.verificacao_resultado,
      );
    }
    if (dto.verificacao_evidencias !== undefined) {
      payload.verificacao_evidencias = this.normalizeOptionalText(
        dto.verificacao_evidencias,
      );
    }
    if (dto.verificacao_data !== undefined) {
      payload.verificacao_data = dto.verificacao_data as unknown as Date;
    }
    if (dto.verificacao_responsavel !== undefined) {
      payload.verificacao_responsavel = this.normalizeOptionalText(
        dto.verificacao_responsavel,
      );
    }
    if (dto.status !== undefined)
      payload.status = this.normalizeStatus(dto.status);
    if (dto.observacoes_gerais !== undefined) {
      payload.observacoes_gerais = this.normalizeOptionalText(
        dto.observacoes_gerais,
      );
    }
    if (dto.anexos !== undefined) {
      payload.anexos = this.normalizeStringArray(dto.anexos);
    }
    if (dto.assinatura_responsavel_area !== undefined) {
      payload.assinatura_responsavel_area = this.normalizeOptionalText(
        dto.assinatura_responsavel_area,
      );
    }
    if (dto.assinatura_tecnico_auditor !== undefined) {
      payload.assinatura_tecnico_auditor = this.normalizeOptionalText(
        dto.assinatura_tecnico_auditor,
      );
    }
    if (dto.assinatura_gestao !== undefined) {
      payload.assinatura_gestao = this.normalizeOptionalText(
        dto.assinatura_gestao,
      );
    }

    return payload;
  }

  private async validateLinkedRecords(
    payload: Partial<NonConformity>,
    tenantId: string,
  ): Promise<void> {
    if (!payload.site_id) {
      return;
    }

    const site = await this.sitesRepository.findOne({
      where: {
        id: payload.site_id,
        company_id: tenantId,
        status: true,
      },
    });

    if (!site) {
      throw new BadRequestException(
        'O site informado não está ativo ou não pertence à empresa selecionada.',
      );
    }
  }

  async create(createNonConformityDto: CreateNonConformityDto) {
    const tenantId = this.getTenantIdOrThrow();
    const payload = this.buildCreatePayload(createNonConformityDto, tenantId);
    await this.validateLinkedRecords(payload, tenantId);

    const nonConformity = this.nonConformitiesRepository.create(payload);
    const saved = await this.nonConformitiesRepository.save(nonConformity);
    await this.logAudit(AuditAction.CREATE, saved.id, null, saved);
    return saved;
  }

  async findAll() {
    const tenantId = this.tenantService.getTenantId();
    return this.nonConformitiesRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      relations: ['site'],
      order: { created_at: 'DESC' },
    });
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<OffsetPage<NonConformity>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.nonConformitiesRepository
      .createQueryBuilder('nc')
      .leftJoinAndSelect('nc.site', 'site')
      .orderBy('nc.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (tenantId) {
      query.where('nc.company_id = :tenantId', { tenantId });
    }

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      const condition = `(
        LOWER(nc.codigo_nc) LIKE :search
        OR LOWER(nc.local_setor_area) LIKE :search
        OR LOWER(nc.tipo) LIKE :search
        OR LOWER(nc.status) LIKE :search
      )`;
      if (tenantId) {
        query.andWhere(condition, { search });
      } else {
        query.where(condition, { search });
      }
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async countPendingActionItems(companyId?: string): Promise<number> {
    const tenantId = companyId || this.tenantService.getTenantId();
    const query = this.nonConformitiesRepository
      .createQueryBuilder('nc')
      .select(
        `
          COALESCE(
            SUM(
              CASE
                WHEN nc.acao_imediata_status IS NOT NULL
                 AND LOWER(nc.acao_imediata_status) NOT LIKE '%conclu%'
                 AND LOWER(nc.acao_imediata_status) NOT LIKE '%encerr%'
                THEN 1
                ELSE 0
              END
              +
              CASE
                WHEN nc.status IS NOT NULL
                 AND LOWER(nc.status) NOT LIKE '%conclu%'
                 AND LOWER(nc.status) NOT LIKE '%encerr%'
                THEN 1
                ELSE 0
              END
            ),
            0
          )
        `,
        'total',
      );

    if (tenantId) {
      query.where('nc.company_id = :tenantId', { tenantId });
    }

    const row = await query.getRawOne<{ total?: string | number }>();
    return Number(row?.total ?? 0);
  }

  async summarizeByStatus(status?: string) {
    const tenantId = this.tenantService.getTenantId();
    const query = this.nonConformitiesRepository
      .createQueryBuilder('nc')
      .select('UPPER(COALESCE(nc.status, :emptyStatus))', 'status')
      .addSelect('COUNT(*)', 'total')
      .setParameter('emptyStatus', 'SEM_STATUS')
      .groupBy('UPPER(COALESCE(nc.status, :emptyStatus))');

    if (tenantId) {
      query.where('nc.company_id = :tenantId', { tenantId });
    }

    const rows = await query.getRawMany<{ status: string; total: string }>();
    const byStatus = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = Number(row.total);
      return acc;
    }, {});

    const total = Object.values(byStatus).reduce(
      (sum, value) => sum + value,
      0,
    );
    const normalizedStatus = status?.trim().toUpperCase();

    return {
      total,
      filtered: normalizedStatus ? (byStatus[normalizedStatus] ?? 0) : total,
      byStatus,
      filterStatus: normalizedStatus ?? null,
    };
  }

  async findOne(id: string) {
    const tenantId = this.tenantService.getTenantId();
    const nonConformity = await this.nonConformitiesRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['site', 'company'],
    });

    if (!nonConformity) {
      throw new NotFoundException(
        `Não conformidade com ID ${id} não encontrada`,
      );
    }

    return nonConformity;
  }

  async update(id: string, updateNonConformityDto: UpdateNonConformityDto) {
    const nonConformity = await this.findOne(id);
    const before = { ...nonConformity };
    const payload = this.buildUpdatePayload(updateNonConformityDto);
    await this.validateLinkedRecords(payload, nonConformity.company_id);
    Object.assign(nonConformity, payload);
    const saved = await this.nonConformitiesRepository.save(nonConformity);
    await this.logAudit(AuditAction.UPDATE, saved.id, before, saved);
    return saved;
  }

  async remove(id: string) {
    const nonConformity = await this.findOne(id);
    const before = { ...nonConformity };
    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: nonConformity.company_id,
      module: 'nonconformity',
      entityId: nonConformity.id,
      removeEntityState: async (manager) => {
        await manager.getRepository(NonConformity).remove(nonConformity);
      },
    });
    await this.logAudit(AuditAction.DELETE, id, before, null);
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    const tenantId = this.tenantService.getTenantId();
    const query = this.nonConformitiesRepository
      .createQueryBuilder('nc')
      .where('nc.pdf_file_key IS NOT NULL');

    if (tenantId) {
      query.andWhere('nc.company_id = :tenantId', { tenantId });
    }

    if (filters.companyId) {
      query.andWhere('nc.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    const results = await query.getMany();

    // Filtragem por ano e semana (se fornecido)
    return results
      .filter((nc) => {
        if (!nc.created_at) return false;
        const date = new Date(nc.created_at);
        if (filters.year && date.getFullYear() !== filters.year) return false;
        if (filters.week) {
          const ncWeek = parseInt(format(date, 'I')); // ISO week
          if (ncWeek !== filters.week) return false;
        }
        return true;
      })
      .map((nc) => ({
        entityId: nc.id,
        title: nc.codigo_nc || nc.tipo || 'NC',
        date: nc.data_identificacao || nc.created_at,
        id: nc.id,
        codigo_nc: nc.codigo_nc,
        data_identificacao: nc.data_identificacao,
        companyId: nc.company_id,
        fileKey: nc.pdf_file_key,
        folderPath: nc.pdf_folder_path,
        originalName: nc.pdf_original_name,
      }));
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    const files = await this.listStoredFiles(filters);
    return this.documentBundleService.buildWeeklyPdfBundle(
      'Nao Conformidade',
      filters,
      files.map((file) => ({
        fileKey: file.fileKey,
        title: file.title,
        originalName: file.originalName,
        date: file.date,
      })),
    );
  }

  async getPdfAccess(id: string) {
    const nc = await this.findOne(id);
    if (!nc.pdf_file_key) {
      throw new NotFoundException('Arquivo PDF não encontrado para esta NC');
    }

    const url = await this.storageService.getPresignedDownloadUrl(
      nc.pdf_file_key,
    );
    return {
      entityId: nc.id,
      fileKey: nc.pdf_file_key,
      folderPath: nc.pdf_folder_path,
      originalName: nc.pdf_original_name,
      url,
    };
  }

  async attachPdf(
    id: string,
    buffer: Buffer,
    originalName: string,
    mimetype: string,
  ) {
    const nc = await this.findOne(id);
    const date = new Date();
    const year = date.getFullYear();
    const week = format(date, 'I');
    const folderPath = `nonconformities/${nc.company_id}/${year}/week-${week}`;
    const fileKey = `${folderPath}/${id}.pdf`;

    await this.storageService.uploadFile(fileKey, buffer, mimetype);

    await this.documentGovernanceService.registerFinalDocument({
      companyId: nc.company_id,
      module: 'nonconformity',
      entityId: nc.id,
      title: nc.codigo_nc || nc.tipo || 'Nao Conformidade',
      documentDate: nc.data_identificacao || date,
      fileKey,
      folderPath,
      originalName,
      mimeType: mimetype,
      createdBy: RequestContext.getUserId() || undefined,
      fileBuffer: buffer,
      persistEntityMetadata: async (manager) => {
        await manager.getRepository(NonConformity).update(
          { id: nc.id },
          {
            pdf_file_key: fileKey,
            pdf_folder_path: folderPath,
            pdf_original_name: originalName,
          },
        );
      },
    });

    return this.findOne(id);
  }

  async getMonthlyAnalytics(): Promise<{ mes: string; total: number }[]> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.nonConformitiesRepository
      .createQueryBuilder('nc')
      .select("TO_CHAR(DATE_TRUNC('month', nc.created_at), 'YYYY-MM')", 'mes')
      .addSelect('COUNT(*)', 'total')
      .where("nc.created_at >= NOW() - INTERVAL '12 months'")
      .groupBy("DATE_TRUNC('month', nc.created_at)")
      .orderBy("DATE_TRUNC('month', nc.created_at)", 'ASC');

    if (tenantId) {
      qb.andWhere('nc.company_id = :tenantId', { tenantId });
    }

    const rows = await qb.getRawMany<{ mes: string; total: string }>();
    return rows.map((r) => ({ mes: r.mes, total: Number(r.total) }));
  }

  async updateStatus(id: string, newStatus: NcStatus): Promise<NonConformity> {
    const nc = await this.findOne(id);
    const before = { ...nc };
    const current = this.normalizeStatus(nc.status);
    const allowed = ALLOWED_TRANSITIONS[current] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transição de "${current}" para "${newStatus}" não permitida`,
      );
    }
    nc.status = newStatus;
    const saved = await this.nonConformitiesRepository.save(nc);
    await this.logAudit(AuditAction.UPDATE, saved.id, before, saved);
    return saved;
  }

  async count(options?: FindManyOptions<NonConformity>): Promise<number> {
    return this.nonConformitiesRepository.count(options);
  }

  async exportExcel(): Promise<Buffer> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.nonConformitiesRepository
      .createQueryBuilder('nc')
      .select([
        'nc.codigo_nc',
        'nc.tipo',
        'nc.status',
        'nc.data_identificacao',
        'nc.created_at',
      ])
      .orderBy('nc.created_at', 'DESC');
    if (tenantId) qb.where('nc.company_id = :tenantId', { tenantId });
    const ncs = await qb.getMany();

    const rows = ncs.map((n) => ({
      'Código NC': n.codigo_nc,
      Tipo: n.tipo ?? '',
      Status: n.status,
      'Data de Identificação': n.data_identificacao
        ? new Date(n.data_identificacao).toLocaleDateString('pt-BR')
        : '',
      'Criado em': new Date(n.created_at).toLocaleDateString('pt-BR'),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Não Conformidades');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  private async logAudit(
    action: AuditAction,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    const companyId = this.tenantService.getTenantId();
    if (!companyId) return;
    await this.auditService.log({
      userId: RequestContext.getUserId() || 'system',
      action,
      entity: 'NonConformity',
      entityId,
      changes: { before, after },
      ip: (RequestContext.get('ip') as string) || 'unknown',
      userAgent: (RequestContext.get('userAgent') as string) || 'unknown',
      companyId,
    });
  }
}
