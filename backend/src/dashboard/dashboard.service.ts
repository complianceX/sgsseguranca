import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
import { DashboardQuerySnapshotService } from './dashboard-query-snapshot.service';
import {
  DASHBOARD_CACHE_STALE_WINDOW_MS,
  DASHBOARD_CACHE_TTL_MS,
  DashboardCachedPayload,
  DashboardMetaSource,
  DashboardQueryType,
  DashboardResponseMeta,
} from './dashboard-query.types';
import { MonthlySnapshot } from './entities/monthly-snapshot.entity';
import { DashboardDocumentPendenciesService } from './dashboard-document-pendencies.service';
import { profileStage } from '../common/observability/perf-stage.util';
import {
  DashboardDocumentPendencyOperationsService,
  DashboardDocumentPendencyResolvedActionResponse,
} from './dashboard-document-pendency-operations.service';
import { DashboardOperationalNotifierService } from './dashboard-operational-notifier.service';
import { DashboardPendingQueueService } from './dashboard-pending-queue.service';
import { RedisService } from '../common/redis/redis.service';
import { TenantService } from '../common/tenant/tenant.service';

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

export type DashboardRevalidateQueryType = DashboardQueryType;
export const DASHBOARD_DOMAIN_METRICS = 'DASHBOARD_DOMAIN_METRICS';

type DashboardQueryExecutionOptions = {
  bypassCache?: boolean;
  skipBypassMetric?: boolean;
  skipCacheWrite?: boolean;
};

type TenantScope = {
  companyId: string;
  siteId?: string;
  siteScope: 'single' | 'all';
  isSuperAdmin: boolean;
};

type DashboardRiskSummary = {
  alto: number;
  medio: number;
  baixo: number;
};

type DashboardEvidenceSummary = {
  total: number;
  inspections: number;
  nonconformities: number;
  audits: number;
};

type DashboardSummarySqlStatsRow = {
  users?: number | string | null;
  companies?: number | string | null;
  sites?: number | string | null;
  checklists?: number | string | null;
  aprs?: number | string | null;
  pts?: number | string | null;
  pendingAprs?: number | string | null;
  pendingPts?: number | string | null;
  pendingChecklists?: number | string | null;
  pendingNonConformities?: number | string | null;
  aprModels?: number | string | null;
  ddsModels?: number | string | null;
  checklistModels?: number | string | null;
  expiringEpis?: unknown;
  expiringTrainings?: unknown;
  riskSummary?: unknown;
  evidenceSummary?: unknown;
};

type DashboardSummarySqlDetailsRow = {
  actionPlanItems?: unknown;
  recentActivities?: unknown;
  siteCompliance?: unknown;
  recentReports?: unknown;
};

type DashboardKpisSqlStatsRow = {
  aprCount?: number | string | null;
  aprBeforeTaskCount?: number | string | null;
  inspectionsCount?: number | string | null;
  completedInspectionsCount?: number | string | null;
  trainingsCount?: number | string | null;
  validTrainingsCount?: number | string | null;
  recurringNc?: number | string | null;
  incidents?: number | string | null;
  blockedPts?: number | string | null;
};

type DashboardKpisSqlDetailsRow = {
  riskTrend?: unknown;
  ncTrend?: unknown;
  alerts?: unknown;
};

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
  private readonly queryInFlightByCacheKey = new Map<
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
    private readonly dashboardQuerySnapshotService: DashboardQuerySnapshotService,
    private readonly dashboardDocumentPendenciesService: DashboardDocumentPendenciesService,
    private readonly dashboardDocumentPendencyOperationsService: DashboardDocumentPendencyOperationsService,
    private readonly dashboardOperationalNotifierService: DashboardOperationalNotifierService,
    private readonly redisService: RedisService,
    private readonly tenantService: TenantService,
    @Optional()
    @InjectQueue('dashboard-revalidate')
    private readonly dashboardRevalidateQueue?: Queue,
    @Optional()
    @Inject(DASHBOARD_DOMAIN_METRICS)
    private readonly domainMetrics?: Record<string, Counter>,
  ) {}

  private getTenantScopeOrThrow(): TenantScope {
    const context = this.tenantService.getContext();
    if (!context?.companyId) {
      throw new BadRequestException('Contexto de empresa nao definido.');
    }
    const siteScope = context.siteScope ?? 'single';
    return {
      companyId: context.companyId,
      siteId: context.siteId,
      siteScope,
      isSuperAdmin: context.isSuperAdmin,
    };
  }

  async getSummary(
    companyId: string,
    options?: DashboardQueryExecutionOptions,
  ) {
    const scope = this.getTenantScopeOrThrow();
    const bypassSharedCache = this.shouldBypassSharedDashboardCache(scope);

    return this.executeDashboardQuery({
      companyId,
      queryType: 'summary',
      perfRoute: '/dashboard/summary',
      options: {
        ...options,
        bypassCache: options?.bypassCache || bypassSharedCache,
        skipCacheWrite: options?.skipCacheWrite || bypassSharedCache,
      },
      builder: () => this.buildSummaryPayload(companyId, scope),
    });
  }

  private async buildSummaryPayload(companyId: string, scope: TenantScope) {
    if (this.isMissingRequiredSiteScope(scope)) {
      this.logger.warn(
        `[dashboard.summary] Usuario site-scoped sem obra atribuida; retornando payload vazio para company ${companyId}.`,
      );
      return this.createEmptySummaryPayload();
    }

    const now = new Date();
    const warningLimit = new Date(now);
    warningLimit.setDate(now.getDate() + 30);

    if (scope.isSuperAdmin || scope.siteScope === 'all') {
      try {
        const sqlPayload = await this.tryBuildSummaryPayloadFromSql({
          companyId,
          warningLimit,
        });
        if (sqlPayload) {
          return sqlPayload;
        }
      } catch (error) {
        this.logger.warn(
          `[dashboard.summary] Falha ao montar summary via SQL otimizado, usando fallback legado: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return this.buildSummaryPayloadLegacy(companyId, {
      now,
      warningLimit,
    });
  }

  private async buildSummaryPayloadLegacy(
    companyId: string,
    input: {
      now: Date;
      warningLimit: Date;
    },
  ) {
    const perfRoute = '/dashboard/summary';
    const { warningLimit } = input;
    const scope = this.getTenantScopeOrThrow();
    const siteScopedWhere =
      !scope.isSuperAdmin && scope.siteScope !== 'all'
        ? { company_id: companyId, site_id: scope.siteId }
        : { company_id: companyId };
    const currentSiteWhere =
      !scope.isSuperAdmin && scope.siteScope !== 'all'
        ? { id: scope.siteId }
        : { company_id: companyId };

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
          safe(this.usersRepository.count({ where: siteScopedWhere }), 0),
          safe(
            companyId
              ? this.companiesRepository.count({ where: { id: companyId } })
              : Promise.resolve(0),
            0,
          ),
          safe(
            this.sitesRepository.count({ where: currentSiteWhere as never }),
            0,
          ),
          safe(
            this.checklistsRepository.count({
              where: siteScopedWhere as never,
            }),
            0,
          ),
          safe(
            this.aprsRepository.count({ where: siteScopedWhere as never }),
            0,
          ),
          safe(
            this.ptsRepository.count({ where: siteScopedWhere as never }),
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
            !scope.isSuperAdmin && scope.siteScope !== 'all'
              ? this.trainingsRepository
                  .createQueryBuilder('training')
                  .leftJoinAndSelect('training.user', 'user')
                  .where('training.company_id = :companyId', { companyId })
                  .andWhere('user.company_id = :companyId', { companyId })
                  .andWhere('user.site_id = :siteId', { siteId: scope.siteId })
                  .andWhere('training.data_vencimento <= :warningLimit', {
                    warningLimit,
                  })
                  .orderBy('training.data_vencimento', 'ASC')
                  .limit(5)
                  .getMany()
              : this.trainingsRepository.find({
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
              where: {
                ...siteScopedWhere,
                status: AprStatus.PENDENTE,
              } as never,
            }),
            0,
          ),
          safe(
            this.ptsRepository.count({
              where: { ...siteScopedWhere, status: 'Pendente' } as never,
            }),
            0,
          ),
          safe(
            this.checklistsRepository.count({
              where: { ...siteScopedWhere, status: 'Pendente' } as never,
            }),
            0,
          ),
          safe(
            this.nonConformitiesRepository
              .createQueryBuilder('nc')
              .where('nc.company_id = :companyId', { companyId })
              .andWhere(
                !scope.isSuperAdmin && scope.siteScope !== 'all'
                  ? 'nc.site_id = :siteId'
                  : '1=1',
                !scope.isSuperAdmin && scope.siteScope !== 'all'
                  ? { siteId: scope.siteId }
                  : {},
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
              .getCount(),
            0,
          ),
          safe(
            this.inspectionsRepository.find({
              where: siteScopedWhere as never,
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
              where: siteScopedWhere as never,
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
              where: siteScopedWhere as never,
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
              where: siteScopedWhere as never,
              select: ['id', 'titulo', 'created_at', 'updated_at'],
              order: { updated_at: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.ptsRepository.find({
              where: siteScopedWhere as never,
              select: ['id', 'titulo', 'created_at', 'updated_at'],
              order: { updated_at: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.checklistsRepository.find({
              where: siteScopedWhere as never,
              select: ['id', 'titulo', 'created_at', 'updated_at'],
              order: { updated_at: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.inspectionsRepository.find({
              where: siteScopedWhere as never,
              select: ['id', 'setor_area', 'created_at', 'updated_at'],
              order: { updated_at: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.auditsRepository.find({
              where: siteScopedWhere as never,
              select: ['id', 'titulo', 'created_at', 'updated_at'],
              order: { updated_at: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            this.nonConformitiesRepository.find({
              where: siteScopedWhere as never,
              select: ['id', 'codigo_nc', 'created_at', 'updated_at'],
              order: { updated_at: 'DESC' },
              take: 5,
            }),
            [],
          ),
          safe(
            !scope.isSuperAdmin && scope.siteScope !== 'all'
              ? this.trainingsRepository
                  .createQueryBuilder('training')
                  .leftJoinAndSelect('training.user', 'user')
                  .where('training.company_id = :companyId', { companyId })
                  .andWhere('user.company_id = :companyId', { companyId })
                  .andWhere('user.site_id = :siteId', { siteId: scope.siteId })
                  .orderBy('training.data_conclusao', 'DESC')
                  .limit(5)
                  .getMany()
              : this.trainingsRepository.find({
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
              .andWhere(
                !scope.isSuperAdmin && scope.siteScope !== 'all'
                  ? 'checklist.site_id = :siteId'
                  : '1=1',
                !scope.isSuperAdmin && scope.siteScope !== 'all'
                  ? { siteId: scope.siteId }
                  : {},
              )
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

    return response;
  }

  private async tryBuildSummaryPayloadFromSql(input: {
    companyId: string;
    warningLimit: Date;
  }): Promise<Record<string, unknown> | null> {
    const statsRow = await this.querySingleRow<DashboardSummarySqlStatsRow>(
      `
        SELECT
          (SELECT COUNT(*)::int
             FROM "users" u
            WHERE u."company_id" = $1
              AND u."deleted_at" IS NULL) AS "users",
          (SELECT COUNT(*)::int
             FROM "companies" c
            WHERE c."id" = $1
              AND c."deleted_at" IS NULL) AS "companies",
          (SELECT COUNT(*)::int
             FROM "sites" s
            WHERE s."company_id" = $1
              AND s."deleted_at" IS NULL) AS "sites",
          (SELECT COUNT(*)::int
             FROM "checklists" checklist
            WHERE checklist."company_id" = $1
              AND checklist."deleted_at" IS NULL) AS "checklists",
          (SELECT COUNT(*)::int
             FROM "aprs" apr
            WHERE apr."company_id" = $1
              AND apr."deleted_at" IS NULL) AS "aprs",
          (SELECT COUNT(*)::int
             FROM "pts" pt
            WHERE pt."company_id" = $1
              AND pt."deleted_at" IS NULL) AS "pts",
          (SELECT COUNT(*)::int
             FROM "aprs" apr
            WHERE apr."company_id" = $1
              AND apr."deleted_at" IS NULL
              AND apr."status" = $2) AS "pendingAprs",
          (SELECT COUNT(*)::int
             FROM "pts" pt
            WHERE pt."company_id" = $1
              AND pt."deleted_at" IS NULL
              AND pt."status" = 'Pendente') AS "pendingPts",
          (SELECT COUNT(*)::int
             FROM "checklists" checklist
            WHERE checklist."company_id" = $1
              AND checklist."deleted_at" IS NULL
              AND checklist."status" = 'Pendente') AS "pendingChecklists",
          (SELECT COUNT(*)::int
             FROM "nonconformities" nc
            WHERE nc."company_id" = $1
              AND nc."deleted_at" IS NULL
              AND LOWER(COALESCE(nc."status", '')) NOT IN (
                'encerrada',
                'concluída',
                'concluida',
                'fechada'
              )) AS "pendingNonConformities",
          (SELECT COUNT(*)::int
             FROM "aprs" apr
            WHERE apr."company_id" = $1
              AND apr."deleted_at" IS NULL
              AND apr."is_modelo" = true) AS "aprModels",
          (SELECT COUNT(*)::int
             FROM "dds" dds
            WHERE dds."company_id" = $1
              AND dds."deleted_at" IS NULL
              AND dds."is_modelo" = true) AS "ddsModels",
          (SELECT COUNT(*)::int
             FROM "checklists" checklist
            WHERE checklist."company_id" = $1
              AND checklist."deleted_at" IS NULL
              AND checklist."is_modelo" = true) AS "checklistModels",
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', epi."id",
                'nome', epi."nome",
                'ca', epi."ca",
                'validade_ca', epi."validade_ca"
              )
              ORDER BY epi."validade_ca" ASC
            )
            FROM (
              SELECT "id", "nome", "ca", "validade_ca"
                FROM "epis"
               WHERE "company_id" = $1
                 AND "deleted_at" IS NULL
                 AND "validade_ca" IS NOT NULL
                 AND "validade_ca" <= $3
               ORDER BY "validade_ca" ASC
               LIMIT 5
            ) epi
          ), '[]'::jsonb) AS "expiringEpis",
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', training."id",
                'nome', training."nome",
                'data_vencimento', training."data_vencimento",
                'user', jsonb_build_object('nome', training."user_nome")
              )
              ORDER BY training."data_vencimento" ASC
            )
            FROM (
              SELECT t."id", t."nome", t."data_vencimento", u."nome" AS "user_nome"
                FROM "trainings" t
                LEFT JOIN "users" u
                       ON u."id" = t."user_id"
                      AND u."deleted_at" IS NULL
               WHERE t."company_id" = $1
                 AND t."deleted_at" IS NULL
                 AND t."data_vencimento" <= $3
               ORDER BY t."data_vencimento" ASC
               LIMIT 5
            ) training
          ), '[]'::jsonb) AS "expiringTrainings",
          COALESCE((
            SELECT jsonb_build_object(
              'alto', COUNT(*) FILTER (WHERE risk."normalized" LIKE '%alto%'),
              'medio', COUNT(*) FILTER (
                WHERE risk."normalized" LIKE '%medio%'
                   OR risk."normalized" LIKE '%médio%'
              ),
              'baixo', COUNT(*) FILTER (WHERE risk."normalized" LIKE '%baixo%')
            )
            FROM (
              SELECT LOWER(COALESCE(risk_item->>'classificacao_risco', '')) AS "normalized"
                FROM "inspections" inspection
                CROSS JOIN LATERAL jsonb_array_elements(
                  COALESCE(inspection."perigos_riscos", '[]'::jsonb)
                ) risk_item
               WHERE inspection."company_id" = $1
                 AND inspection."deleted_at" IS NULL
              UNION ALL
              SELECT LOWER(COALESCE(nc."risco_nivel", '')) AS "normalized"
                FROM "nonconformities" nc
               WHERE nc."company_id" = $1
                 AND nc."deleted_at" IS NULL
            ) risk
          ), '{"alto":0,"medio":0,"baixo":0}'::jsonb) AS "riskSummary",
          (
            SELECT jsonb_build_object(
              'inspections', inspections_total,
              'nonconformities', nonconformities_total,
              'audits', audits_total,
              'total', inspections_total + nonconformities_total + audits_total
            )
            FROM (
              SELECT
                COALESCE((
                  SELECT SUM(jsonb_array_length(COALESCE(inspection."evidencias", '[]'::jsonb)))::int
                    FROM "inspections" inspection
                   WHERE inspection."company_id" = $1
                     AND inspection."deleted_at" IS NULL
                ), 0) AS inspections_total,
                COALESCE((
                  SELECT SUM(jsonb_array_length(COALESCE(nc."anexos", '[]'::jsonb)))::int
                    FROM "nonconformities" nc
                   WHERE nc."company_id" = $1
                     AND nc."deleted_at" IS NULL
                ), 0) AS nonconformities_total,
                COALESCE((
                  SELECT SUM(jsonb_array_length(COALESCE(audit."resultados_nao_conformidades", '[]'::jsonb)))::int
                    FROM "audits" audit
                   WHERE audit."company_id" = $1
                     AND audit."deleted_at" IS NULL
                ), 0) AS audits_total
            ) evidence_totals
          ) AS "evidenceSummary"
      `,
      [input.companyId, AprStatus.PENDENTE, input.warningLimit],
    );

    if (!statsRow) {
      return null;
    }

    const detailsRow = await this.querySingleRow<DashboardSummarySqlDetailsRow>(
      `
        SELECT
          COALESCE((
            SELECT jsonb_agg(action_item ORDER BY action_item."sort_date" ASC NULLS LAST)
            FROM (
              SELECT *
              FROM (
                SELECT
                  CONCAT('inspection-', inspection."id", '-', inspection_action."ordinality" - 1) AS "id",
                  'Inspeção' AS "source",
                  inspection."setor_area" AS "title",
                  COALESCE(inspection_action."value"->>'acao', '') AS "action",
                  NULLIF(inspection_action."value"->>'responsavel', '') AS "responsavel",
                  NULLIF(inspection_action."value"->>'prazo', '') AS "prazo",
                  NULLIF(inspection_action."value"->>'status', '') AS "status",
                  CONCAT('/dashboard/inspections/edit/', inspection."id") AS "href",
                  CASE
                    WHEN NULLIF(inspection_action."value"->>'prazo', '') IS NOT NULL
                      THEN (inspection_action."value"->>'prazo')::timestamp
                    ELSE NULL
                  END AS "sort_date"
                FROM "inspections" inspection
                CROSS JOIN LATERAL jsonb_array_elements(
                  COALESCE(inspection."plano_acao", '[]'::jsonb)
                ) WITH ORDINALITY AS inspection_action("value", "ordinality")
                WHERE inspection."company_id" = $1
                  AND inspection."deleted_at" IS NULL
                  AND COALESCE(inspection_action."value"->>'acao', '') <> ''

                UNION ALL

                SELECT
                  CONCAT('audit-', audit."id", '-', audit_action."ordinality" - 1) AS "id",
                  'Auditoria' AS "source",
                  audit."titulo" AS "title",
                  COALESCE(audit_action."value"->>'acao', '') AS "action",
                  NULLIF(audit_action."value"->>'responsavel', '') AS "responsavel",
                  NULLIF(audit_action."value"->>'prazo', '') AS "prazo",
                  NULLIF(audit_action."value"->>'status', '') AS "status",
                  CONCAT('/dashboard/audits/edit/', audit."id") AS "href",
                  CASE
                    WHEN NULLIF(audit_action."value"->>'prazo', '') IS NOT NULL
                      THEN (audit_action."value"->>'prazo')::timestamp
                    ELSE NULL
                  END AS "sort_date"
                FROM "audits" audit
                CROSS JOIN LATERAL jsonb_array_elements(
                  COALESCE(audit."plano_acao", '[]'::jsonb)
                ) WITH ORDINALITY AS audit_action("value", "ordinality")
                WHERE audit."company_id" = $1
                  AND audit."deleted_at" IS NULL
                  AND COALESCE(audit_action."value"->>'acao', '') <> ''

                UNION ALL

                SELECT
                  CONCAT('nc-imediata-', nc."id") AS "id",
                  'Não Conformidade' AS "source",
                  nc."codigo_nc" AS "title",
                  nc."acao_imediata_descricao" AS "action",
                  nc."acao_imediata_responsavel" AS "responsavel",
                  CASE
                    WHEN nc."acao_imediata_data" IS NOT NULL
                      THEN nc."acao_imediata_data"::text
                    ELSE NULL
                  END AS "prazo",
                  COALESCE(nc."acao_imediata_status", nc."status") AS "status",
                  CONCAT('/dashboard/nonconformities/edit/', nc."id") AS "href",
                  nc."acao_imediata_data"::timestamp AS "sort_date"
                FROM "nonconformities" nc
                WHERE nc."company_id" = $1
                  AND nc."deleted_at" IS NULL
                  AND nc."acao_imediata_descricao" IS NOT NULL

                UNION ALL

                SELECT
                  CONCAT('nc-definitiva-', nc."id") AS "id",
                  'Não Conformidade' AS "source",
                  nc."codigo_nc" AS "title",
                  nc."acao_definitiva_descricao" AS "action",
                  nc."acao_definitiva_responsavel" AS "responsavel",
                  COALESCE(
                    nc."acao_definitiva_prazo"::text,
                    nc."acao_definitiva_data_prevista"::text
                  ) AS "prazo",
                  nc."status" AS "status",
                  CONCAT('/dashboard/nonconformities/edit/', nc."id") AS "href",
                  COALESCE(
                    nc."acao_definitiva_prazo"::timestamp,
                    nc."acao_definitiva_data_prevista"::timestamp
                  ) AS "sort_date"
                FROM "nonconformities" nc
                WHERE nc."company_id" = $1
                  AND nc."deleted_at" IS NULL
                  AND nc."acao_definitiva_descricao" IS NOT NULL
              ) raw_action_item
              ORDER BY raw_action_item."sort_date" ASC NULLS LAST
              LIMIT 6
            ) action_item
          ), '[]'::jsonb) AS "actionPlanItems",

          COALESCE((
            SELECT jsonb_agg(activity ORDER BY activity."date" DESC)
            FROM (
              SELECT *
              FROM (
                SELECT *
                FROM (
                  SELECT CONCAT('apr-', apr."id") AS "id",
                         'APR atualizada' AS "title",
                         apr."titulo" AS "description",
                         COALESCE(apr."updated_at", apr."created_at") AS "date",
                         '/dashboard/aprs' AS "href",
                         'bg-stone-500' AS "color"
                    FROM "aprs" apr
                   WHERE apr."company_id" = $1
                     AND apr."deleted_at" IS NULL
                   ORDER BY apr."updated_at" DESC
                   LIMIT 5
                ) apr_activity

                UNION ALL

                SELECT *
                FROM (
                  SELECT CONCAT('pt-', pt."id") AS "id",
                         'PT atualizada' AS "title",
                         pt."titulo" AS "description",
                         COALESCE(pt."updated_at", pt."created_at") AS "date",
                         '/dashboard/pts' AS "href",
                         'bg-zinc-500' AS "color"
                    FROM "pts" pt
                   WHERE pt."company_id" = $1
                     AND pt."deleted_at" IS NULL
                   ORDER BY pt."updated_at" DESC
                   LIMIT 5
                ) pt_activity

                UNION ALL

                SELECT *
                FROM (
                  SELECT CONCAT('checklist-', checklist."id") AS "id",
                         'Checklist atualizado' AS "title",
                         checklist."titulo" AS "description",
                         COALESCE(checklist."updated_at", checklist."created_at") AS "date",
                         '/dashboard/checklists' AS "href",
                         'bg-emerald-500' AS "color"
                    FROM "checklists" checklist
                   WHERE checklist."company_id" = $1
                     AND checklist."deleted_at" IS NULL
                   ORDER BY checklist."updated_at" DESC
                   LIMIT 5
                ) checklist_activity

                UNION ALL

                SELECT *
                FROM (
                  SELECT CONCAT('inspection-', inspection."id") AS "id",
                         'Inspeção registrada' AS "title",
                         inspection."setor_area" AS "description",
                         COALESCE(inspection."updated_at", inspection."created_at") AS "date",
                         '/dashboard/inspections' AS "href",
                         'bg-amber-500' AS "color"
                    FROM "inspections" inspection
                   WHERE inspection."company_id" = $1
                     AND inspection."deleted_at" IS NULL
                   ORDER BY inspection."updated_at" DESC
                   LIMIT 5
                ) inspection_activity

                UNION ALL

                SELECT *
                FROM (
                  SELECT CONCAT('audit-', audit."id") AS "id",
                         'Auditoria registrada' AS "title",
                         audit."titulo" AS "description",
                         COALESCE(audit."updated_at", audit."created_at") AS "date",
                         '/dashboard/audits' AS "href",
                         'bg-orange-500' AS "color"
                    FROM "audits" audit
                   WHERE audit."company_id" = $1
                     AND audit."deleted_at" IS NULL
                   ORDER BY audit."updated_at" DESC
                   LIMIT 5
                ) audit_activity

                UNION ALL

                SELECT *
                FROM (
                  SELECT CONCAT('nc-', nc."id") AS "id",
                         'Não conformidade atualizada' AS "title",
                         nc."codigo_nc" AS "description",
                         COALESCE(nc."updated_at", nc."created_at") AS "date",
                         '/dashboard/nonconformities' AS "href",
                         'bg-red-500' AS "color"
                    FROM "nonconformities" nc
                   WHERE nc."company_id" = $1
                     AND nc."deleted_at" IS NULL
                   ORDER BY nc."updated_at" DESC
                   LIMIT 5
                ) nonconformity_activity

                UNION ALL

                SELECT *
                FROM (
                  SELECT CONCAT('training-', training."id") AS "id",
                         'Treinamento registrado' AS "title",
                         training."nome" AS "description",
                         training."data_conclusao" AS "date",
                         '/dashboard/trainings' AS "href",
                         'bg-neutral-500' AS "color"
                    FROM "trainings" training
                   WHERE training."company_id" = $1
                     AND training."deleted_at" IS NULL
                   ORDER BY training."data_conclusao" DESC
                   LIMIT 5
                ) training_activity
              ) raw_activity
              WHERE raw_activity."date" IS NOT NULL
              ORDER BY raw_activity."date" DESC
              LIMIT 6
            ) activity
          ), '[]'::jsonb) AS "recentActivities",

          COALESCE((
            SELECT jsonb_agg(site_row ORDER BY site_row."taxa" DESC)
            FROM (
              SELECT
                COALESCE(checklist."site_id"::text, 'without-site') AS "id",
                COALESCE(site."nome", 'Sem obra') AS "nome",
                COUNT(checklist."id")::int AS "total",
                SUM(CASE WHEN checklist."status" = 'Conforme' THEN 1 ELSE 0 END)::int AS "conformes",
                CASE
                  WHEN COUNT(checklist."id") > 0
                    THEN ROUND((SUM(CASE WHEN checklist."status" = 'Conforme' THEN 1 ELSE 0 END)::numeric / COUNT(checklist."id")::numeric) * 100)
                  ELSE 0
                END::int AS "taxa"
              FROM "checklists" checklist
              LEFT JOIN "sites" site
                     ON site."id" = checklist."site_id"
                    AND site."deleted_at" IS NULL
              WHERE checklist."company_id" = $1
                AND checklist."deleted_at" IS NULL
              GROUP BY checklist."site_id", site."nome"
              ORDER BY "taxa" DESC
              LIMIT 5
            ) site_row
          ), '[]'::jsonb) AS "siteCompliance",

          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', report."id",
                'titulo', report."titulo",
                'mes', report."mes",
                'ano', report."ano",
                'created_at', report."created_at"
              )
              ORDER BY report."created_at" DESC
            )
            FROM (
              SELECT "id", "titulo", "mes", "ano", "created_at"
                FROM "reports"
               WHERE "company_id" = $1
               ORDER BY "created_at" DESC
               LIMIT 4
            ) report
          ), '[]'::jsonb) AS "recentReports"
      `,
      [input.companyId],
    );

    if (!detailsRow) {
      return null;
    }

    const riskSummary = this.normalizeRiskSummary(statsRow.riskSummary);
    const evidenceSummary = this.normalizeEvidenceSummary(
      statsRow.evidenceSummary,
    );

    return {
      counts: {
        users: Number(statsRow.users || 0),
        companies: Number(statsRow.companies || 0),
        sites: Number(statsRow.sites || 0),
        checklists: Number(statsRow.checklists || 0),
        aprs: Number(statsRow.aprs || 0),
        pts: Number(statsRow.pts || 0),
      },
      expiringEpis: this.normalizeJsonArray(statsRow.expiringEpis),
      expiringTrainings: this.normalizeJsonArray(statsRow.expiringTrainings),
      pendingApprovals: {
        aprs: Number(statsRow.pendingAprs || 0),
        pts: Number(statsRow.pendingPts || 0),
        checklists: Number(statsRow.pendingChecklists || 0),
        nonconformities: Number(statsRow.pendingNonConformities || 0),
      },
      actionPlanItems: this.normalizeJsonArray(detailsRow.actionPlanItems),
      riskSummary,
      evidenceSummary,
      modelCounts: {
        aprs: Number(statsRow.aprModels || 0),
        dds: Number(statsRow.ddsModels || 0),
        checklists: Number(statsRow.checklistModels || 0),
      },
      recentActivities: this.normalizeJsonArray(detailsRow.recentActivities),
      siteCompliance: this.normalizeJsonArray(detailsRow.siteCompliance),
      recentReports: this.normalizeJsonArray(detailsRow.recentReports),
    };
  }

  async getKpis(
    companyId: string,
    userId?: string,
    _options?: DashboardQueryExecutionOptions,
  ) {
    const payload = await this.buildKpisPayload(companyId, userId);
    return this.attachDashboardMeta(payload, {
      generatedAt: new Date().toISOString(),
      stale: false,
      source: 'live',
    });
  }

  private async buildKpisPayload(companyId: string, userId?: string) {
    const scope = this.getTenantScopeOrThrow();
    if (!scope.isSuperAdmin && scope.siteScope !== 'all') {
      return this.buildKpisPayloadLegacy(companyId, {
        userId,
        now: new Date(),
        monthStart: new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        ),
        nextMonth: new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          1,
        ),
      });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    try {
      const sqlPayload = await this.tryBuildKpisPayloadFromSql({
        companyId,
        userId,
        now,
        monthStart,
        nextMonth,
      });
      if (sqlPayload) {
        return sqlPayload;
      }
    } catch (error) {
      this.logger.warn(
        `[dashboard.kpis] Falha ao montar KPI via SQL otimizado, usando fallback legado: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return this.buildKpisPayloadLegacy(companyId, {
      userId,
      now,
      monthStart,
      nextMonth,
    });
  }

  private async buildKpisPayloadLegacy(
    companyId: string,
    input: {
      userId?: string;
      now: Date;
      monthStart: Date;
      nextMonth: Date;
    },
  ) {
    const { now, monthStart, nextMonth } = input;
    const scope = this.getTenantScopeOrThrow();
    const siteScopedWhere =
      !scope.isSuperAdmin && scope.siteScope !== 'all'
        ? { company_id: companyId, site_id: scope.siteId }
        : { company_id: companyId };

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
          where: siteScopedWhere as never,
        }),
        0,
      ),
      safe(
        this.aprsRepository
          .createQueryBuilder('apr')
          .where('apr.company_id = :companyId', { companyId })
          .andWhere(
            !scope.isSuperAdmin && scope.siteScope !== 'all'
              ? 'apr.site_id = :siteId'
              : '1=1',
            !scope.isSuperAdmin && scope.siteScope !== 'all'
              ? { siteId: scope.siteId }
              : {},
          )
          .andWhere('apr.created_at IS NOT NULL')
          .andWhere('apr.data_inicio IS NOT NULL')
          .andWhere('apr.created_at <= apr.data_inicio')
          .getCount(),
        0,
      ),
      safe(
        this.inspectionsRepository.find({
          where: siteScopedWhere as never,
          select: ['id', 'plano_acao'],
        }),
        [],
      ),
      safe(
        !scope.isSuperAdmin && scope.siteScope !== 'all'
          ? this.trainingsRepository
              .createQueryBuilder('training')
              .innerJoin('training.user', 'user')
              .where('training.company_id = :companyId', { companyId })
              .andWhere('user.company_id = :companyId', { companyId })
              .andWhere('user.site_id = :siteId', { siteId: scope.siteId })
              .getCount()
          : this.trainingsRepository.count({
              where: { company_id: companyId } as never,
            }),
        0,
      ),
      safe(
        !scope.isSuperAdmin && scope.siteScope !== 'all'
          ? this.trainingsRepository
              .createQueryBuilder('training')
              .innerJoin('training.user', 'user')
              .where('training.company_id = :companyId', { companyId })
              .andWhere('training.deleted_at IS NULL')
              .andWhere('training.data_vencimento >= :now', { now })
              .andWhere('user.company_id = :companyId', { companyId })
              .andWhere('user.site_id = :siteId', { siteId: scope.siteId })
              .getCount()
          : this.trainingsRepository
              .createQueryBuilder('training')
              .where('training.company_id = :companyId', { companyId })
              .andWhere('training.deleted_at IS NULL')
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
          .andWhere(
            !scope.isSuperAdmin && scope.siteScope !== 'all'
              ? 'nc.site_id = :siteId'
              : '1=1',
            !scope.isSuperAdmin && scope.siteScope !== 'all'
              ? { siteId: scope.siteId }
              : {},
          )
          .groupBy('nc.codigo_nc')
          .having('COUNT(nc.id) > 1')
          .getRawMany<{ codigo_nc: string; total: string }>(),
        [],
      ),
      safe(
        this.catsRepository.count({
          where: siteScopedWhere as never,
        }),
        0,
      ),
      safe(
        this.ptsRepository.count({
          where: {
            ...(siteScopedWhere as Record<string, unknown>),
            status: 'Pendente',
            residual_risk: 'CRITICAL',
            control_evidence: false,
          } as never,
        }),
        0,
      ),
      safe(
        input.userId
          ? this.notificationsRepository
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
              .andWhere('notification.userId = :userId', {
                userId: input.userId,
              })
              .orderBy('notification.createdAt', 'DESC')
              .take(10)
              .getMany()
          : Promise.resolve([]),
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
      (accumulator: number, row: { total: string }) =>
        accumulator + Number(row.total),
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
      alerts: (unreadAlerts ?? []).map((notification: Notification) => ({
        id: notification.id,
        type: notification.type,
        message: notification.message,
        created_at: notification.createdAt,
        read: notification.read,
      })),
    };
  }

  private async tryBuildKpisPayloadFromSql(input: {
    companyId: string;
    userId?: string;
    now: Date;
    monthStart: Date;
    nextMonth: Date;
  }): Promise<Record<string, unknown> | null> {
    const statsRow = await this.querySingleRow<DashboardKpisSqlStatsRow>(
      `
        SELECT
          (SELECT COUNT(*)::int
             FROM "aprs" apr
            WHERE apr."company_id" = $1
              AND apr."deleted_at" IS NULL) AS "aprCount",
          (SELECT COUNT(*)::int
             FROM "aprs" apr
            WHERE apr."company_id" = $1
              AND apr."deleted_at" IS NULL
              AND apr."created_at" IS NOT NULL
              AND apr."data_inicio" IS NOT NULL
              AND apr."created_at" <= apr."data_inicio") AS "aprBeforeTaskCount",
          (SELECT COUNT(*)::int
             FROM "inspections" inspection
            WHERE inspection."company_id" = $1
              AND inspection."deleted_at" IS NULL) AS "inspectionsCount",
          (SELECT COUNT(*)::int
             FROM "inspections" inspection
            WHERE inspection."company_id" = $1
              AND inspection."deleted_at" IS NULL
              AND jsonb_array_length(COALESCE(inspection."plano_acao", '[]'::jsonb)) > 0
              AND NOT EXISTS (
                SELECT 1
                  FROM jsonb_array_elements(COALESCE(inspection."plano_acao", '[]'::jsonb)) action_item
                 WHERE LOWER(COALESCE(action_item->>'status', '')) NOT IN (
                   'concluída',
                   'concluida',
                   'encerrada',
                   'fechada'
                 )
              )) AS "completedInspectionsCount",
          (SELECT COUNT(*)::int
             FROM "trainings" training
            WHERE training."company_id" = $1
              AND training."deleted_at" IS NULL) AS "trainingsCount",
          (SELECT COUNT(*)::int
             FROM "trainings" training
            WHERE training."company_id" = $1
              AND training."deleted_at" IS NULL
              AND training."data_vencimento" >= $2) AS "validTrainingsCount",
          COALESCE((
            SELECT SUM(duplicate_groups.total)::int
              FROM (
                SELECT COUNT(nc."id")::int AS total
                  FROM "nonconformities" nc
                 WHERE nc."company_id" = $1
                   AND nc."deleted_at" IS NULL
                 GROUP BY nc."codigo_nc"
                HAVING COUNT(nc."id") > 1
              ) duplicate_groups
          ), 0) AS "recurringNc",
          (SELECT COUNT(*)::int
             FROM "cats" cat
            WHERE cat."company_id" = $1) AS "incidents",
          (SELECT COUNT(*)::int
             FROM "pts" pt
            WHERE pt."company_id" = $1
              AND pt."deleted_at" IS NULL
              AND pt."status" = 'Pendente'
              AND pt."residual_risk" = 'CRITICAL'
              AND pt."control_evidence" = false) AS "blockedPts"
      `,
      [input.companyId, input.now],
    );

    if (!statsRow) {
      return null;
    }

    const detailsRow = await this.querySingleRow<DashboardKpisSqlDetailsRow>(
      `
        SELECT
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'month', snapshot."month",
                'risk_score', COALESCE(snapshot."risk_score", 0)
              )
              ORDER BY snapshot."month" ASC
            )
            FROM (
              SELECT "month", "risk_score"
                FROM "monthly_snapshots"
               WHERE "company_id" = $1
               ORDER BY "month" ASC
               LIMIT 12
            ) snapshot
          ), '[]'::jsonb) AS "riskTrend",
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'month', month_bucket."month",
                'count', month_bucket."count"
              )
              ORDER BY month_bucket."month" ASC
            )
            FROM (
              SELECT to_char(date_trunc('month', nc."data_identificacao"), 'YYYY-MM') AS "month",
                     COUNT(nc."id")::int AS "count"
                FROM "nonconformities" nc
               WHERE nc."company_id" = $1
                 AND nc."deleted_at" IS NULL
                 AND nc."data_identificacao" >= $2
                 AND nc."data_identificacao" < $3
               GROUP BY date_trunc('month', nc."data_identificacao")
               ORDER BY date_trunc('month', nc."data_identificacao") ASC
            ) month_bucket
          ), '[]'::jsonb) AS "ncTrend",
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', notification."id",
                'type', notification."type",
                'message', notification."message",
                'created_at', notification."createdAt",
                'read', notification."read"
              )
              ORDER BY notification."createdAt" DESC
            )
            FROM (
              SELECT n."id", n."type", n."message", n."createdAt", n."read"
                FROM "notifications" n
                INNER JOIN "users" u
                        ON u."id" = n."userId"
                       AND u."company_id" = $1
                       AND u."deleted_at" IS NULL
               WHERE n."read" = false
                 AND n."userId" = $4
               ORDER BY n."createdAt" DESC
               LIMIT 10
            ) notification
          ), '[]'::jsonb) AS "alerts"
      `,
      [input.companyId, input.monthStart, input.nextMonth, input.userId || ''],
    );

    if (!detailsRow) {
      return null;
    }

    const aprCount = Number(statsRow.aprCount || 0);
    const aprBeforeTaskCount = Number(statsRow.aprBeforeTaskCount || 0);
    const inspectionsCount = Number(statsRow.inspectionsCount || 0);
    const completedInspectionsCount = Number(
      statsRow.completedInspectionsCount || 0,
    );
    const trainingsCount = Number(statsRow.trainingsCount || 0);
    const validTrainingsCount = Number(statsRow.validTrainingsCount || 0);

    return {
      leading: {
        apr_before_task: {
          total: aprCount,
          compliant: aprBeforeTaskCount,
          percentage: this.toPercent(aprBeforeTaskCount, aprCount),
        },
        completed_inspections: {
          total: inspectionsCount,
          completed: completedInspectionsCount,
          percentage: this.toPercent(
            completedInspectionsCount,
            inspectionsCount,
          ),
        },
        training_compliance: {
          total: trainingsCount,
          compliant: validTrainingsCount,
          percentage: this.toPercent(validTrainingsCount, trainingsCount),
        },
      },
      lagging: {
        recurring_nc: Number(statsRow.recurringNc || 0),
        incidents: Number(statsRow.incidents || 0),
        blocked_pt: Number(statsRow.blockedPts || 0),
      },
      trends: {
        risk: this.normalizeJsonArray(detailsRow.riskTrend),
        nc: this.normalizeJsonArray(detailsRow.ncTrend),
      },
      alerts: this.normalizeJsonArray(detailsRow.alerts),
    };
  }

  async getHeatmap(companyId: string) {
    const scope = this.getTenantScopeOrThrow();
    const isSingleScope = !scope.isSuperAdmin && scope.siteScope !== 'all';
    const siteScopedWhere = isSingleScope
      ? { company_id: companyId, site_id: scope.siteId }
      : { company_id: companyId };

    const [snapshots, sites] = await Promise.all([
      safe(
        this.monthlySnapshotsRepository
          .createQueryBuilder('snapshot')
          .select('snapshot.site_id', 'site_id')
          .addSelect('AVG(snapshot.risk_score)', 'risk_score')
          .addSelect('SUM(snapshot.nc_count)', 'nc_count')
          .addSelect('AVG(snapshot.training_compliance)', 'training_compliance')
          .where('snapshot.company_id = :companyId', { companyId })
          .andWhere(
            isSingleScope ? 'snapshot.site_id = :siteId' : '1=1',
            isSingleScope ? { siteId: scope.siteId } : {},
          )
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
          where: siteScopedWhere as never,
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
        .andWhere(
          isSingleScope ? 'apr.site_id = :siteId' : '1=1',
          isSingleScope ? { siteId: scope.siteId } : {},
        )
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
    const scope = this.getTenantScopeOrThrow();
    const isSingleScope = !scope.isSuperAdmin && scope.siteScope !== 'all';
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    const siteScopedWhere = isSingleScope
      ? { company_id: companyId, site_id: scope.siteId }
      : { company_id: companyId };

    const [
      pendingPts,
      nonConformities,
      inspections,
      expiringMedicalExams,
      expiringTrainings,
    ] = await Promise.all([
      safe(
        this.ptsRepository.find({
          where: { ...siteScopedWhere, status: 'Pendente' },
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
          where: siteScopedWhere as never,
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
          where: siteScopedWhere as never,
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
        isSingleScope
          ? this.medicalExamsRepository
              .createQueryBuilder('medicalExam')
              .leftJoinAndSelect('medicalExam.user', 'user')
              .select([
                'medicalExam.id',
                'medicalExam.tipo_exame',
                'medicalExam.data_vencimento',
                'medicalExam.resultado',
                'user.nome',
              ])
              .where('medicalExam.company_id = :companyId', { companyId })
              .andWhere(
                'medicalExam.data_vencimento BETWEEN :now AND :nextWeek',
                {
                  now,
                  nextWeek,
                },
              )
              .andWhere('user.company_id = :companyId', { companyId })
              .andWhere('user.site_id = :siteId', { siteId: scope.siteId })
              .orderBy('medicalExam.data_vencimento', 'ASC')
              .getMany()
          : this.medicalExamsRepository.find({
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
        isSingleScope
          ? this.trainingsRepository
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
              .andWhere('training.data_vencimento BETWEEN :now AND :nextWeek', {
                now,
                nextWeek,
              })
              .andWhere('user.company_id = :companyId', { companyId })
              .andWhere('user.site_id = :siteId', { siteId: scope.siteId })
              .orderBy('training.data_vencimento', 'ASC')
              .getMany()
          : this.trainingsRepository.find({
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
    const scope = this.getTenantScopeOrThrow();
    const bypassSharedCache = this.shouldBypassSharedDashboardCache(scope);
    const queue = await this.executeDashboardQuery({
      companyId: input.companyId,
      queryType: 'pending-queue',
      perfRoute: '/dashboard/pending-queue',
      options: {
        bypassCache: input.bypassCache || bypassSharedCache,
        skipCacheWrite: bypassSharedCache,
      },
      builder: () => this.buildPendingQueuePayload(scope),
    });

    if (!input.skipNotifications && queue.meta?.source === 'live') {
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

    return queue;
  }

  private async buildPendingQueuePayload(input: {
    companyId: string;
    siteId?: string;
    siteScope: 'single' | 'all';
    isSuperAdmin: boolean;
  }) {
    if (this.isMissingRequiredSiteScope(input)) {
      this.logger.warn(
        `[dashboard.pending-queue] Usuario site-scoped sem obra atribuida; retornando fila vazia para company ${input.companyId}.`,
      );
      return this.createEmptyPendingQueuePayload();
    }

    return this.dashboardPendingQueueService.getPendingQueue(input);
  }

  async getDocumentPendencies(input: {
    companyId?: string;
    userId?: string;
    isSuperAdmin?: boolean;
    permissions?: string[];
    filters?: {
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

    if (this.shouldNotifyDocumentPendencies(input.filters)) {
      try {
        await this.dashboardOperationalNotifierService.notifyDocumentPendencies(
          {
            userId: input.userId,
            companyId:
              response.filtersApplied.companyId || input.companyId || undefined,
            response,
          },
        );
      } catch (error) {
        this.logger.warn(
          `[dashboard.document-pendencies] Falha ao enviar notificações operacionais: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
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
      : ['summary', 'kpis', 'pending-queue'];

    await Promise.all(
      targets.map(async (target) => {
        const redis = this.redisService.getClient();
        await Promise.allSettled([
          redis.del(
            this.buildDashboardCacheKey(companyId, target),
            this.buildDashboardStaleCacheKey(companyId, target),
          ),
          this.dashboardQuerySnapshotService.invalidate(companyId, target),
        ]);
      }),
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
      } else if (queryType === 'kpis') {
        await this.getKpis(companyId);
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

  private async executeDashboardQuery<
    T extends Record<string, unknown>,
  >(input: {
    companyId: string;
    queryType: DashboardRevalidateQueryType;
    perfRoute: string;
    builder: () => Promise<T>;
    options?: DashboardQueryExecutionOptions;
  }): Promise<T & { meta?: DashboardResponseMeta }> {
    if (
      input.options?.bypassCache &&
      !input.options?.skipBypassMetric &&
      input.companyId
    ) {
      this.recordDashboardCacheRequestMetric({
        companyId: input.companyId,
        queryType: input.queryType,
        outcome: 'bypass',
        source: 'live',
      });
    }

    if (!input.options?.bypassCache && input.companyId) {
      const cached = await profileStage({
        logger: this.logger,
        route: input.perfRoute,
        stage: 'redis_read',
        companyId: input.companyId,
        run: () => this.readDashboardCache<T>(input.companyId, input.queryType),
      });

      if (cached.hit && cached.value !== undefined) {
        this.recordDashboardCacheRequestMetric({
          companyId: input.companyId,
          queryType: input.queryType,
          outcome: 'redis_hit',
          source: 'redis',
        });
        return this.attachDashboardMeta(cached.value, {
          generatedAt: new Date(cached.generatedAt || Date.now()).toISOString(),
          stale: false,
          source: 'redis',
        });
      }

      if (cached.stale && cached.value !== undefined) {
        this.recordDashboardCacheRequestMetric({
          companyId: input.companyId,
          queryType: input.queryType,
          outcome: 'stale_served',
          source: 'redis',
        });
        void this.enqueueDashboardRevalidation(
          input.companyId,
          input.queryType,
        );
        return this.attachDashboardMeta(cached.value, {
          generatedAt: new Date(cached.generatedAt || Date.now()).toISOString(),
          stale: true,
          source: 'redis',
        });
      }

      const snapshot = await profileStage({
        logger: this.logger,
        route: input.perfRoute,
        stage: 'snapshot_read',
        companyId: input.companyId,
        run: async () => {
          try {
            return await this.dashboardQuerySnapshotService.read<T>(
              input.companyId,
              input.queryType,
            );
          } catch (error) {
            this.logger.warn({
              event: 'dashboard_snapshot_read_failed',
              companyId: input.companyId,
              queryType: input.queryType,
              errorMessage:
                error instanceof Error ? error.message : String(error),
            });
            return { hit: false, stale: false };
          }
        },
      });

      if (snapshot.hit && snapshot.value !== undefined) {
        await this.writeDashboardCache(
          input.companyId,
          input.queryType,
          snapshot.value,
          new Date(snapshot.generatedAt || Date.now()),
        );
        this.recordDashboardCacheRequestMetric({
          companyId: input.companyId,
          queryType: input.queryType,
          outcome: 'snapshot_hit',
          source: 'snapshot',
        });
        return this.attachDashboardMeta(snapshot.value, {
          generatedAt: new Date(
            snapshot.generatedAt || Date.now(),
          ).toISOString(),
          stale: false,
          source: 'snapshot',
        });
      }

      if (snapshot.stale && snapshot.value !== undefined) {
        this.recordDashboardCacheRequestMetric({
          companyId: input.companyId,
          queryType: input.queryType,
          outcome: 'stale_served',
          source: 'snapshot',
        });
        void this.enqueueDashboardRevalidation(
          input.companyId,
          input.queryType,
        );
        return this.attachDashboardMeta(snapshot.value, {
          generatedAt: new Date(
            snapshot.generatedAt || Date.now(),
          ).toISOString(),
          stale: true,
          source: 'snapshot',
        });
      }

      const inFlightKey = this.buildDashboardInFlightKey(
        input.companyId,
        input.queryType,
      );
      const inFlight = this.queryInFlightByCacheKey.get(inFlightKey);
      if (inFlight) {
        return inFlight as Promise<T & { meta?: DashboardResponseMeta }>;
      }

      // Build the loader synchronously and register it in the inflight map
      // BEFORE awaiting anything. Any same-instance concurrent caller arriving
      // between this point and the first await will hit the inflight check
      // above and dedup. The distributed lock then handles the cross-instance
      // case from inside the loader.
      const loaderState: {
        current?: Promise<T & { meta?: DashboardResponseMeta }>;
      } = {};
      const loader: Promise<T & { meta?: DashboardResponseMeta }> =
        (async () => {
          let lockToken: string | null = null;
          try {
            const distributedLock = await this.tryAcquireDashboardLock(
              input.companyId,
              input.queryType,
            );

            if (!distributedLock.acquired) {
              const waited = await this.waitForDashboardCacheRefresh<T>(
                input.companyId,
                input.queryType,
              );
              if (waited.hit && waited.value !== undefined) {
                this.recordDashboardCacheRequestMetric({
                  companyId: input.companyId,
                  queryType: input.queryType,
                  outcome: 'redis_hit',
                  source: 'redis',
                });
                return this.attachDashboardMeta(waited.value, {
                  generatedAt: new Date(
                    waited.generatedAt || Date.now(),
                  ).toISOString(),
                  stale: false,
                  source: 'redis',
                });
              }
              // Cache did not appear within wait window: fall through and rebuild
              // locally so we never deadlock if the lock holder died mid-build.
            } else {
              lockToken = distributedLock.token;
            }

            return await this.executeDashboardQuery({
              ...input,
              options: {
                bypassCache: true,
                skipBypassMetric: true,
              },
            });
          } finally {
            if (lockToken) {
              void this.releaseDashboardLock(
                input.companyId,
                input.queryType,
                lockToken,
              );
            }
            const current = this.queryInFlightByCacheKey.get(inFlightKey);
            if (current === loaderState.current) {
              this.queryInFlightByCacheKey.delete(inFlightKey);
            }
          }
        })();
      loaderState.current = loader;
      this.queryInFlightByCacheKey.set(inFlightKey, loader);
      return loader;
    }

    try {
      const payload = await profileStage({
        logger: this.logger,
        route: input.perfRoute,
        stage: 'live_build',
        companyId: input.companyId,
        run: () => input.builder(),
      });
      const generatedAt = new Date();
      const normalizedPayload = this.stripDashboardMeta(payload);

      if (input.companyId && !input.options?.skipCacheWrite) {
        await profileStage({
          logger: this.logger,
          route: input.perfRoute,
          stage: 'cache_write',
          companyId: input.companyId,
          run: async () => {
            const results = await Promise.allSettled([
              this.writeDashboardCache(
                input.companyId,
                input.queryType,
                normalizedPayload,
                generatedAt,
              ),
              this.dashboardQuerySnapshotService.upsert(
                input.companyId,
                input.queryType,
                normalizedPayload,
                generatedAt,
              ),
            ]);
            const failed = results.filter(
              (result) => result.status === 'rejected',
            );
            if (failed.length > 0) {
              this.logger.warn({
                event: 'dashboard_cache_write_degraded',
                companyId: input.companyId,
                queryType: input.queryType,
                failedWrites: failed.length,
                errorMessages: failed.map((result) =>
                  result.status === 'rejected'
                    ? result.reason instanceof Error
                      ? result.reason.message
                      : String(result.reason)
                    : '',
                ),
              });
            }
          },
        });
        this.recordDashboardCacheRequestMetric({
          companyId: input.companyId,
          queryType: input.queryType,
          outcome: 'live_build',
          source: 'live',
        });
      }

      return this.attachDashboardMeta(normalizedPayload, {
        generatedAt: generatedAt.toISOString(),
        stale: false,
        source: 'live',
      });
    } catch (error) {
      if (input.companyId) {
        try {
          await this.dashboardQuerySnapshotService.recordFailure(
            input.companyId,
            input.queryType,
            error instanceof Error ? error.message : String(error),
          );
        } catch {
          // no-op
        }
      }
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
  ): Promise<{
    hit: boolean;
    stale: boolean;
    value?: T;
    generatedAt?: number;
  }> {
    try {
      const redis = this.redisService.getClient();
      const [activeRaw, staleRaw] = await Promise.all([
        redis.get(this.buildDashboardCacheKey(companyId, queryType)),
        redis.get(this.buildDashboardStaleCacheKey(companyId, queryType)),
      ]);

      const active = activeRaw
        ? this.parseJsonValue<DashboardCachedPayload<T>>(activeRaw)
        : null;
      if (active?.value !== undefined) {
        return {
          hit: true,
          stale: false,
          value: active.value,
          generatedAt: active.generatedAt,
        };
      }

      const stalePayload = staleRaw
        ? this.parseJsonValue<DashboardCachedPayload<T>>(staleRaw)
        : null;
      if (stalePayload?.value !== undefined) {
        return {
          hit: false,
          stale: true,
          value: stalePayload.value,
          generatedAt: stalePayload.generatedAt,
        };
      }
    } catch (error) {
      this.logger.warn(
        `[dashboard.cache] Falha ao ler Redis para ${queryType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      hit: false,
      stale: false,
    };
  }

  private async querySingleRow<TRow>(
    sql: string,
    params: unknown[],
  ): Promise<TRow | null> {
    const rows = (await this.aprsRepository.query(sql, params)) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    return rows[0] as TRow;
  }

  private async writeDashboardCache<T>(
    companyId: string,
    queryType: DashboardRevalidateQueryType,
    value: T,
    generatedAt = new Date(),
  ): Promise<void> {
    const payload: DashboardCachedPayload<T> = {
      value,
      generatedAt: generatedAt.getTime(),
    };

    try {
      const redis = this.redisService.getClient();
      const serializedPayload = JSON.stringify(payload);
      await Promise.all([
        redis.set(
          this.buildDashboardCacheKey(companyId, queryType),
          serializedPayload,
          'PX',
          DASHBOARD_CACHE_TTL_MS,
        ),
        redis.set(
          this.buildDashboardStaleCacheKey(companyId, queryType),
          serializedPayload,
          'PX',
          DASHBOARD_CACHE_TTL_MS + DASHBOARD_CACHE_STALE_WINDOW_MS,
        ),
      ]);
    } catch (error) {
      this.logger.warn(
        `[dashboard.cache] Falha ao gravar Redis para ${queryType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private buildDashboardInFlightKey(
    companyId: string,
    queryType: DashboardRevalidateQueryType,
  ): string {
    return `${companyId}:${queryType}`;
  }

  private buildDashboardLockKey(
    companyId: string,
    queryType: DashboardRevalidateQueryType,
  ): string {
    return `dashboard:lock:${companyId}:${queryType}`;
  }

  /**
   * Distributed Redis lock to prevent the cache stampede across instances.
   *
   * Without this, after a deploy or after the cache TTL expires, every API
   * instance that gets a cache miss races to rebuild — for N instances that's
   * N parallel heavy queries. With this lock, only the first instance builds;
   * the others wait briefly for the cache to populate.
   *
   * Returns acquired=true on Redis errors so the dashboard remains available
   * if Redis is degraded — the in-memory inflight map still serves as
   * single-instance fallback.
   */
  private async tryAcquireDashboardLock(
    companyId: string,
    queryType: DashboardRevalidateQueryType,
    ttlMs = 15000,
  ): Promise<{ acquired: boolean; token: string }> {
    const token = randomUUID();
    try {
      const redis = this.redisService.getClient();
      const result = await redis.set(
        this.buildDashboardLockKey(companyId, queryType),
        token,
        'PX',
        ttlMs,
        'NX',
      );
      return { acquired: result === 'OK', token };
    } catch (error) {
      this.logger.warn(
        `[dashboard.lock] Falha ao adquirir lock para ${queryType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { acquired: true, token };
    }
  }

  /**
   * Releases the lock only if the stored token still matches ours. Prevents
   * accidentally releasing a lock that another instance acquired after our
   * TTL expired (e.g. if the original build was very slow).
   */
  private async releaseDashboardLock(
    companyId: string,
    queryType: DashboardRevalidateQueryType,
    token: string,
  ): Promise<void> {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await this.redisService
        .getClient()
        .eval(
          script,
          1,
          this.buildDashboardLockKey(companyId, queryType),
          token,
        );
    } catch {
      /* lock will expire via TTL anyway */
    }
  }

  /**
   * Polls the cache with exponential backoff until populated or timeout.
   * Caller invokes this when the distributed lock was held by another
   * instance — once that instance finishes, the cache is written and we
   * read it instead of rebuilding ourselves.
   */
  private async waitForDashboardCacheRefresh<T>(
    companyId: string,
    queryType: DashboardRevalidateQueryType,
    maxWaitMs = 3000,
  ): Promise<{ hit: boolean; value?: T; generatedAt?: number }> {
    const start = Date.now();
    let attempt = 0;
    while (Date.now() - start < maxWaitMs) {
      const delay = Math.min(50 * Math.pow(2, attempt), 800);
      await new Promise((resolve) => setTimeout(resolve, delay));
      const cached = await this.readDashboardCache<T>(companyId, queryType);
      if (cached.hit && cached.value !== undefined) {
        return {
          hit: true,
          value: cached.value,
          generatedAt: cached.generatedAt,
        };
      }
      attempt += 1;
    }
    return { hit: false };
  }

  private attachDashboardMeta<T extends Record<string, unknown>>(
    payload: T,
    meta: DashboardResponseMeta,
  ): T & { meta: DashboardResponseMeta } {
    return {
      ...payload,
      meta,
    };
  }

  private stripDashboardMeta<T extends Record<string, unknown>>(payload: T): T {
    const { meta, ...rest } = payload as T & { meta?: DashboardResponseMeta };
    void meta;
    return rest as T;
  }

  private shouldNotifyDocumentPendencies(input?: {
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
  }): boolean {
    if (!input) {
      return true;
    }

    const page = Number(input.page || 1);
    return (
      page <= 1 &&
      !input.siteId &&
      !input.module &&
      !input.priority &&
      !input.criticality &&
      !input.status &&
      !input.dateFrom &&
      !input.dateTo
    );
  }

  private shouldBypassSharedDashboardCache(scope: {
    siteScope: 'single' | 'all';
    isSuperAdmin: boolean;
  }): boolean {
    return !scope.isSuperAdmin && scope.siteScope !== 'all';
  }

  private isMissingRequiredSiteScope(scope: {
    siteId?: string;
    siteScope: 'single' | 'all';
    isSuperAdmin: boolean;
  }): boolean {
    return !scope.isSuperAdmin && scope.siteScope === 'single' && !scope.siteId;
  }

  private createEmptyPendingQueuePayload() {
    return {
      degraded: true,
      failedSources: ['site-scope'],
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
      items: [],
    };
  }

  private createEmptySummaryPayload(): Record<string, unknown> {
    return {
      counts: {
        users: 0,
        companies: 0,
        sites: 0,
        checklists: 0,
        aprs: 0,
        pts: 0,
      },
      expiringEpis: [],
      expiringTrainings: [],
      pendingApprovals: {
        aprs: 0,
        pts: 0,
        checklists: 0,
        nonconformities: 0,
      },
      actionPlanItems: [],
      riskSummary: {
        alto: 0,
        medio: 0,
        baixo: 0,
      },
      evidenceSummary: {
        total: 0,
        inspections: 0,
        nonconformities: 0,
        audits: 0,
      },
      modelCounts: {
        aprs: 0,
        dds: 0,
        checklists: 0,
      },
      recentActivities: [],
      siteCompliance: [],
      recentReports: [],
    };
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

  private parseJsonValue<T>(value: string): T | null {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed as T;
    } catch {
      return null;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private normalizeRiskSummary(value: unknown): DashboardRiskSummary {
    if (!this.isRecord(value)) {
      return { alto: 0, medio: 0, baixo: 0 };
    }

    return {
      alto: Number(value.alto ?? 0),
      medio: Number(value.medio ?? 0),
      baixo: Number(value.baixo ?? 0),
    };
  }

  private normalizeEvidenceSummary(value: unknown): DashboardEvidenceSummary {
    if (!this.isRecord(value)) {
      return {
        total: 0,
        inspections: 0,
        nonconformities: 0,
        audits: 0,
      };
    }

    return {
      total: Number(value.total ?? 0),
      inspections: Number(value.inspections ?? 0),
      nonconformities: Number(value.nonconformities ?? 0),
      audits: Number(value.audits ?? 0),
    };
  }

  private normalizeJsonArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
      return value as T[];
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = this.parseJsonValue<unknown>(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    }

    return [];
  }

  private recordDashboardCacheRequestMetric(input: {
    companyId: string;
    queryType: DashboardRevalidateQueryType;
    outcome:
      | 'redis_hit'
      | 'snapshot_hit'
      | 'stale_served'
      | 'live_build'
      | 'bypass';
    source: DashboardMetaSource;
  }): void {
    try {
      this.domainMetrics?.cache_requests_total?.add(1, {
        company_id: input.companyId || 'unknown',
        query_type: input.queryType,
        outcome: input.outcome,
        source: input.source,
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
