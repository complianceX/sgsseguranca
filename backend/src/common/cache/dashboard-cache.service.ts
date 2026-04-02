import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Cache Layer para Dashboard
 * Reduz P95 de queries pesadas usando Redis com TTL inteligente
 */
@Injectable()
export class DashboardCacheService {
    private readonly logger = new Logger(DashboardCacheService.name);

    // TTL (Time-To-Live) para diferentes tipos de dados
    private readonly cacheTTL = {
        METRICS: 300,          // 5 minutos (muda frequentemente)
        ACTIVITIES_FEED: 60,   // 1 minuto (muito dinâmico)
        MONTHLY_SUMMARY: 3600, // 1 hora (menos dinâmico)
        KPI_SNAPSHOT: 600,     // 10 minutos
    };

    constructor(private readonly redisService: RedisService) { }

    /**
     * Obter métricas do dashboard com cache
     * GET /api/dashboard/metrics?companyId=123&period=month
     */
    async getDashboardMetrics(companyId: string, period: string): Promise<any> {
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
     * PLACEHOLDER: computeMetrics - implementar com lógica real
     */
    private async computeMetrics(companyId: string, period: string): Promise<any> {
        // Stub - implementar com queries reais do banco
        this.logger.log(`🔄 Computing metrics for ${companyId} (${period})`);
        return {
            aprsCount: 0,
            checklistScore: 0,
            complianceRate: 0,
            lastUpdate: new Date(),
        };
    }

    /**
     * PLACEHOLDER: fetchLatestActivities - implementar com query real
     */
    private async fetchLatestActivities(companyId: string, limit: number): Promise<any[]> {
        // Stub - implementar com SELECT * FROM activities...
        this.logger.log(`🔄 Fetching ${limit} activities for ${companyId}`);
        return [];
    }
}
