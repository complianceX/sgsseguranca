import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { Apr } from '../../aprs/entities/apr.entity';
import { Checklist } from '../../checklists/entities/checklist.entity';
import { Audit } from '../../audits/entities/audit.entity';
import { Activity } from '../../activities/entities/activity.entity';

type DashboardMetricsResult = {
  aprsCount: number;
  checklistScore: number;
  complianceRate: number;
  auditCount: number;
  lastUpdate: Date;
  period: 'day' | 'week' | 'month';
};

type DashboardActivityFeedItem = {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  actorId: string | null;
};

type ChecklistAverageRow = {
  avgScore: string | null;
};

/**
 * Cache Layer para Dashboard
 * Reduz P95 de queries pesadas usando Redis com TTL inteligente
 * CACHE-ASIDE pattern: Cache miss -> Query -> Store -> Return
 */
@Injectable()
export class DashboardCacheService {
  private readonly logger = new Logger(DashboardCacheService.name);

  // TTL (Time-To-Live) para diferentes tipos de dados; carregados de env.
  private readonly cacheTTL = {
    METRICS: 300,
    ACTIVITIES_FEED: 60,
    MONTHLY_SUMMARY: 3600,
    KPI_SNAPSHOT: 600,
  };
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @InjectRepository(Apr) private readonly aprRepository: Repository<Apr>,
    @InjectRepository(Checklist)
    private readonly checklistRepository: Repository<Checklist>,
    @InjectRepository(Audit)
    private readonly auditRepository: Repository<Audit>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
  ) {
    this.enabled = this.configService.get<boolean>(
      'DASHBOARD_CACHE_ENABLED',
      true,
    );
    this.cacheTTL.METRICS = this.configService.get<number>(
      'DASHBOARD_CACHE_TTL_METRICS',
      300,
    );
    this.cacheTTL.ACTIVITIES_FEED = this.configService.get<number>(
      'DASHBOARD_CACHE_TTL_ACTIVITIES',
      60,
    );
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private parseCachedMetrics(payload: string): DashboardMetricsResult {
    return JSON.parse(payload) as DashboardMetricsResult;
  }

  private parseCachedActivities(payload: string): DashboardActivityFeedItem[] {
    return JSON.parse(payload) as DashboardActivityFeedItem[];
  }

  private getEmptyMetrics(
    period: 'day' | 'week' | 'month',
  ): DashboardMetricsResult {
    return {
      aprsCount: 0,
      checklistScore: 0,
      complianceRate: 0,
      auditCount: 0,
      lastUpdate: new Date(),
      period,
    };
  }

  private normalizeChecklistScore(
    row: ChecklistAverageRow | null | undefined,
  ): number {
    if (!row?.avgScore) {
      return 0;
    }

    return Math.round(parseFloat(row.avgScore) * 10) / 10;
  }

  /**
   * Obter metricas do dashboard com cache
   * GET /api/dashboard/metrics?companyId=123&period=month
   */
  async getDashboardMetrics(
    companyId: string,
    period: 'day' | 'week' | 'month' = 'month',
  ): Promise<DashboardMetricsResult> {
    if (!this.enabled) {
      return this.computeMetrics(companyId, period);
    }

    const cacheKey = `dashboard:metrics:${companyId}:${period}`;

    try {
      const redis = this.redisService.getClient();
      const cached = await redis.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit: ${cacheKey}`);
        return this.parseCachedMetrics(cached);
      }
    } catch (error) {
      this.logger.warn(`Cache read error: ${this.getErrorMessage(error)}`);
    }

    const metrics = await this.computeMetrics(companyId, period);

    try {
      const redis = this.redisService.getClient();
      await redis.setex(
        cacheKey,
        this.cacheTTL.METRICS,
        JSON.stringify(metrics),
      );
    } catch (error) {
      this.logger.warn(`Cache write error: ${this.getErrorMessage(error)}`);
    }

    return metrics;
  }

  /**
   * Obter feed de atividades com cache
   * GET /api/activities/feed
   */
  async getActivitiesFeed(
    companyId: string,
    limit = 20,
  ): Promise<DashboardActivityFeedItem[]> {
    if (!this.enabled) {
      return this.fetchLatestActivities(companyId, limit);
    }

    const cacheKey = `dashboard:feed:${companyId}`;

    try {
      const redis = this.redisService.getClient();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return this.parseCachedActivities(cached).slice(0, limit);
      }
    } catch (error) {
      this.logger.warn(`Cache read error: ${this.getErrorMessage(error)}`);
    }

    const activities = await this.fetchLatestActivities(companyId, limit);

    try {
      const redis = this.redisService.getClient();
      await redis.setex(
        cacheKey,
        this.cacheTTL.ACTIVITIES_FEED,
        JSON.stringify(activities),
      );
    } catch (error) {
      this.logger.warn(`Cache write error: ${this.getErrorMessage(error)}`);
    }

    return activities;
  }

  /**
   * Invalidar cache de metricas quando dados mudam
   * Chamada apos atualizar APRs, documentos, etc
   */
  async invalidateMetricsCache(companyId: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const patterns = [
      `dashboard:metrics:${companyId}:*`,
      `dashboard:feed:${companyId}`,
      `dashboard:summary:${companyId}:*`,
    ];

    for (const pattern of patterns) {
      try {
        await this.deleteByPattern(pattern);
        this.logger.log(`Cache invalidated: ${pattern}`);
      } catch (error) {
        this.logger.warn(`Invalidation error: ${this.getErrorMessage(error)}`);
      }
    }
  }

  /**
   * Health check de cache
   * Retorna status do Redis
   */
  async healthCheck(): Promise<{ status: string; redis: boolean }> {
    if (!this.enabled) {
      return { status: 'DISABLED', redis: false };
    }

    try {
      const redis = this.redisService.getClient();
      await redis.ping();
      return { status: 'OK', redis: true };
    } catch (error) {
      this.logger.error(
        `Redis health check failed: ${this.getErrorMessage(error)}`,
      );
      return { status: 'OFFLINE', redis: false };
    }
  }

  /**
   * Computar metricas reais do dashboard
   * Conta: APRs, score de checklists, taxa de conformidade, audits
   */
  private async computeMetrics(
    companyId: string,
    period: 'day' | 'week' | 'month' = 'month',
  ): Promise<DashboardMetricsResult> {
    try {
      this.logger.debug(`Computing metrics for ${companyId} (${period})`);

      const now = new Date();
      let fromDate: Date;

      switch (period) {
        case 'day':
          fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
        default:
          fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      const aprCount = await this.aprRepository
        .createQueryBuilder('a')
        .where('a.company_id = :companyId', { companyId })
        .andWhere('a.created_at >= :fromDate', { fromDate })
        .getCount();

      const checklistRow = await this.checklistRepository
        .createQueryBuilder('c')
        .where('c.company_id = :companyId', { companyId })
        .andWhere('c.created_at >= :fromDate', { fromDate })
        .select('AVG(COALESCE(c.score, 0))', 'avgScore')
        .getRawOne<ChecklistAverageRow>();

      const checklistScore = this.normalizeChecklistScore(checklistRow);

      const totalAudits = await this.auditRepository
        .createQueryBuilder('audit')
        .where('audit.company_id = :companyId', { companyId })
        .getCount();

      const approvedAudits = await this.auditRepository
        .createQueryBuilder('audit')
        .where('audit.company_id = :companyId', { companyId })
        .andWhere("audit.status != 'canceled' AND audit.status != 'rejected'")
        .getCount();

      const complianceRate =
        totalAudits > 0 ? Math.round((approvedAudits / totalAudits) * 100) : 0;

      const auditCount = await this.auditRepository
        .createQueryBuilder('audit')
        .where('audit.company_id = :companyId', { companyId })
        .andWhere('audit.created_at >= :fromDate', { fromDate })
        .getCount();

      const metrics: DashboardMetricsResult = {
        aprsCount: aprCount,
        checklistScore,
        complianceRate,
        auditCount,
        lastUpdate: new Date(),
        period,
      };

      this.logger.log(`Metrics computed: ${JSON.stringify(metrics)}`);
      return metrics;
    } catch (error) {
      this.logger.error(
        `Error computing metrics: ${this.getErrorMessage(error)}`,
      );
      return this.getEmptyMetrics(period);
    }
  }

  /**
   * Buscar atividades mais recentes para dashboard feed
   * Retorna ultimas N atividades ordenadas por data decrescente
   */
  private async fetchLatestActivities(
    companyId: string,
    limit = 20,
  ): Promise<DashboardActivityFeedItem[]> {
    try {
      this.logger.debug(`Fetching ${limit} activities for ${companyId}`);

      const activities = await this.activityRepository
        .createQueryBuilder('a')
        .where('a.company_id = :companyId', { companyId })
        .orderBy('a.created_at', 'DESC')
        .limit(limit)
        .select([
          'a.id',
          'a.type',
          'a.description',
          'a.created_at AS timestamp',
          'a.actor_id AS actorId',
        ])
        .getRawMany<DashboardActivityFeedItem>();

      this.logger.log(`Fetched ${activities.length} activities`);
      return activities;
    } catch (error) {
      this.logger.error(
        `Error fetching activities: ${this.getErrorMessage(error)}`,
      );
      return [];
    }
  }

  private async deleteByPattern(pattern: string): Promise<void> {
    const redis = this.redisService.getClient();
    let cursor = '0';
    const batchSize = 500;

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        batchSize,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.unlink(...keys);
      }
    } while (cursor !== '0');
  }
}
