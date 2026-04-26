import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface DatabaseStatus {
  healthy: boolean;
  responseTime: number;
  error?: string;
}

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  percentage: number;
}

export interface PoolStats {
  /** Live connections currently held open by the pg pool. */
  total: number;
  /** Connections idle in the pool, ready to be checked out. */
  idle: number;
  /** Pending checkout requests waiting for a free connection. */
  waiting: number;
  /** Connections currently leased to handlers (total - idle). */
  inUse: number;
  /** Configured upper bound for the pool. */
  max: number;
  /**
   * Utilization 0–1. Above 0.8 sustained typically means the pool needs
   * resizing (DB_POOL_MAX) or queries are running too long.
   */
  utilization: number;
  /** Reported by the pg driver when in replication mode; null otherwise. */
  replica?: PoolStats | null;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async checkDatabase(): Promise<DatabaseStatus> {
    const startTime = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return {
        healthy: true,
        responseTime: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Database health check failed: ${message}`);
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: message,
      };
    }
  }

  getMemoryUsage(): MemoryUsage {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      rss: Math.round(usage.rss / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
      percentage: Math.round((usage.heapUsed / usage.heapTotal) * 100),
    };
  }

  /**
   * Snapshots the underlying pg pool. The TypeORM Postgres driver exposes the
   * raw `pg.Pool` at `driver.master`, with `slaves` populated when replication
   * is configured. We reach in through unknown casts because the public typings
   * stop at the abstract Driver interface.
   */
  getPoolStats(): PoolStats | null {
    type PgPool = {
      totalCount?: number;
      idleCount?: number;
      waitingCount?: number;
      options?: { max?: number };
    };
    type PgDriver = { master?: PgPool; slaves?: PgPool[] };

    const driver = (this.dataSource as unknown as { driver?: PgDriver }).driver;
    if (!driver?.master) {
      return null;
    }

    const snapshot = (pool: PgPool): PoolStats => {
      const total = Number(pool.totalCount ?? 0);
      const idle = Number(pool.idleCount ?? 0);
      const waiting = Number(pool.waitingCount ?? 0);
      const max = Number(pool.options?.max ?? 0);
      const inUse = Math.max(0, total - idle);
      const utilization = max > 0 ? Number((inUse / max).toFixed(3)) : 0;
      return { total, idle, waiting, inUse, max, utilization };
    };

    const stats = snapshot(driver.master);

    if (Array.isArray(driver.slaves) && driver.slaves.length > 0) {
      stats.replica = snapshot(driver.slaves[0]);
    } else {
      stats.replica = null;
    }

    return stats;
  }
}
