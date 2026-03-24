import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Apr, AprStatus } from '../aprs/entities/apr.entity';
import { Audit } from '../audits/entities/audit.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';
import { Pt } from '../pts/entities/pt.entity';
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
  ) {}

  async getPendingQueue(companyId: string) {
    if (!companyId) {
      return this.createEmptyPendingQueueResponse();
    }

    const now = new Date();
    const warningLimit = new Date(now);
    warningLimit.setDate(now.getDate() + 14);

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
            where: { company_id: companyId, status: AprStatus.PENDENTE },
            relations: ['site', 'elaborador'],
            order: { updated_at: 'DESC' },
            take: 20,
          }),
        [] as Apr[],
      ),
      this.loadPendingQueueChunk(
        'pts',
        () =>
          this.ptsRepository
            .createQueryBuilder('pt')
            .leftJoinAndSelect('pt.site', 'site')
            .leftJoinAndSelect('pt.responsavel', 'responsavel')
            .where('pt.company_id = :companyId', { companyId })
            .andWhere('pt.status IN (:...statuses)', {
              statuses: ['Pendente', 'Expirada'],
            })
            .orderBy('pt.data_hora_fim', 'ASC')
            .take(20)
            .getMany(),
        [] as Pt[],
      ),
      this.loadPendingQueueChunk(
        'checklists',
        () =>
          this.checklistsRepository.find({
            where: {
              company_id: companyId,
              status: 'Pendente',
              is_modelo: false,
            },
            relations: ['site', 'inspetor'],
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
            .where('nc.company_id = :companyId', { companyId })
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
        () =>
          this.trainingsRepository
            .createQueryBuilder('training')
            .leftJoinAndSelect('training.user', 'user')
            .where('training.company_id = :companyId', { companyId })
            .andWhere('training.data_vencimento <= :warningLimit', {
              warningLimit,
            })
            .orderBy('training.data_vencimento', 'ASC')
            .take(20)
            .getMany(),
        [] as Training[],
      ),
      this.loadPendingQueueChunk(
        'medical-exams',
        () =>
          this.medicalExamsRepository
            .createQueryBuilder('exam')
            .leftJoinAndSelect('exam.user', 'user')
            .where('exam.company_id = :companyId', { companyId })
            .andWhere(
              "(LOWER(COALESCE(exam.resultado, '')) = :inapto OR (exam.data_vencimento IS NOT NULL AND exam.data_vencimento <= :warningLimit))",
              {
                inapto: 'inapto',
                warningLimit,
              },
            )
            .orderBy('exam.data_vencimento', 'ASC')
            .take(20)
            .getMany(),
        [] as MedicalExam[],
      ),
      this.loadPendingQueueChunk(
        'inspections',
        () =>
          this.inspectionsRepository.find({
            where: { company_id: companyId },
            relations: ['site', 'responsavel'],
            order: { updated_at: 'DESC' },
            take: 20,
          }),
        [] as Inspection[],
      ),
      this.loadPendingQueueChunk(
        'audits',
        () =>
          this.auditsRepository.find({
            where: { company_id: companyId },
            relations: ['site', 'auditor'],
            order: { updated_at: 'DESC' },
            take: 20,
          }),
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

    const queueItems = sortedQueueItems.slice(0, 40);

    return {
      degraded: failedSources.length > 0,
      failedSources,
      summary: {
        total: sortedQueueItems.length,
        critical: sortedQueueItems.filter(
          (item) => item.priority === 'critical',
        ).length,
        high: sortedQueueItems.filter((item) => item.priority === 'high')
          .length,
        medium: sortedQueueItems.filter((item) => item.priority === 'medium')
          .length,
        documents: sortedQueueItems.filter(
          (item) => item.category === 'documents',
        ).length,
        health: sortedQueueItems.filter((item) => item.category === 'health')
          .length,
        actions: sortedQueueItems.filter((item) => item.category === 'actions')
          .length,
        slaBreached: sortedQueueItems.filter((item) => item.breached).length,
        slaDueToday: sortedQueueItems.filter(
          (item) => item.slaStatus === 'due_today',
        ).length,
        slaDueSoon: sortedQueueItems.filter(
          (item) => item.slaStatus === 'due_soon',
        ).length,
      },
      items: queueItems,
    };
  }

  private createEmptyPendingQueueResponse() {
    return {
      degraded: false,
      failedSources: [] as string[],
      summary: {
        total: 0,
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

    if (
      normalizedRisk.includes('crit') ||
      normalizedRisk.includes('alto') ||
      (dueDate ? new Date(dueDate) < now : false)
    ) {
      return 'critical';
    }

    return 'high';
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
