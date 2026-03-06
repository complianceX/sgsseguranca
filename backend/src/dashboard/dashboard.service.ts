import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Apr } from '../aprs/entities/apr.entity';
import { Cat } from '../cats/entities/cat.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Site } from '../sites/entities/site.entity';
import { Training } from '../trainings/entities/training.entity';
import { MonthlySnapshot } from './entities/monthly-snapshot.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Apr)
    private readonly aprsRepository: Repository<Apr>,
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
    @InjectRepository(Site)
    private readonly sitesRepository: Repository<Site>,
    @InjectRepository(MonthlySnapshot)
    private readonly monthlySnapshotsRepository: Repository<MonthlySnapshot>,
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
  ) {}

  async getKpis(companyId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [aprs, inspections, trainings, recurringNcRows, incidents, blockedPts, unreadAlerts] =
      await Promise.all([
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
    const aprBeforeTaskPercent = this.toPercent(aprBeforeTaskCount, aprs.length);

    const completedInspections = inspections.filter((inspection) => {
      const actionPlan = Array.isArray(inspection.plano_acao)
        ? inspection.plano_acao
        : [];
      if (actionPlan.length === 0) return false;
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
      .select("to_char(date_trunc('month', nc.data_identificacao), 'YYYY-MM')", 'month')
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

  private toPercent(value: number, total: number): number {
    if (!total) {
      return 0;
    }
    return Math.round((value / total) * 10000) / 100;
  }
}
