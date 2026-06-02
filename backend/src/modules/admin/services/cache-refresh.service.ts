import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

interface RefreshResult {
  status: 'success' | 'error';
  table: string;
  duration_ms?: number;
  timestamp?: string;
  error?: string;
}

interface RefreshAllResult {
  status: 'success' | 'partial' | 'error';
  views: RefreshResult[];
  total_duration_ms: number;
  timestamp: string;
}

interface CacheStatusRow {
  row_count?: string | number;
}

interface MaterializedViewRow {
  matviewname?: string;
}

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

  constructor(private dataSource: DataSource) {}

  private async queryRows<T>(sql: string): Promise<T[]> {
    return this.dataSource.query(sql);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return typeof error === 'string' ? error : 'Unknown cache refresh error';
  }

  private toInt(value: unknown): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    }

    return 0;
  }

  private async getAvailableMaterializedViews(
    viewNames: string[],
  ): Promise<Set<string>> {
    const rows: MaterializedViewRow[] = await this.dataSource.query(
      `
        SELECT matviewname
        FROM pg_matviews
        WHERE schemaname = current_schema()
          AND matviewname = ANY($1::text[])
      `,
      [viewNames],
    );

    return new Set(
      rows
        .map((row) => row.matviewname)
        .filter((name): name is string => typeof name === 'string'),
    );
  }

  /**
   * Refresh dashboard metrics materialized view
   * Executa: REFRESH MATERIALIZED VIEW CONCURRENTLY company_dashboard_metrics
   */
  async refreshDashboard(companyId?: string): Promise<RefreshResult> {
    const startTime = Date.now();
    this.logger.log(
      `[Dashboard] Starting refresh${companyId ? ` for company ${companyId}` : ''}...`,
    );

    try {
      await this.dataSource.query(`
        REFRESH MATERIALIZED VIEW CONCURRENTLY company_dashboard_metrics
      `);

      const duration = Date.now() - startTime;

      this.logger.log(`[Dashboard] Refresh completed in ${duration}ms`);

      return {
        status: 'success',
        table: 'company_dashboard_metrics',
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      this.logger.error(`[Dashboard] Refresh failed: ${message}`);
      throw new ServiceUnavailableException(
        'Falha ao atualizar cache do dashboard.',
      );
    }
  }

  /**
   * Refresh APR risk rankings materialized view
   * Executa: REFRESH MATERIALIZED VIEW CONCURRENTLY apr_risk_rankings
   */
  async refreshRiskRankings(companyId?: string): Promise<RefreshResult> {
    const startTime = Date.now();
    this.logger.log(
      `[RiskRankings] Starting refresh${companyId ? ` for company ${companyId}` : ''}...`,
    );

    try {
      await this.dataSource.query(`
        REFRESH MATERIALIZED VIEW CONCURRENTLY apr_risk_rankings
      `);

      const duration = Date.now() - startTime;

      this.logger.log(`[RiskRankings] Refresh completed in ${duration}ms`);

      return {
        status: 'success',
        table: 'apr_risk_rankings',
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      this.logger.error(`[RiskRankings] Refresh failed: ${message}`);
      throw new ServiceUnavailableException(
        'Falha ao atualizar cache de rankings de risco.',
      );
    }
  }

  /**
   * Refresh all materialized views
   * Executado periodicamente (cron job) ou on-demand via API
   */
  async refreshAll(): Promise<RefreshAllResult> {
    const startTime = Date.now();
    const results: RefreshResult[] = [];

    this.logger.log('[CacheRefresh] Starting full cache refresh...');

    try {
      // Refresh dashboard metrics
      const dashboardResult: RefreshResult =
        await this.refreshDashboard().catch(
          (error: unknown): RefreshResult => ({
            status: 'error',
            table: 'company_dashboard_metrics',
            error: this.getErrorMessage(error),
          }),
        );
      results.push(dashboardResult);

      // Refresh risk rankings
      const riskResult: RefreshResult = await this.refreshRiskRankings().catch(
        (error: unknown): RefreshResult => ({
          status: 'error',
          table: 'apr_risk_rankings',
          error: this.getErrorMessage(error),
        }),
      );
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
    } catch (error: unknown) {
      const totalDuration = Date.now() - startTime;

      this.logger.error(
        `[CacheRefresh] Full refresh failed: ${this.getErrorMessage(error)}`,
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
      available: boolean;
      last_refresh?: string;
    }[];
    timestamp: string;
  }> {
    try {
      const requestedViews = [
        'company_dashboard_metrics',
        'apr_risk_rankings',
      ] as const;
      const availableViews = await this.getAvailableMaterializedViews([
        ...requestedViews,
      ]);
      const dashboardAvailable = availableViews.has(
        'company_dashboard_metrics',
      );
      const riskAvailable = availableViews.has('apr_risk_rankings');

      const dashboardStatus = dashboardAvailable
        ? await this.queryRows<CacheStatusRow>(`
            SELECT COUNT(*) as row_count FROM company_dashboard_metrics
          `)
        : [];

      const riskStatus = riskAvailable
        ? await this.queryRows<CacheStatusRow>(`
            SELECT COUNT(*) as row_count FROM apr_risk_rankings
          `)
        : [];

      if (!dashboardAvailable || !riskAvailable) {
        this.logger.warn(
          `[CacheStatus] Materialized views unavailable: ${requestedViews
            .filter((viewName) => !availableViews.has(viewName))
            .join(', ')}`,
        );
      }

      return {
        views: [
          {
            name: 'company_dashboard_metrics',
            row_count: this.toInt(dashboardStatus[0]?.row_count),
            available: dashboardAvailable,
          },
          {
            name: 'apr_risk_rankings',
            row_count: this.toInt(riskStatus[0]?.row_count),
            available: riskAvailable,
          },
        ],
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to get cache status: ${this.getErrorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'Falha ao consultar status do cache.',
      );
    }
  }
}
