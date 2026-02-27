import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

@Injectable()
export class DatabaseConnectionManager {
  private readonly logger = new Logger(DatabaseConnectionManager.name);

  constructor(private readonly dataSource: DataSource) {}

  async safeRawQuery<T = any>(query: string, parameters?: any[]): Promise<T[]> {
    const qr = this.dataSource.createQueryRunner();
    try {
      await qr.connect();
      const result = await qr.query(query, parameters);
      return result as T[];
    } finally {
      try {
        await qr.release();
      } catch (err: any) {
        this.logger.warn({
          event: 'query_runner_release_failed',
          message: err?.message,
        });
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
      } catch (err: any) {
        this.logger.warn({
          event: 'transaction_release_failed',
          message: err?.message,
        });
      }
    }
  }

  async getConnectionPoolStatus(): Promise<{
    totalConnections: number;
    idleConnections: number;
    waitingConnections: number;
    activeConnections: number;
  }> {
    const pool = (this.dataSource as any)?.driver?.pool;
    const total = pool?.totalCount ?? 0;
    const idle = pool?.idleCount ?? 0;
    const waiting = pool?.waitingCount ?? 0;
    return {
      totalConnections: total,
      idleConnections: idle,
      waitingConnections: waiting,
      activeConnections: Math.max(total - idle, 0),
    };
  }
}
