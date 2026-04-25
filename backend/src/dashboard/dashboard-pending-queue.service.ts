import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Apr, AprStatus } from '../aprs/entities/apr.entity';
import { Audit } from '../audits/entities/audit.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';
import { Pt } from '../pts/entities/pt.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { Training } from '../trainings/entities/training.entity';

type InspectionActionItem = {
  acao?: string;
  responsavel?: string;
  prazo?: string;
  status?: string;
};

type AuditActionItem = {
  acao?: string;
  responsavel?: string;
  prazo?: string;
  status?: string;
};

type PendingQueuePriority = 'critical' | 'high' | 'medium';
type PendingQueueCategory = 'documents' | 'health' | 'actions';
type PendingQueueSlaStatus =
  | 'breached'
  | 'due_today'
  | 'due_soon'
  | 'on_track'
  | 'unscheduled';

type PendingQueueItem = {
  id: string;
  sourceId: string;
  module: string;
  category: PendingQueueCategory;
  title: string;
  description: string;
  priority: PendingQueuePriority;
  status: string;
  responsible: string | null;
  siteId: string | null;
  site: string | null;
  dueDate: Date | string | null;
  slaStatus: PendingQueueSlaStatus;
  daysToDue: number | null;
  overdueByDays: number | null;
  breached: boolean;
  href: string;
};

@Injectable()
export class DashboardPendingQueueService {
  private readonly logger = new Logger(DashboardPendingQueueService.name);

  constructor(
    @InjectRepository(Apr)
    private readonly aprsRepository: Repository<Apr>,
    @InjectRepository(Audit)
    private readonly auditsRepository: Repository<Audit>,
    @InjectRepository(Checklist)
    private readonly checklistsRepository: Repository<Checklist>,
    @InjectRepository(Inspection)
    private readonly inspectionsRepository: Repository<Inspection>,
    @InjectRepository(MedicalExam)
    private readonly medicalExamsRepository: Repository<MedicalExam>,
    @InjectRepository(NonConformity)
    private readonly nonConformitiesRepository: Repository<NonConformity>,
    @InjectRepository(Pt)
    private readonly ptsRepository: Repository<Pt>,
    @InjectRepository(Training)
    private readonly trainingsRepository: Repository<Training>,
    private readonly tenantService: TenantService,
  ) {}

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

  async getPendingQueue(input: {
    companyId: string;
    siteId?: string;
    siteScope: 'single' | 'all';
    isSuperAdmin: boolean;
  }) {
    const { companyId, siteId, siteScope, isSuperAdmin } = input;
    if (!companyId) {
      return this.createEmptyPendingQueueResponse();
    }

    const isSingleScope = !isSuperAdmin && siteScope !== 'all';
    if (isSingleScope && !siteId) {
      this.logger.warn(
        `[dashboard.pending-queue] Escopo de obra unica sem siteId; retornando fila vazia para company ${companyId}.`,
      );
      return this.createEmptyPendingQueueResponse({
        degraded: true,
        failedSources: ['site-scope'],
      });
    }

    const scopedWhere = isSingleScope
      ? { company_id: companyId, site_id: siteId }
      : { company_id: companyId };

    const now = new Date();
    // warningLimit e calculado como expressao SQL para evitar desvio de timezone
    // entre o runtime Node e o banco PostgreSQL. A constante abaixo e usada
    // apenas para filtros JS (fallback) — as queries usam NOW() + INTERVAL.
    const WARNING_INTERVAL_DAYS = 14;
    const warningLimit = new Date(now);
    warningLimit.setDate(now.getDate() + WARNING_INTERVAL_DAYS);

    const [
      pendingAprsChunk,
      pendingPtsChunk,
      pendingChecklistsChunk,
      openNonConformitiesChunk,
      trainingAttentionChunk,
      medicalExamAttentionChunk,
      inspectionActionsChunk,
      auditActionsChunk,
    ] = await Promise.all([
      this.loadPendingQueueChunk(
        'aprs',
        () =>
          this.aprsRepository.find({
            where: {
              ...scopedWhere,
              status: AprStatus.PENDENTE,
            },
            relations: { site: true, elaborador: true },
            select: {
              id: true,
              titulo: true,
              status: true,
              data_inicio: true,
              updated_at: true,
              residual_risk: true,
              site: {
                id: true,
                nome: true,
              },
              elaborador: {
                nome: true,
              },
            },
            order: { updated_at: 'DESC' },
            take: 20,
          }),
        [] as Apr[],
      ),
      this.loadPendingQueueChunk(
        'pts',
        () =>
          this.ptsRepository.find({
            where: {
              ...scopedWhere,
              status: In(['Pendente', 'Expirada']),
            },
            relations: { site: true, responsavel: true },
            select: {
              id: true,
              titulo: true,
              status: true,
              data_hora_fim: true,
              residual_risk: true,
              site: {
                id: true,
                nome: true,
              },
              responsavel: {
                nome: true,
              },
            },
            order: { data_hora_fim: 'ASC' },
            take: 20,
          }),
        [] as Pt[],
      ),
      this.loadPendingQueueChunk(
        'checklists',
        () =>
          this.checklistsRepository.find({
            where: {
              ...scopedWhere,
              status: 'Pendente',
              is_modelo: false,
            },
            relations: { site: true, inspetor: true },
            select: {
              id: true,
              titulo: true,
              status: true,
              data: true,
              site: {
                id: true,
                nome: true,
              },
              inspetor: {
                nome: true,
              },
            },
            order: { data: 'ASC' },
            take: 20,
          }),
        [] as Checklist[],
      ),
      this.loadPendingQueueChunk(
        'nonconformities',
        () =>
          this.nonConformitiesRepository
            .createQueryBuilder('nc')
            .leftJoinAndSelect('nc.site', 'site')
            .select([
              'nc.id',
              'nc.codigo_nc',
              'nc.local_setor_area',
              'nc.descricao',
              'nc.risco_nivel',
              'nc.status',
              'nc.updated_at',
              'nc.acao_definitiva_prazo',
              'nc.acao_definitiva_data_prevista',
              'nc.acao_imediata_data',
              'nc.acao_definitiva_responsavel',
              'nc.acao_imediata_responsavel',
              'nc.responsavel_area',
              'site.id',
              'site.nome',
            ])
            .where('nc.company_id = :companyId', { companyId })
            .andWhere(
              isSingleScope ? 'nc.site_id = :siteId' : '1=1',
              isSingleScope ? { siteId } : {},
            )
            .andWhere(
              "LOWER(COALESCE(nc.status, '')) NOT IN (:...closedStatuses)",
              {
                closedStatuses: [
                  'encerrada',
                  'concluída',
                  'concluida',
                  'fechada',
                ],
              },
            )
            .orderBy('nc.updated_at', 'DESC')
            .take(20)
            .getMany(),
        [] as NonConformity[],
      ),
      this.loadPendingQueueChunk(
        'trainings',
        () => {
          const qb = this.trainingsRepository
            .createQueryBuilder('training')
            .leftJoinAndSelect('training.user', 'user')
            .select([
              'training.id',
              'training.nome',
              'training.data_vencimento',
              'training.bloqueia_operacao_quando_vencido',
              'user.nome',
            ])
            .where('training.company_id = :companyId', { companyId })
            // Usa expressao SQL nativa para evitar desvio de timezone entre
            // o runtime Node e o banco PostgreSQL.
            .andWhere(
              `training.data_vencimento <= (NOW() AT TIME ZONE 'UTC' + INTERVAL '${WARNING_INTERVAL_DAYS} days')`,
            );

          if (isSingleScope) {
            qb.andWhere('user.company_id = :companyId', { companyId }).andWhere(
              'user.site_id = :siteId',
              { siteId },
            );
          }

          return qb
            .orderBy('training.data_vencimento', 'ASC')
            .take(20)
            .getMany();
        },
        [] as Training[],
      ),
      this.loadPendingQueueChunk(
        'medical-exams',
        () => {
          const qb = this.medicalExamsRepository
            .createQueryBuilder('medicalExam')
            .leftJoinAndSelect('medicalExam.user', 'user')
            .select([
              'medicalExam.id',
              'medicalExam.tipo_exame',
              'medicalExam.resultado',
              'medicalExam.data_vencimento',
              'user.nome',
            ])
            .where('medicalExam.company_id = :companyId', { companyId })
            // Mesmo padrao: expressao SQL nativa para warningLimit.
            .andWhere(
              `(medicalExam.resultado = :inapto OR medicalExam.data_vencimento <= (NOW() AT TIME ZONE 'UTC' + INTERVAL '${WARNING_INTERVAL_DAYS} days'))`,
              { inapto: 'inapto' },
            );

          if (isSingleScope) {
            qb.andWhere('user.company_id = :companyId', { companyId }).andWhere(
              'user.site_id = :siteId',
              { siteId },
            );
          }

          return qb
            .orderBy('medicalExam.data_vencimento', 'ASC')
            .take(20)
            .getMany();
        },
        [] as MedicalExam[],
      ),
      this.loadPendingQueueChunk(
        'inspections',
        () => {
          const qb = this.inspectionsRepository
            .createQueryBuilder('inspection')
            .leftJoinAndSelect('inspection.site', 'site')
            .leftJoinAndSelect('inspection.responsavel', 'responsavel')
            .select([
              'inspection.id',
              'inspection.setor_area',
              'inspection.updated_at',
              'inspection.plano_acao',
              'site.id',
              'site.nome',
              'responsavel.nome',
            ])
            .where('inspection.company_id = :companyId', { companyId })
            // Filtra no banco: apenas inspecoes que tenham ao menos uma acao
            // cujo status nao seja encerrado (evita carregar 100% das inspecoes
            // para filtrar em memoria).
            .andWhere(
              `EXISTS (
                SELECT 1
                FROM jsonb_array_elements(
                  COALESCE(inspection.plano_acao, '[]'::jsonb)
                ) AS action
                WHERE LOWER(COALESCE(action->>'status', '')) NOT IN (
                  'concluída', 'concluida', 'encerrada', 'fechada'
                )
              )`,
            );

          if (isSingleScope) {
            qb.andWhere('inspection.site_id = :siteId', { siteId });
          }

          return qb.orderBy('inspection.updated_at', 'DESC').take(20).getMany();
        },
        [] as Inspection[],
      ),
      this.loadPendingQueueChunk(
        'audits',
        () => {
          const qb = this.auditsRepository
            .createQueryBuilder('audit')
            .leftJoinAndSelect('audit.site', 'site')
            .leftJoinAndSelect('audit.auditor', 'auditor')
            .select([
              'audit.id',
              'audit.titulo',
              'audit.updated_at',
              'audit.plano_acao',
              'site.id',
              'site.nome',
              'auditor.nome',
            ])
            .where('audit.company_id = :companyId', { companyId })
            // Mesmo filtro: apenas auditorias com acoes pendentes no banco.
            .andWhere(
              `EXISTS (
                SELECT 1
                FROM jsonb_array_elements(
                  COALESCE(audit.plano_acao, '[]'::jsonb)
                ) AS action
                WHERE LOWER(COALESCE(action->>'status', '')) NOT IN (
                  'concluída', 'concluida', 'encerrada', 'fechada'
                )
              )`,
            );

          if (isSingleScope) {
            qb.andWhere('audit.site_id = :siteId', { siteId });
          }

          return qb.orderBy('audit.updated_at', 'DESC').take(20).getMany();
        },
        [] as Audit[],
      ),
    ]);

    const failedSources = [
      pendingAprsChunk,
      pendingPtsChunk,
      pendingChecklistsChunk,
      openNonConformitiesChunk,
      trainingAttentionChunk,
      medicalExamAttentionChunk,
      inspectionActionsChunk,
      auditActionsChunk,
    ]
      .filter((chunk) => chunk.failed)
      .map((chunk) => chunk.source);

    const sortedQueueItems: PendingQueueItem[] = [
      ...pendingAprsChunk.data.map((item) => {
        const dueDate = item.data_inicio;
        return {
          id: `apr-${item.id}`,
          sourceId: item.id,
          module: 'APR',
          category: 'documents' as const,
          title: item.titulo,
          description: `APR aguardando fechamento ou aprovação${item.site?.nome ? ` em ${item.site.nome}` : ''}.`,
          priority: this.resolveDocumentPriority(
            item.residual_risk,
            dueDate,
            now,
          ),
          status: item.status,
          responsible: item.elaborador?.nome || null,
          siteId: item.site?.id || null,
          site: item.site?.nome || null,
          dueDate,
          ...this.buildSlaContext(dueDate, now),
          href: `/dashboard/aprs/edit/${item.id}`,
        };
      }),
      ...pendingPtsChunk.data.map((item) => {
        const dueDate = item.data_hora_fim;
        return {
          id: `pt-${item.id}`,
          sourceId: item.id,
          module: 'PT',
          category: 'documents' as const,
          title: item.titulo,
          description: `Permissão de trabalho aguardando liberação${item.site?.nome ? ` em ${item.site.nome}` : ''}.`,
          priority: this.resolvePtPriority(
            item.status,
            item.residual_risk,
            dueDate,
            now,
          ),
          status: item.status,
          responsible: item.responsavel?.nome || null,
          siteId: item.site?.id || null,
          site: item.site?.nome || null,
          dueDate,
          ...this.buildSlaContext(dueDate, now),
          href: `/dashboard/pts/edit/${item.id}`,
        };
      }),
      ...pendingChecklistsChunk.data.map((item) => {
        const dueDate = item.data;
        return {
          id: `checklist-${item.id}`,
          sourceId: item.id,
          module: 'Checklist',
          category: 'documents' as const,
          title: item.titulo,
          description: `Checklist pendente de conclusão${item.site?.nome ? ` em ${item.site.nome}` : ''}.`,
          priority: this.resolveChecklistPriority(dueDate, now),
          status: item.status,
          responsible: item.inspetor?.nome || null,
          siteId: item.site?.id || null,
          site: item.site?.nome || null,
          dueDate,
          ...this.buildSlaContext(dueDate, now),
          href: `/dashboard/checklists/edit/${item.id}`,
        };
      }),
      ...openNonConformitiesChunk.data.map((item) => {
        const dueDate =
          item.acao_definitiva_prazo ||
          item.acao_definitiva_data_prevista ||
          item.acao_imediata_data ||
          null;

        return {
          id: `nc-${item.id}`,
          sourceId: item.id,
          module: 'NC',
          category: 'documents' as const,
          title: item.codigo_nc,
          description: item.local_setor_area || item.descricao,
          priority: this.resolveNonConformityPriority(
            item.risco_nivel,
            dueDate,
            now,
          ),
          status: item.status,
          responsible:
            item.acao_definitiva_responsavel ||
            item.acao_imediata_responsavel ||
            item.responsavel_area ||
            null,
          siteId: item.site?.id || null,
          site: item.site?.nome || null,
          dueDate,
          ...this.buildSlaContext(dueDate, now),
          href: `/dashboard/nonconformities/edit/${item.id}`,
        };
      }),
      ...trainingAttentionChunk.data.map((item) => {
        const dueDate = item.data_vencimento;
        return {
          id: `training-${item.id}`,
          sourceId: item.id,
          module: 'Treinamento',
          category: 'health' as const,
          title: item.nome,
          description: `Treinamento de ${item.user?.nome || 'colaborador'} com vencimento monitorado.`,
          priority: this.resolveTrainingPriority(
            dueDate,
            item.bloqueia_operacao_quando_vencido,
            now,
          ),
          status: new Date(dueDate) < now ? 'Vencido' : 'Vencendo',
          responsible: item.user?.nome || null,
          siteId: null,
          site: null,
          dueDate,
          ...this.buildSlaContext(dueDate, now),
          href: `/dashboard/trainings/edit/${item.id}`,
        };
      }),
      ...medicalExamAttentionChunk.data.map((item) => {
        const dueDate = item.data_vencimento;
        return {
          id: `medical-${item.id}`,
          sourceId: item.id,
          module: 'ASO',
          category: 'health' as const,
          title: `${item.tipo_exame} - ${item.user?.nome || 'colaborador'}`,
          description:
            item.resultado === 'inapto'
              ? 'Exame ocupacional com resultado inapto exige atuação imediata.'
              : 'Exame ocupacional em vencimento próximo ou já vencido.',
          priority: this.resolveMedicalExamPriority(
            item.resultado,
            dueDate,
            now,
          ),
          status: item.resultado,
          responsible: item.user?.nome || null,
          siteId: null,
          site: null,
          dueDate,
          ...this.buildSlaContext(dueDate, now),
          href: '/dashboard/medical-exams',
        };
      }),
      ...inspectionActionsChunk.data.flatMap((inspection) =>
        (inspection.plano_acao || [])
          .filter((action: InspectionActionItem) =>
            this.isPendingActionStatus(action.status),
          )
          .map((action: InspectionActionItem, index) => ({
            id: `inspection-action-${inspection.id}-${index}`,
            sourceId: inspection.id,
            module: 'Ação',
            category: 'actions' as const,
            title: inspection.setor_area,
            description: action.acao || 'Ação corretiva pendente de inspeção.',
            priority: this.resolveActionPriority(action.prazo, now),
            status: action.status || 'Pendente',
            responsible:
              action.responsavel || inspection.responsavel?.nome || null,
            siteId: inspection.site?.id || null,
            site: inspection.site?.nome || null,
            dueDate: action.prazo || null,
            ...this.buildSlaContext(action.prazo || null, now),
            href: `/dashboard/inspections/edit/${inspection.id}`,
          })),
      ),
      ...auditActionsChunk.data.flatMap((audit) =>
        (audit.plano_acao || [])
          .filter((action: AuditActionItem) =>
            this.isPendingActionStatus(action.status),
          )
          .map((action: AuditActionItem, index) => ({
            id: `audit-action-${audit.id}-${index}`,
            sourceId: audit.id,
            module: 'Ação',
            category: 'actions' as const,
            title: audit.titulo,
            description: action.acao || 'Ação corretiva pendente de auditoria.',
            priority: this.resolveActionPriority(action.prazo, now),
            status: action.status || 'Pendente',
            responsible: action.responsavel || audit.auditor?.nome || null,
            siteId: audit.site?.id || null,
            site: audit.site?.nome || null,
            dueDate: action.prazo || null,
            ...this.buildSlaContext(action.prazo || null, now),
            href: `/dashboard/audits/edit/${audit.id}`,
          })),
      ),
    ].sort((first, second) =>
      this.comparePendingQueueItems(first, second, now),
    );

    const PAGE_SIZE = 40;
    const queueItems = sortedQueueItems.slice(0, PAGE_SIZE);

    // summary reflete apenas os itens efetivamente retornados em `items`,
    // garantindo consistencia entre contadores e lista exibida.
    // `totalFound` expoe o total real encontrado para que o frontend possa
    // indicar ao usuario que existem mais itens alem dos exibidos.
    return {
      degraded: failedSources.length > 0,
      failedSources,
      summary: {
        total: queueItems.length,
        totalFound: sortedQueueItems.length,
        hasMore: sortedQueueItems.length > PAGE_SIZE,
        critical: queueItems.filter((item) => item.priority === 'critical')
          .length,
        high: queueItems.filter((item) => item.priority === 'high').length,
        medium: queueItems.filter((item) => item.priority === 'medium').length,
        documents: queueItems.filter((item) => item.category === 'documents')
          .length,
        health: queueItems.filter((item) => item.category === 'health').length,
        actions: queueItems.filter((item) => item.category === 'actions')
          .length,
        slaBreached: queueItems.filter((item) => item.breached).length,
        slaDueToday: queueItems.filter((item) => item.slaStatus === 'due_today')
          .length,
        slaDueSoon: queueItems.filter((item) => item.slaStatus === 'due_soon')
          .length,
      },
      items: queueItems,
    };
  }

  private createEmptyPendingQueueResponse(input?: {
    degraded?: boolean;
    failedSources?: string[];
  }) {
    return {
      degraded: input?.degraded ?? false,
      failedSources: input?.failedSources ?? ([] as string[]),
      summary: {
        total: 0,
        totalFound: 0,
        hasMore: false,
        critical: 0,
        high: 0,
        medium: 0,
        documents: 0,
        health: 0,
        actions: 0,
        slaBreached: 0,
        slaDueToday: 0,
        slaDueSoon: 0,
      },
      items: [] as PendingQueueItem[],
    };
  }

  private async loadPendingQueueChunk<T>(
    label: string,
    loader: () => Promise<T>,
    fallback: T,
  ): Promise<{ data: T; failed: boolean; source: string }> {
    try {
      return { data: await loader(), failed: false, source: label };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[dashboard.pending-queue] Falha ao carregar ${label}: ${message}`,
      );
      return { data: fallback, failed: true, source: label };
    }
  }

  private resolveDocumentPriority(
    residualRisk: string | null | undefined,
    dueDate: Date | null | undefined,
    now: Date,
  ): PendingQueuePriority {
    const risk = (residualRisk || '').toLowerCase();

    if (risk.includes('critical') || risk.includes('crit')) {
      return 'critical';
    }

    if (risk.includes('high')) {
      return 'high';
    }

    if (dueDate && new Date(dueDate) < now) {
      return 'high';
    }

    return 'medium';
  }

  private resolvePtPriority(
    status: string | null | undefined,
    residualRisk: string | null | undefined,
    dueDate: Date | null | undefined,
    now: Date,
  ): PendingQueuePriority {
    const normalizedStatus = (status || '').toLowerCase();
    const risk = (residualRisk || '').toLowerCase();

    if (
      normalizedStatus.includes('expir') ||
      (dueDate && new Date(dueDate) < now) ||
      risk.includes('critical') ||
      risk.includes('crit')
    ) {
      return 'critical';
    }

    if (risk.includes('high')) {
      return 'high';
    }

    return 'medium';
  }

  private resolveChecklistPriority(
    dueDate: Date | null | undefined,
    now: Date,
  ): PendingQueuePriority {
    if (!dueDate) {
      return 'medium';
    }

    const diff = new Date(dueDate).getTime() - now.getTime();
    const diffInDays = diff / (1000 * 60 * 60 * 24);

    if (diffInDays < -2) {
      return 'high';
    }

    return 'medium';
  }

  private resolveNonConformityPriority(
    riskLevel: string | null | undefined,
    dueDate: Date | string | null,
    now: Date,
  ): PendingQueuePriority {
    const normalizedRisk = (riskLevel || '').toLowerCase();
    const isOverdue = dueDate ? new Date(dueDate) < now : false;

    // Prazo vencido ou risco critico/alto => critical
    if (
      isOverdue ||
      normalizedRisk.includes('crit') ||
      normalizedRisk.includes('alto') ||
      normalizedRisk.includes('high')
    ) {
      return 'critical';
    }

    // Risco medio => high (ainda requer atencao proxima)
    if (
      normalizedRisk.includes('medio') ||
      normalizedRisk.includes('média') ||
      normalizedRisk.includes('media') ||
      normalizedRisk.includes('medium')
    ) {
      return 'high';
    }

    // Risco baixo/low sem prazo vencido => medium
    return 'medium';
  }

  private resolveTrainingPriority(
    dueDate: Date,
    blocksOperation: boolean,
    now: Date,
  ): PendingQueuePriority {
    const isExpired = new Date(dueDate) < now;
    const diff = new Date(dueDate).getTime() - now.getTime();
    const diffInDays = diff / (1000 * 60 * 60 * 24);

    if (isExpired && blocksOperation) {
      return 'critical';
    }

    if (isExpired || diffInDays <= 7) {
      return 'high';
    }

    return 'medium';
  }

  private resolveMedicalExamPriority(
    result: string | null | undefined,
    dueDate: Date | null,
    now: Date,
  ): PendingQueuePriority {
    const normalizedResult = (result || '').toLowerCase();

    if (
      normalizedResult.includes('inapto') ||
      (dueDate ? new Date(dueDate) < now : false)
    ) {
      return 'critical';
    }

    return 'high';
  }

  private resolveActionPriority(
    dueDate: string | Date | null | undefined,
    now: Date,
  ): PendingQueuePriority {
    if (dueDate && new Date(dueDate) < now) {
      return 'critical';
    }

    return 'high';
  }

  private buildSlaContext(
    dueDate: string | Date | null | undefined,
    now: Date,
  ): Pick<
    PendingQueueItem,
    'slaStatus' | 'daysToDue' | 'overdueByDays' | 'breached'
  > {
    if (!dueDate) {
      return {
        slaStatus: 'unscheduled',
        daysToDue: null,
        overdueByDays: null,
        breached: false,
      };
    }

    const resolvedDueDate = new Date(dueDate);
    if (Number.isNaN(resolvedDueDate.getTime())) {
      return {
        slaStatus: 'unscheduled',
        daysToDue: null,
        overdueByDays: null,
        breached: false,
      };
    }

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const dueDay = new Date(resolvedDueDate);
    dueDay.setHours(0, 0, 0, 0);
    const diffInDays = Math.round(
      (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffInDays < 0) {
      return {
        slaStatus: 'breached',
        daysToDue: diffInDays,
        overdueByDays: Math.abs(diffInDays),
        breached: true,
      };
    }

    if (diffInDays === 0) {
      return {
        slaStatus: 'due_today',
        daysToDue: 0,
        overdueByDays: null,
        breached: false,
      };
    }

    if (diffInDays <= 3) {
      return {
        slaStatus: 'due_soon',
        daysToDue: diffInDays,
        overdueByDays: null,
        breached: false,
      };
    }

    return {
      slaStatus: 'on_track',
      daysToDue: diffInDays,
      overdueByDays: null,
      breached: false,
    };
  }

  private isPendingActionStatus(status: string | null | undefined) {
    const normalized = (status || '').toLowerCase();

    if (!normalized) {
      return true;
    }

    return !['concluída', 'concluida', 'encerrada', 'fechada'].includes(
      normalized,
    );
  }

  private comparePendingQueueItems(
    first: PendingQueueItem,
    second: PendingQueueItem,
    now: Date,
  ) {
    const priorityDiff =
      this.pendingPriorityWeight(second.priority) -
      this.pendingPriorityWeight(first.priority);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const firstOverdue = first.dueDate ? new Date(first.dueDate) < now : false;
    const secondOverdue = second.dueDate
      ? new Date(second.dueDate) < now
      : false;

    if (firstOverdue !== secondOverdue) {
      return firstOverdue ? -1 : 1;
    }

    const firstDueDate = first.dueDate
      ? new Date(first.dueDate).getTime()
      : Number.MAX_SAFE_INTEGER;
    const secondDueDate = second.dueDate
      ? new Date(second.dueDate).getTime()
      : Number.MAX_SAFE_INTEGER;

    return firstDueDate - secondDueDate;
  }

  private pendingPriorityWeight(priority: PendingQueuePriority) {
    switch (priority) {
      case 'critical':
        return 3;
      case 'high':
        return 2;
      default:
        return 1;
    }
  }
}
