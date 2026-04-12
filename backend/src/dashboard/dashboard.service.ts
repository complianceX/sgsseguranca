import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import type { Queue } from 'bullmq';
import { Counter } from '@opentelemetry/api';
import { Between, LessThanOrEqual, Repository } from 'typeorm';
import { Apr, AprStatus } from '../aprs/entities/apr.entity';
import { Audit } from '../audits/entities/audit.entity';
import { Cat } from '../cats/entities/cat.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { Company } from '../companies/entities/company.entity';
import { Dds } from '../dds/entities/dds.entity';
import { Epi } from '../epis/entities/epi.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Report } from '../reports/entities/report.entity';
import { Site } from '../sites/entities/site.entity';
import { Training } from '../trainings/entities/training.entity';
import { User } from '../users/entities/user.entity';
import { MonthlySnapshot } from './entities/monthly-snapshot.entity';
import { DashboardDocumentPendenciesService } from './dashboard-document-pendencies.service';
import { profileStage } from '../common/observability/perf-stage.util';
import {
  DashboardDocumentPendencyOperationsService,
  DashboardDocumentPendencyResolvedActionResponse,
} from './dashboard-document-pendency-operations.service';
import { DashboardOperationalNotifierService } from './dashboard-operational-notifier.service';
import { DashboardPendingQueueService } from './dashboard-pending-queue.service';

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

type InspectionRiskItem = {
  classificacao_risco?: string;
};

type DashboardCachedPayload<T> = {
  value: T;
  generatedAt: number;
};

export type DashboardRevalidateQueryType = 'summary' | 'pending-queue';

const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const DASHBOARD_CACHE_STALE_WINDOW_MS = 30 * 1000;
export const DASHBOARD_DOMAIN_METRICS = 'DASHBOARD_DOMAIN_METRICS';

/**
 * Wraps a promise so that failures return a fallback value instead of
 * propagating.  This allows Promise.all() to complete even when individual
 * queries fail — the dashboard degrades gracefully instead of crashing.
 */
function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch(() => fallback);
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private readonly summaryInFlightByCompany = new Map<
    string,
    Promise<unknown>
  >();

  constructor(
    @InjectRepository(Apr)
    private readonly aprsRepository: Repository<Apr>,
    @InjectRepository(Audit)
    private readonly auditsRepository: Repository<Audit>,
    @InjectRepository(Checklist)
    private readonly checklistsRepository: Repository<Checklist>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(Dds)
    private readonly ddsRepository: Repository<Dds>,
    @InjectRepository(Epi)
    private readonly episRepository: Repository<Epi>,
    @InjectRepository(Inspection)
    private readonly inspectionsRepository: Repository<Inspection>,
    @InjectRepository(Training)
    private readonly trainingsRepository: Repository<Training>,
    @InjectRepository(NonConformity)
    private readonly nonConformitiesRepository: Repository<NonConformity>,
    @InjectRepository(Cat)
    private readonly catsRepository: Repository<Cat>,
    @InjectRepository(Pt)
    private readonly ptsRepository: Repository<Pt>,
    @InjectRepository(Report)
    private readonly reportsRepository: Repository<Report>,
    @InjectRepository(Site)
    private readonly sitesRepository: Repository<Site>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(MonthlySnapshot)
    private readonly monthlySnapshotsRepository: Repository<MonthlySnapshot>,
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(MedicalExam)
    private readonly medicalExamsRepository: Repository<MedicalExam>,
    private readonly dashboardPendingQueueService: DashboardPendingQueueService,
    private readonly dashboardDocumentPendenciesService: DashboardDocumentPendenciesService,
    private readonly dashboardDocumentPendencyOperationsService: DashboardDocumentPendencyOperationsService,
    private readonly dashboardOperationalNotifierService: DashboardOperationalNotifierService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @Optional()
    @InjectQueue('dashboard-revalidate')
    private readonly dashboardRevalidateQueue?: Queue,
    @Optional()
    @Inject(DASHBOARD_DOMAIN_METRICS)
    private readonly domainMetrics?: Record<string, Counter>,
  ) {}

  async getSummary(
    companyId: string,
    options?: { bypassCache?: boolean; skipBypassMetric?: boolean },
  ) {
    const perfRoute = '/dashboard/summary';

    if (options?.bypassCache && !options?.skipBypassMetric && companyId) {
      this.recordDashboardCacheRequestMetric({
        companyId,
        queryType: 'summary',
        outcome: 'bypass',
      });
    }

    if (!options?.bypassCache && companyId) {
      const cached = await profileStage({
        logger: this.logger,
        route: perfRoute,
        stage: 'cache_read',
        companyId,
        run: () => this.readDashboardCache<unknown>(companyId, 'summary'),
      });
      if (cached.hit && cached.value !== undefined) {
        this.recordDashboardCacheRequestMetric({
          companyId,
          queryType: 'summary',
          outcome: 'hit',
        });
        return cached.value;
      }

      if (cached.stale && cached.value !== undefined) {
        this.recordDashboardCacheRequestMetric({
          companyId,
          queryType: 'summary',
          outcome: 'stale',
        });
        void this.enqueueDashboardRevalidation(companyId, 'summary');
        return cached.value;
      }

      const inFlight = this.summaryInFlightByCompany.get(companyId);
      if (inFlight) {
        return inFlight;
      }

      const loader: Promise<unknown> = this.getSummary(companyId, {
        bypassCache: true,
        skipBypassMetric: true,
      }).finally(() => {
        const current = this.summaryInFlightByCompany.get(companyId);
        if (current === loader) {
          this.summaryInFlightByCompany.delete(companyId);
        }
      });
      this.summaryInFlightByCompany.set(companyId, loader);
      return loader;
    }

    const now = new Date();
    const warningLimit = new Date(now);
    warningLimit.setDate(now.getDate() + 30);

    const [
      users,
      companies,
      sites,
      checklists,
      aprs,
      pts,
      expiringEpis,
      expiringTrainings,
      pendingAprs,
      pendingPts,
      pendingChecklists,
      pendingNonConformities,
      inspectionDashboardSources,
      auditDashboardSources,
      nonConformityDashboardSources,
      aprModels,
      ddsModels,
      checklistModels,
      recentAprs,
      recentPts,
      recentChecklists,
      recentInspections,
      recentAudits,
      recentNonConformities,
      recentTrainings,
      siteComplianceRows,
      recentReports,
    ] = await profileStage({
      logger: this.logger,
      route: perfRoute,
      stage: 'db_query_bundle',
      companyId,
      run: () =>
        Promise.all([
          safe(
            this.usersRepository.count({ where: { company_id: companyId } }),
            0,
          ),
          safe(this.companiesRepository.count(), 0),
          safe(
            this.sitesRepository.count({ where: { company_id: companyId } }),
            0,
          ),
          safe(
            this.checklistsRepository.count({
              where: { company_id: companyId },
            }),
            0,
          ),
          safe(
            this.aprsRepository.count({ where: { company_id: companyId } }),
            0,
          ),
          safe(
            this.ptsRepository.count({ where: { company_id: companyId } }),
            0,
          ),
          safe(
            this.episRepository
              .createQueryBuilder('epi')
              .select(['epi.id', 'epi.nome', 'epi.ca', 'epi.validade_ca'])
              .where('epi.company_id = :companyId', { companyId })
              .andWhere('epi.validade_ca IS NOT NULL')
              .andWhere('epi.validade_ca <= :warningLimit', { warningLimit })
              .orderBy('epi.validade_ca', 'ASC')
              .limit(5)
              .getMany(),
            [],
          ),
          safe(
            this.trainingsRepository.find({
              where: {
                company_id: companyId,
                data_vencimento: LessThanOrEqual(warningLimit),
              },
              relations: { user: true },
              select: {
                id: true,
                nome: true,
                data_vencimento: true,
                user: {
                  nome: true,
                },
              },
              order: { data_vencimento: 'ASC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.aprsRepository.count({
              where: { company_id: companyId, status: AprStatus.PENDENTE },
            }),
            0,
          ),
          safe(
            this.ptsRepository.count({
              where: { company_id: companyId, status: 'Pendente' },
            }),
            0,
          ),
          safe(
            this.checklistsRepository.count({
              where: { company_id: companyId, status: 'Pendente' },
            }),
            0,
          ),
          safe(
            this.nonConformitiesRepository
              .createQueryBuilder('nc')
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
              .getCount(),
            0,
          ),
          safe(
            this.inspectionsRepository.find({
              where: { company_id: companyId },
              select: [
                'id',
                'setor_area',
                'plano_acao',
                'perigos_riscos',
                'evidencias',
              ],
            }),
            [],
          ),
          safe(
            this.auditsRepository.find({
              where: { company_id: companyId },
              select: [
                'id',
                'titulo',
                'plano_acao',
                'resultados_nao_conformidades',
              ],
            }),
            [],
          ),
          safe(
            this.nonConformitiesRepository.find({
              where: { company_id: companyId },
              select: [
                'id',
                'codigo_nc',
                'status',
                'acao_imediata_descricao',
                'acao_imediata_responsavel',
                'acao_imediata_data',
                'acao_imediata_status',
                'acao_definitiva_descricao',
                'acao_definitiva_responsavel',
                'acao_definitiva_prazo',
                'acao_definitiva_data_prevista',
                'risco_nivel',
                'anexos',
              ],
            }),
            [],
          ),
          safe(
            this.aprsRepository.count({
              where: { company_id: companyId, is_modelo: true },
            }),
            0,
          ),
          safe(
            this.ddsRepository.count({
              where: { company_id: companyId, is_modelo: true },
            }),
            0,
          ),
          safe(
            this.checklistsRepository.count({
              where: { company_id: companyId, is_modelo: true },
            }),
            0,
          ),
          safe(
            this.aprsRepository.find({
              where: { company_id: companyId },
              select: ['id', 'titulo', 'created_at', 'updated_at'],
              order: { updated_at: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.ptsRepository.find({
              where: { company_id: companyId },
              select: ['id', 'titulo', 'created_at', 'updated_at'],
              order: { updated_at: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.checklistsRepository.find({
              where: { company_id: companyId },
              select: ['id', 'titulo', 'created_at', 'updated_at'],
              order: { updated_at: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.inspectionsRepository.find({
              where: { company_id: companyId },
              select: ['id', 'setor_area', 'created_at', 'updated_at'],
              order: { updated_at: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.auditsRepository.find({
              where: { company_id: companyId },
              select: ['id', 'titulo', 'created_at', 'updated_at'],
              order: { updated_at: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.nonConformitiesRepository.find({
              where: { company_id: companyId },
              select: ['id', 'codigo_nc', 'created_at', 'updated_at'],
              order: { updated_at: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.trainingsRepository.find({
              where: { company_id: companyId },
              select: ['id', 'nome', 'data_conclusao'],
              order: { data_conclusao: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.checklistsRepository
              .createQueryBuilder('checklist')
              .leftJoin('checklist.site', 'site')
              .select('checklist.site_id', 'site_id')
              .addSelect("COALESCE(site.nome, 'Sem obra')", 'site_name')
              .addSelect('COUNT(checklist.id)', 'total')
              .addSelect(
                "SUM(CASE WHEN checklist.status = 'Conforme' THEN 1 ELSE 0 END)",
                'conformes',
              )
              .where('checklist.company_id = :companyId', { companyId })
              .groupBy('checklist.site_id')
              .addGroupBy('site.nome')
              .getRawMany<{
                site_id: string | null;
                site_name: string;
                total: string;
                conformes: string;
              }>(),
            [],
          ),
          safe(
            this.reportsRepository.find({
              where: { company_id: companyId },
              select: ['id', 'titulo', 'mes', 'ano', 'created_at'],
              order: { created_at: 'DESC' },
              take: 4,
            }),
            [],
          ),
        ]),
    });

    const filteredExpiringEpis = expiringEpis;

    const filteredExpiringTrainings = expiringTrainings.map((training) => ({
      id: training.id,
      nome: training.nome,
      data_vencimento: training.data_vencimento,
      user: training.user ? { nome: training.user.nome } : null,
    }));

    const actionPlanItems = [
      ...inspectionDashboardSources.flatMap((inspection) =>
        (inspection.plano_acao || []).map(
          (item: InspectionActionItem, index) => ({
            id: `inspection-${inspection.id}-${index}`,
            source: 'Inspeção',
            title: inspection.setor_area,
            action: item.acao || '',
            responsavel: item.responsavel || null,
            prazo: item.prazo || null,
            status: item.status || null,
            href: `/dashboard/inspections/edit/${inspection.id}`,
          }),
        ),
      ),
      ...auditDashboardSources.flatMap((audit) =>
        (audit.plano_acao || []).map((item: AuditActionItem, index) => ({
          id: `audit-${audit.id}-${index}`,
          source: 'Auditoria',
          title: audit.titulo,
          action: item.acao || '',
          responsavel: item.responsavel || null,
          prazo: item.prazo || null,
          status: item.status || null,
          href: `/dashboard/audits/edit/${audit.id}`,
        })),
      ),
      ...nonConformityDashboardSources.flatMap((item) => [
        ...(item.acao_imediata_descricao
          ? [
              {
                id: `nc-imediata-${item.id}`,
                source: 'Não Conformidade',
                title: item.codigo_nc,
                action: item.acao_imediata_descricao,
                responsavel: item.acao_imediata_responsavel || null,
                prazo: item.acao_imediata_data || null,
                status: item.acao_imediata_status || item.status || null,
                href: `/dashboard/nonconformities/edit/${item.id}`,
              },
            ]
          : []),
        ...(item.acao_definitiva_descricao
          ? [
              {
                id: `nc-definitiva-${item.id}`,
                source: 'Não Conformidade',
                title: item.codigo_nc,
                action: item.acao_definitiva_descricao,
                responsavel: item.acao_definitiva_responsavel || null,
                prazo:
                  item.acao_definitiva_prazo ||
                  item.acao_definitiva_data_prevista ||
                  null,
                status: item.status || null,
                href: `/dashboard/nonconformities/edit/${item.id}`,
              },
            ]
          : []),
      ]),
    ]
      .filter((item) => item.action)
      .sort((first, second) => {
        const firstDate = first.prazo
          ? new Date(first.prazo).getTime()
          : Number.MAX_SAFE_INTEGER;
        const secondDate = second.prazo
          ? new Date(second.prazo).getTime()
          : Number.MAX_SAFE_INTEGER;
        return firstDate - secondDate;
      })
      .slice(0, 6);

    const riskSummary = { alto: 0, medio: 0, baixo: 0 };
    const applyRisk = (value?: string | null) => {
      if (!value) {
        return;
      }
      const normalized = value.toLowerCase();
      if (normalized.includes('alto')) {
        riskSummary.alto += 1;
        return;
      }
      if (normalized.includes('médio') || normalized.includes('medio')) {
        riskSummary.medio += 1;
        return;
      }
      if (normalized.includes('baixo')) {
        riskSummary.baixo += 1;
      }
    };

    inspectionDashboardSources.forEach((inspection) => {
      (inspection.perigos_riscos || []).forEach((item: InspectionRiskItem) =>
        applyRisk(item.classificacao_risco),
      );
    });
    nonConformityDashboardSources.forEach((item) =>
      applyRisk(item.risco_nivel),
    );

    const inspectionEvidence = inspectionDashboardSources.reduce(
      (total, inspection) => total + (inspection.evidencias?.length || 0),
      0,
    );
    const nonConformityEvidence = nonConformityDashboardSources.reduce(
      (total, item) => total + (item.anexos?.length || 0),
      0,
    );
    const auditEvidence = auditDashboardSources.reduce(
      (total, audit) =>
        total + (audit.resultados_nao_conformidades?.length || 0),
      0,
    );

    const recentActivities = [
      ...recentAprs.map((item) => ({
        id: `apr-${item.id}`,
        title: 'APR atualizada',
        description: item.titulo,
        date: item.updated_at || item.created_at,
        href: '/dashboard/aprs',
        color: 'bg-stone-500',
      })),
      ...recentPts.map((item) => ({
        id: `pt-${item.id}`,
        title: 'PT atualizada',
        description: item.titulo,
        date: item.updated_at || item.created_at,
        href: '/dashboard/pts',
        color: 'bg-zinc-500',
      })),
      ...recentChecklists.map((item) => ({
        id: `checklist-${item.id}`,
        title: 'Checklist atualizado',
        description: item.titulo,
        date: item.updated_at || item.created_at,
        href: '/dashboard/checklists',
        color: 'bg-emerald-500',
      })),
      ...recentInspections.map((item) => ({
        id: `inspection-${item.id}`,
        title: 'Inspeção registrada',
        description: item.setor_area,
        date: item.updated_at || item.created_at,
        href: '/dashboard/inspections',
        color: 'bg-amber-500',
      })),
      ...recentAudits.map((item) => ({
        id: `audit-${item.id}`,
        title: 'Auditoria registrada',
        description: item.titulo,
        date: item.updated_at || item.created_at,
        href: '/dashboard/audits',
        color: 'bg-orange-500',
      })),
      ...recentNonConformities.map((item) => ({
        id: `nc-${item.id}`,
        title: 'Não conformidade atualizada',
        description: item.codigo_nc,
        date: item.updated_at || item.created_at,
        href: '/dashboard/nonconformities',
        color: 'bg-red-500',
      })),
      ...recentTrainings.map((item) => ({
        id: `training-${item.id}`,
        title: 'Treinamento registrado',
        description: item.nome,
        date: item.data_conclusao,
        href: '/dashboard/trainings',
        color: 'bg-neutral-500',
      })),
    ]
      .filter((item) => item.date)
      .sort((first, second) => {
        return new Date(second.date).getTime() - new Date(first.date).getTime();
      })
      .slice(0, 6);

    const siteCompliance = siteComplianceRows
      .map((row) => {
        const total = Number(row.total);
        const conformes = Number(row.conformes);
        return {
          id: row.site_id || 'without-site',
          nome: row.site_name,
          total,
          conformes,
          taxa: total > 0 ? Math.round((conformes / total) * 100) : 0,
        };
      })
      .sort((first, second) => second.taxa - first.taxa)
      .slice(0, 5);

    const response = {
      counts: {
        users,
        companies,
        sites,
        checklists,
        aprs,
        pts,
      },
      expiringEpis: filteredExpiringEpis,
      expiringTrainings: filteredExpiringTrainings,
      pendingApprovals: {
        aprs: pendingAprs,
        pts: pendingPts,
        checklists: pendingChecklists,
        nonconformities: pendingNonConformities,
      },
      actionPlanItems,
      riskSummary,
      evidenceSummary: {
        total: inspectionEvidence + nonConformityEvidence + auditEvidence,
        inspections: inspectionEvidence,
        nonconformities: nonConformityEvidence,
        audits: auditEvidence,
      },
      modelCounts: {
        aprs: aprModels,
        dds: ddsModels,
        checklists: checklistModels,
      },
      recentActivities,
      siteCompliance,
      recentReports,
    };

    if (companyId) {
      await profileStage({
        logger: this.logger,
        route: perfRoute,
        stage: 'cache_write',
        companyId,
        run: () => this.writeDashboardCache(companyId, 'summary', response),
      });
      this.recordDashboardCacheRequestMetric({
        companyId,
        queryType: 'summary',
        outcome: 'miss',
      });
    }

    return response;
  }

  async getKpis(companyId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      aprCount,
      aprBeforeTaskCount,
      inspections,
      trainingsCount,
      validTrainingsCount,
      recurringNcRows,
      incidents,
      blockedPts,
      unreadAlerts,
    ] = await Promise.all([
      safe(
        this.aprsRepository.count({
          where: { company_id: companyId },
        }),
        0,
      ),
      safe(
        this.aprsRepository
          .createQueryBuilder('apr')
          .where('apr.company_id = :companyId', { companyId })
          .andWhere('apr.created_at IS NOT NULL')
          .andWhere('apr.data_inicio IS NOT NULL')
          .andWhere('apr.created_at <= apr.data_inicio')
          .getCount(),
        0,
      ),
      safe(
        this.inspectionsRepository.find({
          where: { company_id: companyId },
          select: ['id', 'plano_acao'],
        }),
        [],
      ),
      safe(
        this.trainingsRepository.count({
          where: { company_id: companyId },
        }),
        0,
      ),
      safe(
        this.trainingsRepository
          .createQueryBuilder('training')
          .where('training.company_id = :companyId', { companyId })
          .andWhere('training.data_vencimento >= :now', { now })
          .getCount(),
        0,
      ),
      safe(
        this.nonConformitiesRepository
          .createQueryBuilder('nc')
          .select('nc.codigo_nc', 'codigo_nc')
          .addSelect('COUNT(nc.id)', 'total')
          .where('nc.company_id = :companyId', { companyId })
          .groupBy('nc.codigo_nc')
          .having('COUNT(nc.id) > 1')
          .getRawMany<{ codigo_nc: string; total: string }>(),
        [],
      ),
      safe(
        this.catsRepository.count({
          where: { company_id: companyId },
        }),
        0,
      ),
      safe(
        this.ptsRepository.count({
          where: {
            company_id: companyId,
            status: 'Pendente',
            residual_risk: 'CRITICAL',
            control_evidence: false,
          },
        }),
        0,
      ),
      safe(
        this.notificationsRepository
          .createQueryBuilder('notification')
          .select([
            'notification.id',
            'notification.type',
            'notification.message',
            'notification.createdAt',
            'notification.read',
          ])
          .innerJoin(
            User,
            'user',
            'user.id = notification.userId AND user.company_id = :companyId',
            { companyId },
          )
          .where('notification.read = :read', { read: false })
          .orderBy('notification.createdAt', 'DESC')
          .take(10)
          .getMany(),
        [],
      ),
    ]);

    const aprBeforeTaskPercent = this.toPercent(aprBeforeTaskCount, aprCount);

    const completedInspections = inspections.filter((inspection) => {
      const actionPlan = Array.isArray(inspection.plano_acao)
        ? inspection.plano_acao
        : [];
      if (actionPlan.length === 0) {
        return false;
      }
      return actionPlan.every((item: { status?: string }) =>
        ['concluída', 'concluida', 'encerrada', 'fechada'].includes(
          (item.status || '').toLowerCase(),
        ),
      );
    }).length;
    const completedInspectionsPercent = this.toPercent(
      completedInspections,
      inspections.length,
    );

    const trainingCompliance = this.toPercent(
      validTrainingsCount,
      trainingsCount,
    );

    const recurringNc = recurringNcRows.reduce(
      (accumulator, row) => accumulator + Number(row.total),
      0,
    );

    const [monthlyRiskTrend, monthlyNc] = await Promise.all([
      safe(
        this.monthlySnapshotsRepository.find({
          where: { company_id: companyId },
          select: ['month', 'risk_score'],
          order: { month: 'ASC' },
          take: 12,
        }),
        [],
      ),
      safe(
        this.nonConformitiesRepository
          .createQueryBuilder('nc')
          .select(
            "to_char(date_trunc('month', nc.data_identificacao), 'YYYY-MM')",
            'month',
          )
          .addSelect('COUNT(nc.id)', 'count')
          .where('nc.company_id = :companyId', { companyId })
          .andWhere('nc.data_identificacao >= :monthStart', { monthStart })
          .andWhere('nc.data_identificacao < :nextMonth', { nextMonth })
          .groupBy("date_trunc('month', nc.data_identificacao)")
          .orderBy("date_trunc('month', nc.data_identificacao)", 'ASC')
          .getRawMany<{ month: string; count: string }>(),
        [],
      ),
    ]);

    return {
      leading: {
        apr_before_task: {
          total: aprCount,
          compliant: aprBeforeTaskCount,
          percentage: aprBeforeTaskPercent,
        },
        completed_inspections: {
          total: inspections.length,
          completed: completedInspections,
          percentage: completedInspectionsPercent,
        },
        training_compliance: {
          total: trainingsCount,
          compliant: validTrainingsCount,
          percentage: trainingCompliance,
        },
      },
      lagging: {
        recurring_nc: recurringNc,
        incidents,
        blocked_pt: blockedPts,
      },
      trends: {
        risk: monthlyRiskTrend.map((item) => ({
          month: item.month,
          risk_score: Number(item.risk_score),
        })),
        nc: monthlyNc.map((item) => ({
          month: item.month,
          count: Number(item.count),
        })),
      },
      alerts: unreadAlerts.map((notification) => ({
        id: notification.id,
        type: notification.type,
        message: notification.message,
        created_at: notification.createdAt,
        read: notification.read,
      })),
    };
  }

  async getHeatmap(companyId: string) {
    const [snapshots, sites] = await Promise.all([
      safe(
        this.monthlySnapshotsRepository
          .createQueryBuilder('snapshot')
          .select('snapshot.site_id', 'site_id')
          .addSelect('AVG(snapshot.risk_score)', 'risk_score')
          .addSelect('SUM(snapshot.nc_count)', 'nc_count')
          .addSelect('AVG(snapshot.training_compliance)', 'training_compliance')
          .where('snapshot.company_id = :companyId', { companyId })
          .groupBy('snapshot.site_id')
          .getRawMany<{
            site_id: string;
            risk_score: string;
            nc_count: string;
            training_compliance: string;
          }>(),
        [],
      ),
      safe(
        this.sitesRepository.find({
          where: { company_id: companyId },
          select: ['id', 'nome'],
        }),
        [],
      ),
    ]);
    const siteNameById = new Map(sites.map((site) => [site.id, site.nome]));

    if (snapshots.length > 0) {
      return snapshots.map((row) => ({
        site_id: row.site_id,
        site_name: siteNameById.get(row.site_id) || 'Obra sem nome',
        risk_score: Number(row.risk_score),
        nc_count: Number(row.nc_count),
        training_compliance: Number(row.training_compliance),
      }));
    }

    const fallbackRows = await safe(
      this.aprsRepository
        .createQueryBuilder('apr')
        .select('apr.site_id', 'site_id')
        .addSelect('AVG(COALESCE(apr.initial_risk, 0))', 'risk_score')
        .addSelect('COUNT(apr.id)', 'apr_count')
        .where('apr.company_id = :companyId', { companyId })
        .groupBy('apr.site_id')
        .getRawMany<{
          site_id: string;
          risk_score: string;
          apr_count: string;
        }>(),
      [],
    );

    return fallbackRows.map((row) => ({
      site_id: row.site_id,
      site_name: siteNameById.get(row.site_id) || 'Obra sem nome',
      risk_score: Number(row.risk_score),
      apr_count: Number(row.apr_count),
    }));
  }

  async getTstDay(companyId: string) {
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);

    const [
      pendingPts,
      nonConformities,
      inspections,
      expiringMedicalExams,
      expiringTrainings,
    ] = await Promise.all([
      safe(
        this.ptsRepository.find({
          where: { company_id: companyId, status: 'Pendente' },
          relations: { site: true, responsavel: true },
          select: {
            id: true,
            numero: true,
            titulo: true,
            status: true,
            residual_risk: true,
            site: {
              nome: true,
            },
            responsavel: {
              nome: true,
            },
          },
          order: { created_at: 'ASC' },
          take: 10,
        }),
        [],
      ),
      safe(
        this.nonConformitiesRepository.find({
          where: { company_id: companyId },
          relations: { site: true },
          select: {
            id: true,
            codigo_nc: true,
            status: true,
            risco_nivel: true,
            local_setor_area: true,
            site: {
              nome: true,
            },
          },
          order: { created_at: 'DESC' },
          take: 30,
        }),
        [],
      ),
      safe(
        this.inspectionsRepository.find({
          where: { company_id: companyId },
          relations: { site: true, responsavel: true },
          select: {
            id: true,
            setor_area: true,
            data_inspecao: true,
            plano_acao: true,
            site: {
              nome: true,
            },
            responsavel: {
              nome: true,
            },
          },
          order: { data_inspecao: 'ASC' },
          take: 30,
        }),
        [],
      ),
      safe(
        this.medicalExamsRepository.find({
          where: {
            company_id: companyId,
            data_vencimento: Between(now, nextWeek),
          },
          relations: { user: true },
          select: {
            id: true,
            tipo_exame: true,
            data_vencimento: true,
            resultado: true,
            user: {
              nome: true,
            },
          },
          order: { data_vencimento: 'ASC' },
        }),
        [],
      ),
      safe(
        this.trainingsRepository.find({
          where: {
            company_id: companyId,
            data_vencimento: Between(now, nextWeek),
          },
          relations: { user: true },
          select: {
            id: true,
            nome: true,
            data_vencimento: true,
            bloqueia_operacao_quando_vencido: true,
            user: {
              nome: true,
            },
          },
          order: { data_vencimento: 'ASC' },
        }),
        [],
      ),
    ]);

    const criticalNonConformities = nonConformities.filter((item) => {
      const status = (item.status || '').toLowerCase();
      const risk = (item.risco_nivel || '').toLowerCase();
      const isClosed = [
        'encerrada',
        'concluída',
        'concluida',
        'fechada',
      ].includes(status);
      const isCritical =
        risk.includes('alto') || risk.includes('crít') || risk.includes('crit');
      return !isClosed && isCritical;
    });

    const overdueInspections = inspections.filter((inspection) => {
      const actionPlan = Array.isArray(inspection.plano_acao)
        ? inspection.plano_acao
        : [];

      return actionPlan.some((item: { prazo?: string; status?: string }) => {
        if (!item.prazo) {
          return false;
        }
        const dueDate = new Date(item.prazo);
        const status = (item.status || '').toLowerCase();
        return (
          dueDate < now &&
          !['concluída', 'concluida', 'encerrada', 'fechada'].includes(status)
        );
      });
    });

    return {
      summary: {
        pendingPtApprovals: pendingPts.length,
        criticalNonConformities: criticalNonConformities.length,
        overdueInspections: overdueInspections.length,
        expiringDocuments:
          expiringMedicalExams.length + expiringTrainings.length,
      },
      pendingPtApprovals: pendingPts.map((pt) => ({
        id: pt.id,
        numero: pt.numero,
        titulo: pt.titulo,
        status: pt.status,
        site: pt.site?.nome || null,
        responsavel: pt.responsavel?.nome || null,
        residual_risk: pt.residual_risk || null,
      })),
      criticalNonConformities: criticalNonConformities
        .slice(0, 10)
        .map((item) => ({
          id: item.id,
          codigo_nc: item.codigo_nc,
          status: item.status,
          risco_nivel: item.risco_nivel,
          local_setor_area: item.local_setor_area,
          site: item.site?.nome || null,
        })),
      overdueInspections: overdueInspections.slice(0, 10).map((inspection) => ({
        id: inspection.id,
        setor_area: inspection.setor_area,
        data_inspecao: inspection.data_inspecao,
        responsavel: inspection.responsavel?.nome || null,
        site: inspection.site?.nome || null,
      })),
      expiringDocuments: {
        medicalExams: expiringMedicalExams.slice(0, 10).map((exam) => ({
          id: exam.id,
          workerName: exam.user?.nome || null,
          tipo_exame: exam.tipo_exame,
          data_vencimento: exam.data_vencimento,
          resultado: exam.resultado,
        })),
        trainings: expiringTrainings.slice(0, 10).map((training) => ({
          id: training.id,
          workerName: training.user?.nome || null,
          nome: training.nome,
          data_vencimento: training.data_vencimento,
          bloqueia_operacao_quando_vencido:
            training.bloqueia_operacao_quando_vencido,
        })),
      },
    };
  }

  async getPendingQueue(input: {
    companyId: string;
    userId?: string;
    bypassCache?: boolean;
    skipNotifications?: boolean;
  }) {
    if (input.bypassCache && input.companyId) {
      this.recordDashboardCacheRequestMetric({
        companyId: input.companyId,
        queryType: 'pending-queue',
        outcome: 'bypass',
      });
    }

    if (!input.bypassCache && input.companyId) {
      const cached = await this.readDashboardCache<unknown>(
        input.companyId,
        'pending-queue',
      );
      if (cached.hit && cached.value !== undefined) {
        this.recordDashboardCacheRequestMetric({
          companyId: input.companyId,
          queryType: 'pending-queue',
          outcome: 'hit',
        });
        return cached.value;
      }

      if (cached.stale && cached.value !== undefined) {
        this.recordDashboardCacheRequestMetric({
          companyId: input.companyId,
          queryType: 'pending-queue',
          outcome: 'stale',
        });
        void this.enqueueDashboardRevalidation(
          input.companyId,
          'pending-queue',
        );
        return cached.value;
      }
    }

    const queue = await this.dashboardPendingQueueService.getPendingQueue(
      input.companyId,
    );

    if (!input.skipNotifications) {
      try {
        await this.dashboardOperationalNotifierService.notifyPendingQueue({
          userId: input.userId,
          companyId: input.companyId,
          queue,
        });
      } catch (error) {
        this.logger.warn(
          `[dashboard.pending-queue] Falha ao enviar notificações operacionais: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (input.companyId) {
      await this.writeDashboardCache(input.companyId, 'pending-queue', queue);
      this.recordDashboardCacheRequestMetric({
        companyId: input.companyId,
        queryType: 'pending-queue',
        outcome: 'miss',
      });
    }

    return queue;
  }

  async getDocumentPendencies(input: {
    companyId?: string;
    userId?: string;
    isSuperAdmin?: boolean;
    permissions?: string[];
    filters?: {
      companyId?: string;
      siteId?: string;
      module?: string;
      priority?: string;
      criticality?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    };
  }) {
    const response =
      await this.dashboardDocumentPendenciesService.getDocumentPendencies({
        currentCompanyId: input.companyId,
        isSuperAdmin: input.isSuperAdmin,
        permissions: input.permissions,
        filters: input.filters,
      });

    try {
      await this.dashboardOperationalNotifierService.notifyDocumentPendencies({
        userId: input.userId,
        companyId:
          response.filtersApplied.companyId || input.companyId || undefined,
        response,
      });
    } catch (error) {
      this.logger.warn(
        `[dashboard.document-pendencies] Falha ao enviar notificações operacionais: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return response;
  }

  async resolveDocumentPendencyAction(input: {
    actionKey:
      | 'open_final_pdf'
      | 'open_governed_video'
      | 'open_governed_attachment';
    module: string;
    documentId: string;
    attachmentId?: string;
    attachmentIndex?: number;
    companyId?: string;
    actorId?: string;
    permissions?: string[];
  }): Promise<DashboardDocumentPendencyResolvedActionResponse> {
    return this.dashboardDocumentPendencyOperationsService.resolveAction({
      actionKey: input.actionKey,
      module: input.module,
      documentId: input.documentId,
      attachmentId: input.attachmentId,
      attachmentIndex: input.attachmentIndex,
      currentCompanyId: input.companyId,
      actorId: input.actorId,
      permissions: input.permissions,
    });
  }

  async retryDocumentPendencyImport(input: {
    documentId: string;
    actorId?: string;
    permissions?: string[];
  }) {
    return this.dashboardDocumentPendencyOperationsService.retryImport(
      input.documentId,
      {
        actorId: input.actorId,
        permissions: input.permissions,
      },
    );
  }

  async invalidateDashboardCache(
    companyId: string,
    queryType?: DashboardRevalidateQueryType,
  ) {
    if (!companyId) {
      return {
        companyId,
        invalidated: [] as DashboardRevalidateQueryType[],
      };
    }

    const targets: DashboardRevalidateQueryType[] = queryType
      ? [queryType]
      : ['summary', 'pending-queue'];

    await Promise.all(
      targets.flatMap((target) => [
        this.cacheManager.del(this.buildDashboardCacheKey(companyId, target)),
        this.cacheManager.del(
          this.buildDashboardStaleCacheKey(companyId, target),
        ),
      ]),
    );

    return {
      companyId,
      invalidated: targets,
    };
  }

  async revalidateDashboardQuery(
    companyId: string,
    queryType: DashboardRevalidateQueryType,
  ): Promise<void> {
    if (!companyId) {
      return;
    }

    try {
      if (queryType === 'summary') {
        await this.getSummary(companyId, { bypassCache: true });
      } else if (queryType === 'pending-queue') {
        await this.getPendingQueue({
          companyId,
          bypassCache: true,
          skipNotifications: true,
        });
      }

      this.recordDashboardRevalidationMetric({
        companyId,
        queryType,
        outcome: 'processed',
      });
    } catch (error) {
      this.recordDashboardRevalidationMetric({
        companyId,
        queryType,
        outcome: 'failed',
      });
      throw error;
    }
  }

  private buildDashboardCacheKey(
    companyId: string,
    queryType: DashboardRevalidateQueryType,
  ): string {
    return `dashboard:${companyId}:${queryType}`;
  }

  private buildDashboardStaleCacheKey(
    companyId: string,
    queryType: DashboardRevalidateQueryType,
  ): string {
    return `${this.buildDashboardCacheKey(companyId, queryType)}:stale`;
  }

  private async readDashboardCache<T>(
    companyId: string,
    queryType: DashboardRevalidateQueryType,
  ): Promise<{ hit: boolean; stale: boolean; value?: T }> {
    const active = await this.cacheManager.get<DashboardCachedPayload<T>>(
      this.buildDashboardCacheKey(companyId, queryType),
    );
    if (active?.value !== undefined) {
      return {
        hit: true,
        stale: false,
        value: active.value,
      };
    }

    const stalePayload = await this.cacheManager.get<DashboardCachedPayload<T>>(
      this.buildDashboardStaleCacheKey(companyId, queryType),
    );
    if (stalePayload?.value !== undefined) {
      return {
        hit: false,
        stale: true,
        value: stalePayload.value,
      };
    }

    return {
      hit: false,
      stale: false,
    };
  }

  private async writeDashboardCache<T>(
    companyId: string,
    queryType: DashboardRevalidateQueryType,
    value: T,
  ): Promise<void> {
    const payload: DashboardCachedPayload<T> = {
      value,
      generatedAt: Date.now(),
    };

    await Promise.all([
      this.cacheManager.set(
        this.buildDashboardCacheKey(companyId, queryType),
        payload,
        DASHBOARD_CACHE_TTL_MS,
      ),
      this.cacheManager.set(
        this.buildDashboardStaleCacheKey(companyId, queryType),
        payload,
        DASHBOARD_CACHE_TTL_MS + DASHBOARD_CACHE_STALE_WINDOW_MS,
      ),
    ]);
  }

  private async enqueueDashboardRevalidation(
    companyId: string,
    queryType: DashboardRevalidateQueryType,
  ): Promise<void> {
    if (!this.dashboardRevalidateQueue) {
      this.recordDashboardRevalidationMetric({
        companyId,
        queryType,
        outcome: 'queue_unavailable',
      });
      return;
    }

    try {
      await this.dashboardRevalidateQueue.add(
        'revalidate',
        { companyId, queryType },
        {
          jobId: `dashboard-revalidate:${companyId}:${queryType}`,
          removeOnComplete: 20,
          removeOnFail: 20,
        },
      );
      this.recordDashboardRevalidationMetric({
        companyId,
        queryType,
        outcome: 'enqueued',
      });
    } catch (error) {
      this.recordDashboardRevalidationMetric({
        companyId,
        queryType,
        outcome: 'enqueue_failed',
      });
      this.logger.warn(
        `[dashboard.cache] Falha ao enfileirar revalidação ${queryType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private toPercent(value: number, total: number): number {
    if (!total) {
      return 0;
    }
    return Math.round((value / total) * 10000) / 100;
  }

  private recordDashboardCacheRequestMetric(input: {
    companyId: string;
    queryType: DashboardRevalidateQueryType;
    outcome: 'hit' | 'stale' | 'miss' | 'bypass';
  }): void {
    try {
      this.domainMetrics?.cache_requests_total?.add(1, {
        company_id: input.companyId || 'unknown',
        query_type: input.queryType,
        outcome: input.outcome,
      });
    } catch {
      // no-op: telemetria nunca pode quebrar o fluxo funcional
    }
  }

  private recordDashboardRevalidationMetric(input: {
    companyId: string;
    queryType: DashboardRevalidateQueryType;
    outcome:
      | 'enqueued'
      | 'queue_unavailable'
      | 'enqueue_failed'
      | 'processed'
      | 'failed';
  }): void {
    try {
      this.domainMetrics?.cache_revalidations_total?.add(1, {
        company_id: input.companyId || 'unknown',
        query_type: input.queryType,
        outcome: input.outcome,
      });
    } catch {
      // no-op: telemetria nunca pode quebrar o fluxo funcional
    }
  }
}
