import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { Apr } from '../../aprs/entities/apr.entity';
import { Checklist } from '../../checklists/entities/checklist.entity';
import { Audit } from '../../audits/entities/audit.entity';
import { Activity } from '../../activities/entities/activity.entity';

/**
 * Cache Layer para Dashboard
 * Reduz P95 de queries pesadas usando Redis com TTL inteligente
 * CACHE-ASIDE pattern: Cache miss → Query → Store → Return
 */
@Injectable()
export class DashboardCacheService {
    private readonly logger = new Logger(DashboardCacheService.name);

    // TTL (Time-To-Live) para diferentes tipos de dados — carregados de env
    private readonly cacheTTL = {
        METRICS: 300,          // 5 minutos (padrão, sobrescrito por env)
        ACTIVITIES_FEED: 60,   // 1 minuto (padrão, sobrescrito por env)
        MONTHLY_SUMMARY: 3600, // 1 hora (padrão)
        KPI_SNAPSHOT: 600,     // 10 minutos (padrão)
    };
    private readonly enabled: boolean;

    constructor(
        private readonly configService: ConfigService,
        private readonly redisService: RedisService,
        @InjectRepository(Apr) private readonly aprRepository: Repository<Apr>,
        @InjectRepository(Checklist)
        private readonly checklistRepository: Repository<Checklist>,
        @InjectRepository(Audit) private readonly auditRepository: Repository<Audit>,
        @InjectRepository(Activity)
        private readonly activityRepository: Repository<Activity>,
    ) {
        // Carregar configurações de ambiente
        this.enabled = this.configService.get<boolean>('DASHBOARD_CACHE_ENABLED', true);
        this.cacheTTL.METRICS = this.configService.get<number>('DASHBOARD_CACHE_TTL_METRICS', 300);
        this.cacheTTL.ACTIVITIES_FEED = this.configService.get<number>('DASHBOARD_CACHE_TTL_ACTIVITIES', 60);
    }

    /**
     * Obter métricas do dashboard com cache
     * GET /api/dashboard/metrics?companyId=123&period=month
     */
    async getDashboardMetrics(
        companyId: string,
        period: 'day' | 'week' | 'month' = 'month',
    ): Promise<any> {
        const cacheKey = `dashboard:metrics:${companyId}:${period}`;

        // Tentar cache primeiro
        try {
            const redis = this.redisService.getClient();
            const cached = await redis.get(cacheKey);
            if (cached) {
                this.logger.debug(`✅ Cache hit: ${cacheKey}`);
                return JSON.parse(cached);
            }
        } catch (error) {
            this.logger.warn(`Cache read error: ${error?.message || 'Unknown error'}`);
        }

        // Se não está em cache, computar dados (essa operação é cara)
        const metrics = await this.computeMetrics(companyId, period);

        // Armazenar em cache
        try {
            const redis = this.redisService.getClient();
            await redis.setex(
                cacheKey,
                this.cacheTTL.METRICS,
                JSON.stringify(metrics)
            );
        } catch (error) {
            this.logger.warn(`Cache write error: ${error?.message || 'Unknown error'}`);
        }

        return metrics;
    }

    /**
     * Obter feed de atividades com cache
     * GET /api/activities/feed
     */
    async getActivitiesFeed(companyId: string, limit: number = 20): Promise<any[]> {
        const cacheKey = `dashboard:feed:${companyId}`;

        try {
            const redis = this.redisService.getClient();
            const cached = await redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached).slice(0, limit);
            }
        } catch (error) {
            this.logger.warn(`Cache read error: ${error?.message || 'Unknown error'}`);
        }

        // Computar atividades mais recentes (banco de dados)
        const activities = await this.fetchLatestActivities(companyId, limit);

        // Cache com TTL curto (mudam frequentemente)
        try {
            const redis = this.redisService.getClient();
            await redis.setex(
                cacheKey,
                this.cacheTTL.ACTIVITIES_FEED,
                JSON.stringify(activities)
            );
        } catch (error) {
            this.logger.warn(`Cache write error: ${error.message}`);
        }

        return activities;
    }

    /**
     * Invalidar cache de métricas quando dados mudam
     * Chamada após atualizar APRs, documentos, etc
     */
    async invalidateMetricsCache(companyId: string): Promise<void> {
        const redis = this.redisService.getClient();
        const patterns = [
            `dashboard:metrics:${companyId}:*`,
            `dashboard:feed:${companyId}`,
            `dashboard:summary:${companyId}:*`,
        ];

        for (const pattern of patterns) {
            try {
                const keys = await redis.keys(pattern);
                if (keys.length > 0) {
                    // Delete em batches para evitar timeout
                    for (const key of keys) {
                        await redis.del(key);
                    }
                }
                this.logger.log(`❌ Cache invalidated: ${pattern}`);
            } catch (error) {
                this.logger.warn(`Invalidation error: ${error?.message || 'Unknown error'}`);
            }
        }
    }

    /**
     * Health check de cache
     * Retorna status do Redis
     */
    async healthCheck(): Promise<{ status: string; redis: boolean }> {
        try {
            const redis = this.redisService.getClient();
            await redis.ping();
            return { status: '✅ OK', redis: true };
        } catch (error) {
            this.logger.error(`Redis health check failed: ${error?.message || 'Unknown error'}`);
            return { status: '❌ OFFLINE', redis: false };
        }
    }

    /**
     * Computar métricas reais do dashboard
     * Conta: APRs, Score de checklists, Taxa de conformidade, Audits
     */
    private async computeMetrics(
        companyId: string,
        period: 'day' | 'week' | 'month' = 'month',
    ): Promise<any> {
        try {
            this.logger.debug(`🔄 Computing metrics for ${companyId} (${period})`);

            // Calcular data inicial baseado no período
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

            // Query 1: Contar APRs criadas no período
            const aprCount = await this.aprRepository
                .createQueryBuilder('a')
                .where('a.company_id = :companyId', { companyId })
                .andWhere('a.created_at >= :fromDate', { fromDate })
                .getCount();

            // Query 2: Score médio de checklists (1-10)
            const checklists = await this.checklistRepository
                .createQueryBuilder('c')
                .where('c.company_id = :companyId', { companyId })
                .andWhere('c.created_at >= :fromDate', { fromDate })
                .select('AVG(COALESCE(c.score, 0))', 'avgScore')
                .getRawOne();

            const checklistScore = checklists?.avgScore
                ? Math.round(parseFloat(checklists.avgScore) * 10) / 10
                : 0;

            // Query 3: Taxa de conformidade (audits não-cancelados / total)
            const auditQB = this.auditRepository.createQueryBuilder('audit');
            const totalAudits = await auditQB
                .where('audit.company_id = :companyId', { companyId })
                .getCount();

            // Contar audits com status diferente de cancelado/rejected
            const approvedAudits = await this.auditRepository
                .createQueryBuilder('audit')
                .where('audit.company_id = :companyId', { companyId })
                .andWhere("audit.status != 'canceled' AND audit.status != 'rejected'")
                .getCount();

            const complianceRate =
                totalAudits > 0 ? Math.round((approvedAudits / totalAudits) * 100) : 0;

            // Query 4: Contar audits no período
            const auditCount = await this.auditRepository
                .createQueryBuilder('audit')
                .where('audit.company_id = :companyId', { companyId })
                .andWhere('audit.created_at >= :fromDate', { fromDate })
                .getCount();

            const metrics = {
                aprsCount: aprCount,
                checklistScore,
                complianceRate,
                auditCount,
                lastUpdate: new Date(),
                period,
            };

            this.logger.log(`✅ Metrics computed: ${JSON.stringify(metrics)}`);
            return metrics;
        } catch (error) {
            this.logger.error(
                `Error computing metrics: ${error?.message || 'Unknown error'}`,
            );
            // Retornar dados vazios em caso de erro (graceful degradation)
            return {
                aprsCount: 0,
                checklistScore: 0,
                complianceRate: 0,
                auditCount: 0,
                lastUpdate: new Date(),
                period,
            };
        }
    }

    /**
     * Buscar atividades mais recentes para dashboard feed
     * Retorna últimas N atividades ordenadas por data decrescente
     */
    private async fetchLatestActivities(
        companyId: string,
        limit: number = 20,
    ): Promise<any[]> {
        try {
            this.logger.debug(`🔄 Fetching ${limit} activities for ${companyId}`);

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
                .getRawMany();

            this.logger.log(`✅ Fetched ${activities.length} activities`);
            return activities || [];
        } catch (error) {
            this.logger.error(
                `Error fetching activities: ${error?.message || 'Unknown error'}`,
            );
            // Retornar array vazio em caso de erro (graceful degradation)
            return [];
        }
    }
}
