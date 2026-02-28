import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { MetricsService } from './metrics.service';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly metricsService: MetricsService,
    private readonly dataSource: DataSource,
  ) {}

  private getNumberEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : fallback;
  }

  private getPoolStats(): {
    total?: number;
    idle?: number;
    waiting?: number;
    max?: number;
    min?: number;
    active?: number;
    usage?: number;
  } {
    try {
      const driver = this.dataSource.driver as unknown as {
        master?: {
          totalCount?: number;
          idleCount?: number;
          waitingCount?: number;
          options?: { max?: number; min?: number };
        };
      };
      const pool = driver.master;
      if (!pool) return {};

      const total = pool.totalCount ?? 0;
      const idle = pool.idleCount ?? 0;
      const waiting = pool.waitingCount ?? 0;
      const max =
        pool.options?.max ?? this.getNumberEnv('DB_POOL_MAX', 10);
      const active = Math.max(0, total - idle);
      const usage = max > 0 ? active / max : undefined;

      return { total, idle, waiting, max, min: pool.options?.min, active, usage };
    } catch {
      return {};
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  run(): void {
    if (process.env.ALERTS_ENABLED !== 'true') return;

    const minRequests = this.getNumberEnv('ALERTS_MIN_REQUESTS', 20);

    // 1) Error rate > 5%
    const errorRateThreshold = this.getNumberEnv(
      'ALERTS_ERROR_RATE_THRESHOLD',
      0.05,
    );
    const http = this.metricsService.snapshotAndResetHttpWindow();
    if (
      http.count >= minRequests &&
      http.errorRate !== null &&
      http.errorRate > errorRateThreshold
    ) {
      this.logger.warn({
        alert: 'HTTP_ERROR_RATE_HIGH',
        threshold: errorRateThreshold,
        errorRate: http.errorRate,
        samples: http.count,
        action:
          'Verificar logs/traces (5xx), estado de circuit breakers e dependências externas; considerar rollback/scale.',
        runbook: 'backend/OPERATIONS_RUNBOOK.md',
      });
    }

    // 2) Avg latency > 2s
    const latencyThresholdMs = this.getNumberEnv(
      'ALERTS_HTTP_AVG_LATENCY_MS_THRESHOLD',
      2000,
    );
    if (
      http.count >= minRequests &&
      http.avgDurationMs !== null &&
      http.avgDurationMs > latencyThresholdMs
    ) {
      this.logger.warn({
        alert: 'HTTP_AVG_LATENCY_HIGH',
        thresholdMs: latencyThresholdMs,
        avgMs: http.avgDurationMs,
        maxMs: http.maxDurationMs,
        samples: http.count,
        action:
          'Checar DB pool, queries lentas e fila; aumentar DB_POOL_MAX/instâncias e investigar endpoints mais lentos.',
        runbook: 'backend/OPERATIONS_RUNBOOK.md',
      });
    }

    // 3) Pool usage > 80%
    const poolUsageThreshold = this.getNumberEnv(
      'ALERTS_POOL_USAGE_THRESHOLD',
      0.8,
    );
    const pool = this.getPoolStats();
    if (typeof pool.usage === 'number' && pool.usage > poolUsageThreshold) {
      this.logger.warn({
        alert: 'DB_POOL_USAGE_HIGH',
        threshold: poolUsageThreshold,
        usage: pool.usage,
        active: pool.active,
        total: pool.total,
        idle: pool.idle,
        waiting: pool.waiting,
        max: pool.max,
        action:
          'Aumentar DB_POOL_MAX com cuidado (limite do Postgres) ou escalar instâncias; investigar leaks/requests longas.',
        runbook: 'backend/OPERATIONS_RUNBOOK.md',
      });
    }
  }
}
