import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

type StatsWindow = {
  count: number;
  sumMs: number;
  maxMs: number;
};

function emptyWindow(): StatsWindow {
  return { count: 0, sumMs: 0, maxMs: 0 };
}

function record(window: StatsWindow, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  window.count += 1;
  window.sumMs += ms;
  window.maxMs = Math.max(window.maxMs, ms);
}

function avg(window: StatsWindow): number | null {
  if (!window.count) return null;
  return window.sumMs / window.count;
}

@Injectable()
export class DbTimingsService {
  private readonly logger = new Logger(DbTimingsService.name);

  private borrowWait = emptyWindow();
  private rlsContextSet = emptyWindow();
  private queries = emptyWindow();

  isEnabled(): boolean {
    return process.env.DB_TIMINGS_ENABLED === 'true';
  }

  recordBorrowWait(ms: number): void {
    if (!this.isEnabled()) return;
    record(this.borrowWait, ms);
  }

  recordRlsContextSet(ms: number): void {
    if (!this.isEnabled()) return;
    record(this.rlsContextSet, ms);
  }

  recordQuery(ms: number): void {
    if (!this.isEnabled()) return;
    record(this.queries, ms);
  }

  constructor(private readonly dataSource: DataSource) {}

  @Cron(CronExpression.EVERY_MINUTE)
  logAverages(): void {
    if (!this.isEnabled()) return;

    const borrowAvg = avg(this.borrowWait);
    const rlsAvg = avg(this.rlsContextSet);
    const queryAvg = avg(this.queries);

    const poolStats = this.getPoolStats();

    this.logger.log({
      event: 'DB_TIMINGS_1M',
      borrow: {
        avgMs: borrowAvg,
        maxMs: this.borrowWait.maxMs,
        samples: this.borrowWait.count,
      },
      rlsContextSet: {
        avgMs: rlsAvg,
        maxMs: this.rlsContextSet.maxMs,
        samples: this.rlsContextSet.count,
      },
      query: {
        avgMs: queryAvg,
        maxMs: this.queries.maxMs,
        samples: this.queries.count,
      },
      pool: poolStats,
    });

    // Reset window after logging (rolling by minute)
    this.borrowWait = emptyWindow();
    this.rlsContextSet = emptyWindow();
    this.queries = emptyWindow();
  }

  private getPoolStats():
    | {
        total?: number;
        idle?: number;
        waiting?: number;
        max?: number;
        min?: number;
      }
    | undefined {
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
      if (!pool) return undefined;

      return {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: pool.options?.max,
        min: pool.options?.min,
      };
    } catch {
      return undefined;
    }
  }
}
