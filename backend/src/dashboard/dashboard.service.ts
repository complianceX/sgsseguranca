import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Apr } from '../aprs/entities/apr.entity';
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
import {
  DashboardDocumentPendencyOperationsService,
  DashboardDocumentPendencyResolvedActionResponse,
} from './dashboard-document-pendency-operations.service';
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

@Injectable()
export class DashboardService {
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
  ) {}

  async getSummary(companyId: string) {
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
      inspectionActionSources,
      auditActionSources,
      nonConformityActionSources,
      inspectionRiskSources,
      nonConformityRiskSources,
      inspectionEvidenceSources,
      nonConformityEvidenceSources,
      auditEvidenceSources,
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
    ] = await Promise.all([
      this.usersRepository.count({ where: { company_id: companyId } }),
      this.companiesRepository.count(),
      this.sitesRepository.count({ where: { company_id: companyId } }),
      this.checklistsRepository.count({ where: { company_id: companyId } }),
      this.aprsRepository.count({ where: { company_id: companyId } }),
      this.ptsRepository.count({ where: { company_id: companyId } }),
      this.episRepository.find({
        where: { company_id: companyId },
        select: ['id', 'nome', 'ca', 'validade_ca'],
        order: { validade_ca: 'ASC' },
      }),
      this.trainingsRepository
        .createQueryBuilder('training')
        .leftJoinAndSelect('training.user', 'user')
        .where('training.company_id = :companyId', { companyId })
        .orderBy('training.data_vencimento', 'ASC')
        .getMany(),
      this.aprsRepository.count({
        where: { company_id: companyId, status: 'Pendente' },
      }),
      this.ptsRepository.count({
        where: { company_id: companyId, status: 'Pendente' },
      }),
      this.checklistsRepository.count({
        where: { company_id: companyId, status: 'Pendente' },
      }),
      this.nonConformitiesRepository
        .createQueryBuilder('nc')
        .where('nc.company_id = :companyId', { companyId })
        .andWhere(
          "LOWER(COALESCE(nc.status, '')) NOT IN (:...closedStatuses)",
          {
            closedStatuses: ['encerrada', 'concluída', 'concluida', 'fechada'],
          },
        )
        .getCount(),
      this.inspectionsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'setor_area', 'plano_acao'],
      }),
      this.auditsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'titulo', 'plano_acao'],
      }),
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
        ],
      }),
      this.inspectionsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'perigos_riscos'],
      }),
      this.nonConformitiesRepository.find({
        where: { company_id: companyId },
        select: ['id', 'risco_nivel'],
      }),
      this.inspectionsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'evidencias'],
      }),
      this.nonConformitiesRepository.find({
        where: { company_id: companyId },
        select: ['id', 'anexos'],
      }),
      this.auditsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'resultados_nao_conformidades'],
      }),
      this.aprsRepository.count({
        where: { company_id: companyId, is_modelo: true },
      }),
      this.ddsRepository.count({
        where: { company_id: companyId, is_modelo: true },
      }),
      this.checklistsRepository.count({
        where: { company_id: companyId, is_modelo: true },
      }),
      this.aprsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'titulo', 'created_at', 'updated_at'],
        order: { updated_at: 'DESC' },
        take: 5,
      }),
      this.ptsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'titulo', 'created_at', 'updated_at'],
        order: { updated_at: 'DESC' },
        take: 5,
      }),
      this.checklistsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'titulo', 'created_at', 'updated_at'],
        order: { updated_at: 'DESC' },
        take: 5,
      }),
      this.inspectionsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'setor_area', 'created_at', 'updated_at'],
        order: { updated_at: 'DESC' },
        take: 5,
      }),
      this.auditsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'titulo', 'created_at', 'updated_at'],
        order: { updated_at: 'DESC' },
        take: 5,
      }),
      this.nonConformitiesRepository.find({
        where: { company_id: companyId },
        select: ['id', 'codigo_nc', 'created_at', 'updated_at'],
        order: { updated_at: 'DESC' },
        take: 5,
      }),
      this.trainingsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'nome', 'data_conclusao'],
        order: { data_conclusao: 'DESC' },
        take: 5,
      }),
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
      this.reportsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'titulo', 'mes', 'ano', 'created_at'],
        order: { created_at: 'DESC' },
        take: 4,
      }),
    ]);

    const filteredExpiringEpis = expiringEpis
      .filter(
        (epi) => epi.validade_ca && new Date(epi.validade_ca) <= warningLimit,
      )
      .slice(0, 5);

    const filteredExpiringTrainings = expiringTrainings
      .filter((training) => new Date(training.data_vencimento) <= warningLimit)
      .slice(0, 5)
      .map((training) => ({
        id: training.id,
        nome: training.nome,
        data_vencimento: training.data_vencimento,
        user: training.user ? { nome: training.user.nome } : null,
      }));

    const actionPlanItems = [
      ...inspectionActionSources.flatMap((inspection) =>
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
      ...auditActionSources.flatMap((audit) =>
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
      ...nonConformityActionSources.flatMap((item) => [
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

    inspectionRiskSources.forEach((inspection) => {
      (inspection.perigos_riscos || []).forEach((item: InspectionRiskItem) =>
        applyRisk(item.classificacao_risco),
      );
    });
    nonConformityRiskSources.forEach((item) => applyRisk(item.risco_nivel));

    const inspectionEvidence = inspectionEvidenceSources.reduce(
      (total, inspection) => total + (inspection.evidencias?.length || 0),
      0,
    );
    const nonConformityEvidence = nonConformityEvidenceSources.reduce(
      (total, item) => total + (item.anexos?.length || 0),
      0,
    );
    const auditEvidence = auditEvidenceSources.reduce(
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
        color: 'bg-blue-500',
      })),
      ...recentPts.map((item) => ({
        id: `pt-${item.id}`,
        title: 'PT atualizada',
        description: item.titulo,
        date: item.updated_at || item.created_at,
        href: '/dashboard/pts',
        color: 'bg-indigo-500',
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
        color: 'bg-purple-500',
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

    return {
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
  }

  async getKpis(companyId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      aprs,
      inspections,
      trainings,
      recurringNcRows,
      incidents,
      blockedPts,
      unreadAlerts,
    ] = await Promise.all([
      this.aprsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'data_inicio', 'created_at'],
      }),
      this.inspectionsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'plano_acao'],
      }),
      this.trainingsRepository.find({
        where: { company_id: companyId },
        select: ['id', 'data_vencimento'],
      }),
      this.nonConformitiesRepository
        .createQueryBuilder('nc')
        .select('nc.codigo_nc', 'codigo_nc')
        .addSelect('COUNT(nc.id)', 'total')
        .where('nc.company_id = :companyId', { companyId })
        .groupBy('nc.codigo_nc')
        .having('COUNT(nc.id) > 1')
        .getRawMany<{ codigo_nc: string; total: string }>(),
      this.catsRepository.count({
        where: { company_id: companyId },
      }),
      this.ptsRepository.count({
        where: {
          company_id: companyId,
          status: 'Pendente',
          residual_risk: 'CRITICAL',
          control_evidence: false,
        },
      }),
      this.notificationsRepository.find({
        where: { read: false },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    const aprBeforeTaskCount = aprs.filter((item) => {
      if (!item.data_inicio || !item.created_at) {
        return false;
      }
      return new Date(item.created_at) <= new Date(item.data_inicio);
    }).length;
    const aprBeforeTaskPercent = this.toPercent(
      aprBeforeTaskCount,
      aprs.length,
    );

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

    const validTrainings = trainings.filter(
      (training) => new Date(training.data_vencimento) >= now,
    ).length;
    const trainingCompliance = this.toPercent(validTrainings, trainings.length);

    const recurringNc = recurringNcRows.reduce(
      (accumulator, row) => accumulator + Number(row.total),
      0,
    );

    const monthlyRiskTrend = await this.monthlySnapshotsRepository.find({
      where: { company_id: companyId },
      order: { month: 'ASC' },
      take: 12,
    });

    const monthlyNc = await this.nonConformitiesRepository
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
      .getRawMany<{ month: string; count: string }>();

    return {
      leading: {
        apr_before_task: {
          total: aprs.length,
          compliant: aprBeforeTaskCount,
          percentage: aprBeforeTaskPercent,
        },
        completed_inspections: {
          total: inspections.length,
          completed: completedInspections,
          percentage: completedInspectionsPercent,
        },
        training_compliance: {
          total: trainings.length,
          compliant: validTrainings,
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
    const snapshots = await this.monthlySnapshotsRepository
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
      }>();

    const sites = await this.sitesRepository.find({
      where: { company_id: companyId },
      select: ['id', 'nome'],
    });
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

    const fallbackRows = await this.aprsRepository
      .createQueryBuilder('apr')
      .select('apr.site_id', 'site_id')
      .addSelect('AVG(COALESCE(apr.initial_risk, 0))', 'risk_score')
      .addSelect('COUNT(apr.id)', 'apr_count')
      .where('apr.company_id = :companyId', { companyId })
      .groupBy('apr.site_id')
      .getRawMany<{ site_id: string; risk_score: string; apr_count: string }>();

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
      this.ptsRepository.find({
        where: { company_id: companyId, status: 'Pendente' },
        relations: ['site', 'responsavel'],
        order: { created_at: 'ASC' },
        take: 10,
      }),
      this.nonConformitiesRepository.find({
        where: { company_id: companyId },
        relations: ['site'],
        order: { created_at: 'DESC' },
        take: 30,
      }),
      this.inspectionsRepository.find({
        where: { company_id: companyId },
        relations: ['site', 'responsavel'],
        order: { data_inspecao: 'ASC' },
        take: 30,
      }),
      this.medicalExamsRepository
        .createQueryBuilder('exam')
        .leftJoinAndSelect('exam.user', 'user')
        .where('exam.company_id = :companyId', { companyId })
        .andWhere('exam.data_vencimento BETWEEN :now AND :nextWeek', {
          now,
          nextWeek,
        })
        .orderBy('exam.data_vencimento', 'ASC')
        .getMany(),
      this.trainingsRepository
        .createQueryBuilder('training')
        .leftJoinAndSelect('training.user', 'user')
        .where('training.company_id = :companyId', { companyId })
        .andWhere('training.data_vencimento BETWEEN :now AND :nextWeek', {
          now,
          nextWeek,
        })
        .orderBy('training.data_vencimento', 'ASC')
        .getMany(),
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

  async getPendingQueue(companyId: string) {
    return this.dashboardPendingQueueService.getPendingQueue(companyId);
  }

  async getDocumentPendencies(input: {
    companyId?: string;
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
    return this.dashboardDocumentPendenciesService.getDocumentPendencies({
      currentCompanyId: input.companyId,
      isSuperAdmin: input.isSuperAdmin,
      permissions: input.permissions,
      filters: input.filters,
    });
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

  private toPercent(value: number, total: number): number {
    if (!total) {
      return 0;
    }
    return Math.round((value / total) * 10000) / 100;
  }
}
