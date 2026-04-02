import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * 📊 Cache Refresh Service
 * Gerencia refresh de materialized views e cache invalidation
 *
 * Métodos:
 * - refreshDashboard() → Atualiza métricas do dashboard
 * - refreshRiskRankings() → Recalcula ranking de riscos
 * - refreshAll() → Atualiza todos os caches
 */

@Injectable()
export class CacheRefreshService {
    private readonly logger = new Logger('CacheRefreshService');

    constructor(private dataSource: DataSource) { }

    /**
     * Refresh dashboard metrics materialized view
     * Executa: REFRESH MATERIALIZED VIEW CONCURRENTLY company_dashboard_metrics
     */
    async refreshDashboard(companyId?: string): Promise<{
        status: string;
        table: string;
        duration_ms: number;
        timestamp: string;
    }> {
        const startTime = Date.now();
        this.logger.log(
            `[Dashboard] Starting refresh${companyId ? ` for company ${companyId}` : ''}...`,
        );

        try {
            await this.dataSource.query(`
        REFRESH MATERIALIZED VIEW CONCURRENTLY company_dashboard_metrics
      `);

            const duration = Date.now() - startTime;

            this.logger.log(
                `[Dashboard] Refresh completed in ${duration}ms`,
            );

            return {
                status: 'success',
                table: 'company_dashboard_metrics',
                duration_ms: duration,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`[Dashboard] Refresh failed: ${error.message}`);
            throw {
                status: 'error',
                table: 'company_dashboard_metrics',
                error: error.message,
                timestamp: new Date().toISOString(),
            };
        }
    }

    /**
     * Refresh APR risk rankings materialized view
     * Executa: REFRESH MATERIALIZED VIEW CONCURRENTLY apr_risk_rankings
     */
    async refreshRiskRankings(companyId?: string): Promise<{
        status: string;
        table: string;
        duration_ms: number;
        timestamp: string;
    }> {
        const startTime = Date.now();
        this.logger.log(
            `[RiskRankings] Starting refresh${companyId ? ` for company ${companyId}` : ''}...`,
        );

        try {
            await this.dataSource.query(`
        REFRESH MATERIALIZED VIEW CONCURRENTLY apr_risk_rankings
      `);

            const duration = Date.now() - startTime;

            this.logger.log(
                `[RiskRankings] Refresh completed in ${duration}ms`,
            );

            return {
                status: 'success',
                table: 'apr_risk_rankings',
                duration_ms: duration,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`[RiskRankings] Refresh failed: ${error.message}`);
            throw {
                status: 'error',
                table: 'apr_risk_rankings',
                error: error.message,
                timestamp: new Date().toISOString(),
            };
        }
    }

    /**
     * Refresh all materialized views
     * Executado periodicamente (cron job) ou on-demand via API
     */
    async refreshAll(): Promise<{
        status: string;
        views: any[];
        total_duration_ms: number;
        timestamp: string;
    }> {
        const startTime = Date.now();
        const results: { status: string; table: string; duration_ms?: number; timestamp?: string; error?: any }[] = [];

        this.logger.log('[CacheRefresh] Starting full cache refresh...');

        try {
            // Refresh dashboard metrics
            const dashboardResult = await this.refreshDashboard().catch((e) => ({
                status: 'error',
                table: 'company_dashboard_metrics',
                error: e.message,
            }));
            results.push(dashboardResult);

            // Refresh risk rankings
            const riskResult = await this.refreshRiskRankings().catch((e) => ({
                status: 'error',
                table: 'apr_risk_rankings',
                error: e.message,
            }));
            results.push(riskResult);

            const totalDuration = Date.now() - startTime;

            this.logger.log(
                `[CacheRefresh] All caches refreshed in ${totalDuration}ms`,
            );

            return {
                status: results.every((r) => r.status === 'success')
                    ? 'success'
                    : 'partial',
                views: results,
                total_duration_ms: totalDuration,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const totalDuration = Date.now() - startTime;

            this.logger.error(
                `[CacheRefresh] Full refresh failed: ${error.message}`,
            );

            return {
                status: 'error',
                views: results,
                total_duration_ms: totalDuration,
                timestamp: new Date().toISOString(),
            };
        }
    }

    /**
     * Invalidate cache timestamp (register last refresh)
     * Useful for monitoring cache freshness
     */
    async getCacheStatus(): Promise<{
        views: {
            name: string;
            row_count: number;
            last_refresh?: string;
        }[];
        timestamp: string;
    }> {
        try {
            const dashboardStatus = await this.dataSource.query(`
        SELECT COUNT(*) as row_count FROM company_dashboard_metrics
      `);

            const riskStatus = await this.dataSource.query(`
        SELECT COUNT(*) as row_count FROM apr_risk_rankings
      `);

            return {
                views: [
                    {
                        name: 'company_dashboard_metrics',
                        row_count: parseInt(dashboardStatus[0]?.row_count || 0),
                    },
                    {
                        name: 'apr_risk_rankings',
                        row_count: parseInt(riskStatus[0]?.row_count || 0),
                    },
                ],
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Failed to get cache status: ${error.message}`);
            throw error;
        }
    }
}
