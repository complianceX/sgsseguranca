import { Injectable, Logger } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { MetricsService } from './metrics.service';
import { Company } from '../../companies/entities/company.entity';
import { MedicalExam } from '../../medical-exams/entities/medical-exam.entity';
import { Training } from '../../trainings/entities/training.entity';
import { Apr, AprStatus } from '../../aprs/entities/apr.entity';
import { UserSession } from '../../auth/entities/user-session.entity';
import { User } from '../../users/entities/user.entity';

type CompanyCountRow = {
  company_id: string;
  total: string;
};

export type BusinessHealthGaugeSnapshot = {
  companyId: string;
  examsOverdueCount: number;
  trainingsOverdueCount: number;
  aprsPendingReviewCount: number;
  activeUsersCount: number;
};

@Injectable()
export class BusinessMetricsRefreshService {
  private readonly logger = new Logger(BusinessMetricsRefreshService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly metricsService: MetricsService,
  ) {}

  async refreshTenantHealthGauges(): Promise<{
    updatedAt: string;
    tenants: number;
    snapshot: BusinessHealthGaugeSnapshot[];
  }> {
    const now = new Date();
    const activeSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [activeCompanyIds, examOverdueByCompany, trainingOverdueByCompany] =
      await Promise.all([
        this.listActiveCompanyIds(),
        this.loadExamOverdueByCompany(now),
        this.loadTrainingOverdueByCompany(now),
      ]);
    const [aprPendingByCompany, activeUsersByCompany] = await Promise.all([
      this.loadAprPendingReviewByCompany(),
      this.loadActiveUsersByCompany(activeSince),
    ]);

    const companyIdSet = new Set<string>(activeCompanyIds);
    for (const key of examOverdueByCompany.keys()) companyIdSet.add(key);
    for (const key of trainingOverdueByCompany.keys()) companyIdSet.add(key);
    for (const key of aprPendingByCompany.keys()) companyIdSet.add(key);
    for (const key of activeUsersByCompany.keys()) companyIdSet.add(key);

    const snapshot = Array.from(companyIdSet)
      .sort((a, b) => a.localeCompare(b))
      .map((companyId) => ({
        companyId,
        examsOverdueCount: examOverdueByCompany.get(companyId) ?? 0,
        trainingsOverdueCount: trainingOverdueByCompany.get(companyId) ?? 0,
        aprsPendingReviewCount: aprPendingByCompany.get(companyId) ?? 0,
        activeUsersCount: activeUsersByCompany.get(companyId) ?? 0,
      }));

    snapshot.forEach((item) => {
      this.metricsService.setExamsOverdueCount(
        item.companyId,
        item.examsOverdueCount,
      );
      this.metricsService.setTrainingsOverdueCount(
        item.companyId,
        item.trainingsOverdueCount,
      );
      this.metricsService.setAprsPendingReviewCount(
        item.companyId,
        item.aprsPendingReviewCount,
      );
      this.metricsService.setActiveUsersCount(
        item.companyId,
        item.activeUsersCount,
      );
    });

    const updatedAt = new Date().toISOString();
    this.logger.log({
      event: 'business_metrics_gauges_refreshed',
      tenants: snapshot.length,
      updatedAt,
    });

    return {
      updatedAt,
      tenants: snapshot.length,
      snapshot,
    };
  }

  private async listActiveCompanyIds(): Promise<string[]> {
    const companies = await this.dataSource.getRepository(Company).find({
      where: {
        status: true,
        deletedAt: IsNull(),
      },
      select: ['id'],
    });

    return companies.map((company) => company.id);
  }

  private async loadExamOverdueByCompany(
    now: Date,
  ): Promise<Map<string, number>> {
    const rows = await this.dataSource
      .getRepository(MedicalExam)
      .createQueryBuilder('exam')
      .select('exam.company_id', 'company_id')
      .addSelect('COUNT(*)', 'total')
      .where('exam.data_vencimento IS NOT NULL')
      .andWhere('exam.data_vencimento < :now', { now })
      .groupBy('exam.company_id')
      .getRawMany<CompanyCountRow>();

    return this.toCountMap(rows);
  }

  private async loadTrainingOverdueByCompany(
    now: Date,
  ): Promise<Map<string, number>> {
    const rows = await this.dataSource
      .getRepository(Training)
      .createQueryBuilder('training')
      .select('training.company_id', 'company_id')
      .addSelect('COUNT(*)', 'total')
      .where('training.data_vencimento < :now', { now })
      .groupBy('training.company_id')
      .getRawMany<CompanyCountRow>();

    return this.toCountMap(rows);
  }

  private async loadAprPendingReviewByCompany(): Promise<Map<string, number>> {
    const rows = await this.dataSource
      .getRepository(Apr)
      .createQueryBuilder('apr')
      .select('apr.company_id', 'company_id')
      .addSelect('COUNT(*)', 'total')
      .where('apr.status = :status', { status: AprStatus.PENDENTE })
      .andWhere('apr.deleted_at IS NULL')
      .groupBy('apr.company_id')
      .getRawMany<CompanyCountRow>();

    return this.toCountMap(rows);
  }

  private async loadActiveUsersByCompany(
    activeSince: Date,
  ): Promise<Map<string, number>> {
    const rows = await this.dataSource
      .getRepository(UserSession)
      .createQueryBuilder('session')
      .innerJoin(User, 'user', 'user.id = session.user_id')
      .select('user.company_id', 'company_id')
      .addSelect('COUNT(DISTINCT session.user_id)', 'total')
      .where('session.is_active = :isActive', { isActive: true })
      .andWhere('session.last_active >= :activeSince', { activeSince })
      .andWhere('user.deleted_at IS NULL')
      .groupBy('user.company_id')
      .getRawMany<CompanyCountRow>();

    return this.toCountMap(rows);
  }

  private toCountMap(rows: CompanyCountRow[]): Map<string, number> {
    return new Map(
      rows.map((row) => [row.company_id, Number.parseInt(row.total, 10) || 0]),
    );
  }
}
