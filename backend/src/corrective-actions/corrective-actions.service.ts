import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import {
  CorrectiveAction,
  CorrectiveActionSource,
  CorrectiveActionPriority,
  CorrectiveActionStatus,
} from './entities/corrective-action.entity';
import {
  CreateCorrectiveActionDto,
  UpdateCorrectiveActionStatusDto,
} from './dto/create-corrective-action.dto';
import { UpdateCorrectiveActionDto } from './dto/update-corrective-action.dto';
import { TenantService } from '../common/tenant/tenant.service';
import { BaseService } from '../common/base/base.service';
import { NonConformitiesService } from '../nonconformities/nonconformities.service';
import { AuditsService } from '../audits/audits.service';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Notification } from '../notifications/entities/notification.entity';

const DEFAULT_SLA_BY_PRIORITY: Record<
  'low' | 'medium' | 'high' | 'critical',
  number
> = {
  low: 14,
  medium: 7,
  high: 3,
  critical: 1,
};

@Injectable()
export class CorrectiveActionsService extends BaseService<CorrectiveAction> {
  constructor(
    @InjectRepository(CorrectiveAction)
    private readonly correctiveActionsRepository: Repository<CorrectiveAction>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    private readonly nonConformitiesService: NonConformitiesService,
    private readonly auditsService: AuditsService,
    private readonly notificationsService: NotificationsService,
    tenantService: TenantService,
  ) {
    super(correctiveActionsRepository, tenantService, 'Ação Corretiva');
  }

  async create(
    dto: CreateCorrectiveActionDto,
    source: CorrectiveActionSource = 'manual',
  ) {
    const priority = dto.priority || 'medium';
    const slaDays =
      dto.sla_days ||
      DEFAULT_SLA_BY_PRIORITY[priority] ||
      DEFAULT_SLA_BY_PRIORITY.medium;
    const dueDate = dto.due_date
      ? new Date(dto.due_date)
      : this.addDays(slaDays);

    const entity = this.correctiveActionsRepository.create({
      ...dto,
      company_id: this.getTenantId(),
      due_date: dueDate,
      source_type: dto.source_type || source,
      status: dto.status || 'open',
      priority,
      sla_days: slaDays,
      escalation_level: 0,
    });

    return this.correctiveActionsRepository.save(entity);
  }

  async list(filters?: {
    status?: CorrectiveActionStatus;
    source_type?: CorrectiveActionSource;
    due?: 'overdue' | 'soon';
  }) {
    await this.refreshOverdueActions();
    const where = this.applyTenantFilter({
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.source_type ? { source_type: filters.source_type } : {}),
    });

    const rows = await this.correctiveActionsRepository.find({
      where,
      relations: ['site', 'responsible_user'],
      order: { due_date: 'ASC', created_at: 'DESC' },
    });

    if (filters?.due === 'overdue') {
      return rows.filter((row) => row.status === 'overdue');
    }

    if (filters?.due === 'soon') {
      const limit = new Date();
      limit.setDate(limit.getDate() + 7);
      return rows.filter((row) => {
        if (row.status === 'done') return false;
        return row.due_date <= limit;
      });
    }

    return rows;
  }

  async findSummary() {
    const companyId = this.getTenantId();
    const [all, open, inProgress, overdue, done] = await Promise.all([
      this.correctiveActionsRepository.count({
        where: { company_id: companyId },
      }),
      this.correctiveActionsRepository.count({
        where: { company_id: companyId, status: 'open' },
      }),
      this.correctiveActionsRepository.count({
        where: { company_id: companyId, status: 'in_progress' },
      }),
      this.correctiveActionsRepository.count({
        where: { company_id: companyId, status: 'overdue' },
      }),
      this.correctiveActionsRepository.count({
        where: { company_id: companyId, status: 'done' },
      }),
    ]);

    const byPriorityRows = await this.correctiveActionsRepository
      .createQueryBuilder('ca')
      .select('ca.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .where('ca.company_id = :companyId', { companyId })
      .groupBy('ca.priority')
      .getRawMany<{ priority: CorrectiveActionPriority; count: string }>();

    const byPriority: Record<CorrectiveActionPriority, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const row of byPriorityRows) {
      const count = Number.parseInt(row.count, 10);
      byPriority[row.priority] = Number.isFinite(count) ? count : 0;
    }

    return {
      total: all,
      open,
      inProgress,
      overdue,
      done,
      complianceRate: all > 0 ? (done / all) * 100 : 100,
      byPriority,
    };
  }

  async createFromNonConformity(ncId: string) {
    const nc = await this.nonConformitiesService.findOne(ncId);
    const existing = await this.correctiveActionsRepository.findOne({
      where: this.applyTenantFilter({
        source_type: 'nonconformity',
        source_id: ncId,
      }),
      order: { created_at: 'DESC' },
    });
    if (existing) {
      return existing;
    }

    return this.create(
      {
        title: `Ação NC ${nc.codigo_nc || nc.id}`,
        description:
          nc.acao_definitiva_descricao || nc.descricao || 'Ação de NC',
        source_id: nc.id,
        source_type: 'nonconformity',
        site_id: nc.site_id,
        due_date:
          nc.acao_definitiva_data_prevista || nc.acao_definitiva_prazo
            ? (nc.acao_definitiva_data_prevista ||
                nc.acao_definitiva_prazo)!.toISOString()
            : this.addDays(7).toISOString(),
        responsible_name:
          nc.acao_definitiva_responsavel || nc.responsavel_area || undefined,
        priority: this.mapRiskToPriority(nc.risco_nivel),
        status: 'open',
      },
      'nonconformity',
    );
  }

  async getSlaOverview() {
    const companyId = this.getTenantId();
    const actions = await this.correctiveActionsRepository.find({
      where: { company_id: companyId },
    });
    const now = new Date();
    const next48Hours = new Date(now);
    next48Hours.setHours(now.getHours() + 48);

    const total = actions.length;
    const overdue = actions.filter((a) => a.status === 'overdue').length;
    const done = actions.filter((a) => a.status === 'done').length;
    const dueSoon = actions.filter((action) => {
      if (action.status === 'done' || action.status === 'cancelled') return false;
      const dueDate = new Date(action.due_date);
      return dueDate >= now && dueDate <= next48Hours;
    }).length;
    const criticalOpen = actions.filter(
      (action) =>
        action.priority === 'critical' &&
        !['done', 'cancelled'].includes(action.status),
    ).length;
    const highOpen = actions.filter(
      (action) =>
        action.priority === 'high' && !['done', 'cancelled'].includes(action.status),
    ).length;
    const resolutionActions = actions.filter((action) => action.closed_at);
    const avgResolutionDays =
      resolutionActions.length > 0
        ? (
            resolutionActions.reduce((sum, action) => {
              const closedAt = new Date(action.closed_at as Date).getTime();
              const createdAt = new Date(action.created_at).getTime();
              return sum + (closedAt - createdAt) / 86400000;
            }, 0) / resolutionActions.length
          ).toFixed(1)
        : '0.0';

    return {
      total,
      overdue,
      done,
      onTime: total - overdue,
      complianceRate: total > 0 ? (done / total) * 100 : 100,
      dueSoon,
      criticalOpen,
      highOpen,
      avgResolutionDays,
    };
  }

  async getSlaBySite() {
    const companyId = this.getTenantId();
    const actions = await this.correctiveActionsRepository.find({
      where: { company_id: companyId },
      relations: ['site'],
    });
    const sites = await this.correctiveActionsRepository
      .createQueryBuilder('ca')
      .leftJoinAndSelect('ca.site', 'site')
      .select('site.id', 'siteId')
      .addSelect('site.name', 'siteName')
      .addSelect('COUNT(ca.id)', 'total')
      .addSelect(
        "SUM(CASE WHEN ca.status = 'overdue' THEN 1 ELSE 0 END)",
        'overdue',
      )
      .where('ca.company_id = :companyId', { companyId })
      .groupBy('site.name')
      .addGroupBy('site.id')
      .getRawMany<{
        siteId: string | null;
        siteName: string | null;
        total: string;
        overdue: string;
      }>();

    return sites.map((s) => ({
      siteId: s.siteId,
      site: s.siteName || 'Sem Unidade',
      total: Number.parseInt(s.total, 10),
      overdue: Number.parseInt(s.overdue, 10),
      criticalOpen: actions.filter(
        (action) =>
          action.site_id === s.siteId &&
          action.priority === 'critical' &&
          !['done', 'cancelled'].includes(action.status),
      ).length,
      complianceRate:
        Number.parseInt(s.total, 10) > 0
          ? ((Number.parseInt(s.total, 10) - Number.parseInt(s.overdue, 10)) /
              Number.parseInt(s.total, 10)) *
            100
          : 100,
    }));
  }

  async runSlaEscalationSweep() {
    return this.refreshOverdueActions();
  }

  async createFromAudit(auditId: string) {
    const companyId = this.getTenantId();
    const audit = await this.auditsService.findOne(auditId, companyId);
    const existing = await this.correctiveActionsRepository.findOne({
      where: this.applyTenantFilter({
        source_type: 'audit',
        source_id: auditId,
      }),
      order: { created_at: 'DESC' },
    });
    if (existing) {
      return existing;
    }
    const firstNC = audit.resultados_nao_conformidades?.[0];
    return this.create(
      {
        title: `Ação Auditoria ${audit.titulo}`,
        description:
          firstNC?.descricao ||
          audit.conclusao ||
          'Ação corretiva originada de auditoria.',
        source_id: audit.id,
        source_type: 'audit',
        site_id: audit.site_id,
        due_date: this.addDays(15).toISOString(),
        responsible_user_id: audit.auditor_id,
        priority: firstNC?.classificacao
          ? this.mapRiskToPriority(firstNC.classificacao)
          : 'medium',
        status: 'open',
      },
      'audit',
    );
  }

  async update(id: string, dto: UpdateCorrectiveActionDto) {
    const entity = await this.findOne(id, {
      relations: ['responsible_user', 'site'],
    });
    const nextPriority = (dto.priority || entity.priority) as
      | 'low'
      | 'medium'
      | 'high'
      | 'critical';
    const nextSlaDays =
      dto.sla_days ||
      entity.sla_days ||
      DEFAULT_SLA_BY_PRIORITY[nextPriority] ||
      DEFAULT_SLA_BY_PRIORITY.medium;

    Object.assign(entity, {
      ...dto,
      ...(dto.due_date ? { due_date: new Date(dto.due_date) } : {}),
      priority: nextPriority,
      sla_days: nextSlaDays,
    });
    return this.correctiveActionsRepository.save(entity);
  }

  async updateStatus(id: string, dto: UpdateCorrectiveActionStatusDto) {
    const entity = await this.findOne(id, {
      relations: ['responsible_user', 'site'],
    });
    entity.status = dto.status;
    if (dto.evidence_notes !== undefined) {
      entity.evidence_notes = dto.evidence_notes;
    }
    entity.closed_at = dto.status === 'done' ? new Date() : undefined;
    if (dto.status !== 'done') {
      entity.escalation_level = Math.max(entity.escalation_level || 0, 0);
    }
    return this.correctiveActionsRepository.save(entity);
  }

  async remove(id: string) {
    const entity = await this.findOne(id);
    await this.correctiveActionsRepository.remove(entity);
  }

  private async refreshOverdueActions() {
    const companyId = this.getTenantId();
    await this.correctiveActionsRepository.update(
      {
        company_id: companyId,
        status: 'open',
        due_date: LessThan(new Date()),
      },
      { status: 'overdue' },
    );

    const overdueActions = await this.correctiveActionsRepository.find({
      where: {
        company_id: companyId,
        status: 'overdue',
      },
    });

    let notificationsCreated = 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    for (const action of overdueActions) {
      const currentLevel = action.escalation_level || 0;
      const nextLevel = Math.min(currentLevel + 1, 2);
      if (nextLevel === currentLevel && action.last_reminder_at) {
        continue;
      }

      const recipients = await this.getEscalationRecipients(
        action.company_id,
        action.responsible_user_id,
        nextLevel,
      );

      for (const recipientId of recipients) {
        const existing = await this.notificationsRepository.findOne({
          where: {
            userId: recipientId,
            title: `Escalonamento SLA CAPA Nível ${nextLevel}`,
            createdAt: MoreThanOrEqual(todayStart),
          },
        });
        if (existing) continue;

        await this.notificationsService.create({
          userId: recipientId,
          type: 'warning',
          title: `Escalonamento SLA CAPA Nível ${nextLevel}`,
          message: `Ação "${action.title}" está vencida. Prioridade ${action.priority.toUpperCase()}.`,
          data: {
            actionUrl: '/dashboard/corrective-actions',
            actionText: 'Ver CAPA',
            correctiveActionId: action.id,
            escalationLevel: nextLevel,
            dueDate: action.due_date,
          },
        });
        notificationsCreated += 1;
      }

      action.escalation_level = nextLevel;
      action.last_reminder_at = new Date();
      await this.correctiveActionsRepository.save(action);
    }

    return {
      overdueActions: overdueActions.length,
      notificationsCreated,
    };
  }

  private async getEscalationRecipients(
    companyId: string,
    responsibleUserId: string | undefined,
    level: number,
  ): Promise<string[]> {
    const recipients = new Set<string>();
    if (responsibleUserId) {
      recipients.add(responsibleUserId);
    }

    if (level >= 2) {
      const managers = await this.usersRepository.find({
        where: { company_id: companyId, status: true },
        relations: ['profile'],
      });
      managers
        .filter((user) => {
          const profile = user.profile?.nome?.toLowerCase() || '';
          return (
            profile.includes('administrador') ||
            profile.includes('supervisor') ||
            profile.includes('técnico')
          );
        })
        .forEach((user) => recipients.add(user.id));
    }

    return [...recipients];
  }

  private mapRiskToPriority(
    risk: string,
  ): 'low' | 'medium' | 'high' | 'critical' {
    const normalized = (risk || '').toLowerCase();
    if (normalized.includes('crít') || normalized.includes('crit')) {
      return 'critical';
    }
    if (normalized.includes('grave') || normalized.includes('alto')) {
      return 'high';
    }
    if (normalized.includes('mod')) {
      return 'medium';
    }
    return 'low';
  }
}
