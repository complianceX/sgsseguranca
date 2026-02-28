import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

@Injectable()
export class DatabaseConnectionManager {
  private readonly logger = new Logger(DatabaseConnectionManager.name);

  constructor(private readonly dataSource: DataSource) {}

  async safeRawQuery<T>(query: string, parameters?: any[]): Promise<T[]> {
    const qr = this.dataSource.createQueryRunner();
    try {
      await qr.connect();
      const resultUnknown: unknown = await qr.query(query, parameters);
      return resultUnknown as T[];
    } finally {
      try {
        await qr.release();
      } catch (err: unknown) {
        const message =
          typeof err === 'object' && err && 'message' in err
            ? String((err as { message?: unknown }).message)
            : 'unknown error';
        this.logger.warn({
          event: 'query_runner_release_failed',
          message,
        } as Record<string, unknown>);
      }
    }
  }

  async safeTransaction<T>(
    executor: (qr: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const qr = this.dataSource.createQueryRunner();
    try {
      await qr.connect();
      await qr.startTransaction();
      const result = await executor(qr);
      await qr.commitTransaction();
      return result;
    } catch (error) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw error;
    } finally {
      try {
        await qr.release();
      } catch (err: unknown) {
        const message =
          typeof err === 'object' && err && 'message' in err
            ? String((err as { message?: unknown }).message)
            : 'unknown error';
        this.logger.warn({
          event: 'transaction_release_failed',
          message,
        } as Record<string, unknown>);
      }
    }
  }

  getConnectionPoolStatus(): {
    totalConnections: number;
    idleConnections: number;
    waitingConnections: number;
    activeConnections: number;
  } {
    let total = 0;
    let idle = 0;
    let waiting = 0;

    const ds: unknown = this.dataSource;
    if (ds && typeof ds === 'object') {
      const driver = (ds as Record<string, unknown>)['driver'];
      if (driver && typeof driver === 'object') {
        const pool = (driver as Record<string, unknown>)['pool'];
        if (pool && typeof pool === 'object') {
          const totalVal = (pool as Record<string, unknown>)['totalCount'];
          const idleVal = (pool as Record<string, unknown>)['idleCount'];
          const waitingVal = (pool as Record<string, unknown>)['waitingCount'];
          if (typeof totalVal === 'number') total = totalVal;
          if (typeof idleVal === 'number') idle = idleVal;
          if (typeof waitingVal === 'number') waiting = waitingVal;
        }
      }
    }

    return {
      totalConnections: total,
      idleConnections: idle,
      waitingConnections: waiting,
      activeConnections: Math.max(total - idle, 0),
    };
  }
}
