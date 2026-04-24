import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { GdprDeletionRequest } from '../entities/gdpr-deletion-request.entity';
import {
  GdprRetentionCleanupRun,
  GdprRetentionCleanupTrigger,
} from '../entities/gdpr-retention-cleanup-run.entity';

export type { GdprDeletionRequest as GDPRDeleteRequest };

type GDPRDeletionCountRow = {
  table_name?: string;
  deleted_count?: string | number;
};

type DeleteExpiredDataOptions = {
  triggeredBy?: GdprRetentionCleanupTrigger;
  triggerSource?: string;
};

type DeleteExpiredDataResult = {
  status: string;
  run_id?: string;
  tables_cleaned: { table: string; rows_deleted: number }[];
  total_rows_deleted: number;
  duration_ms: number;
  timestamp: string;
  error?: string;
};

@Injectable()
export class GDPRDeletionService {
  private readonly logger = new Logger('GDPRDeletionService');

  constructor(
    private dataSource: DataSource,
    @InjectRepository(GdprDeletionRequest)
    private deletionRequestRepo: Repository<GdprDeletionRequest>,
    @InjectRepository(GdprRetentionCleanupRun)
    private retentionCleanupRunRepo: Repository<GdprRetentionCleanupRun>,
  ) {}

  private async queryRows<T>(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<T[]> {
    return this.dataSource.query(sql, parameters);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : 'Unknown GDPR error';
  }

  private toInt(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  private getAffectedRowCount(result: unknown): number {
    if (typeof result === 'number') return Number.isFinite(result) ? result : 0;
    if (Array.isArray(result)) {
      const firstItem: unknown = result[0];
      if (typeof firstItem === 'number')
        return Number.isFinite(firstItem) ? firstItem : 0;
      return result.length;
    }
    return 0;
  }

  private isValidUUID(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    );
  }

  /**
   * Anônima todos os dados de um usuário (LGPD Art. 18, VI).
   * Persiste a requisição em banco para auditoria e sobreviver a restarts.
   */
  async deleteUserData(userId: string): Promise<GdprDeletionRequest> {
    if (!this.isValidUUID(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const record = this.deletionRequestRepo.create({
      id: uuid(),
      user_id: userId,
      request_date: new Date(),
      status: 'in_progress',
      tables_processed: [],
      error_message: null,
      completed_date: null,
    });

    await this.deletionRequestRepo.save(record);
    this.logger.log(
      `[GDPR] User deletion request: ${userId} (Request ID: ${record.id})`,
    );

    try {
      const result = await this.queryRows<GDPRDeletionCountRow>(
        `SELECT * FROM gdpr_delete_user_data($1)`,
        [userId],
      );

      for (const row of result) {
        const tableName = row.table_name ?? 'unknown';
        const deletedCount = this.toInt(row.deleted_count);
        record.tables_processed.push({ table: tableName, rows_deleted: deletedCount });
        this.logger.log(`  ✓ ${tableName}: ${deletedCount} rows anonymized`);
      }

      record.status = 'completed';
      record.completed_date = new Date();
      this.logger.log(
        `[GDPR] User deletion completed. Total tables: ${record.tables_processed.length}`,
      );
    } catch (error: unknown) {
      record.status = 'failed';
      record.error_message = this.getErrorMessage(error);
      record.completed_date = new Date();
      this.logger.error(
        `[GDPR] User deletion failed: ${this.getErrorMessage(error)}`,
      );
    } finally {
      await this.deletionRequestRepo.save(record);
    }

    return record;
  }

  /**
   * Executa cleanup de dados expirados (TTL automático).
   */
  async deleteExpiredData(
    options: DeleteExpiredDataOptions = {},
  ): Promise<DeleteExpiredDataResult> {
    const startTime = Date.now();
    const startedAt = new Date();
    const triggeredBy = options.triggeredBy ?? 'manual';
    const triggerSource =
      options.triggerSource ??
      (triggeredBy === 'scheduled'
        ? 'worker:gdpr-retention-cleanup'
        : 'admin:gdpr-cleanup-expired');
    this.logger.log('[TTL] Starting expired data cleanup...');

    try {
      const result = await this.queryRows<GDPRDeletionCountRow>(
        `SELECT * FROM cleanup_expired_data()`,
      );

      let totalRows = 0;
      const tables_cleaned: { table: string; rows_deleted: number }[] = [];

      for (const row of result) {
        const tableName = row.table_name ?? 'unknown';
        const deletedCount = this.toInt(row.deleted_count);
        tables_cleaned.push({ table: tableName, rows_deleted: deletedCount });
        totalRows += deletedCount;
        this.logger.log(`  ✓ ${tableName}: ${deletedCount} rows deleted`);
      }

      const duration = Date.now() - startTime;
      const completedAt = new Date();
      const run = await this.retentionCleanupRunRepo.save(
        this.retentionCleanupRunRepo.create({
          status: 'success',
          triggered_by: triggeredBy,
          trigger_source: triggerSource,
          tables_cleaned,
          total_rows_deleted: totalRows,
          duration_ms: duration,
          error_message: null,
          started_at: startedAt,
          completed_at: completedAt,
        }),
      );
      this.logger.log(
        `[TTL] Cleanup completed. Run ${run.id}. Total rows deleted: ${totalRows} in ${duration}ms`,
      );

      return {
        status: 'success',
        run_id: run.id,
        tables_cleaned,
        total_rows_deleted: totalRows,
        duration_ms: duration,
        timestamp: completedAt.toISOString(),
      };
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      const completedAt = new Date();
      const duration = Date.now() - startTime;
      const run = await this.retentionCleanupRunRepo.save(
        this.retentionCleanupRunRepo.create({
          status: 'error',
          triggered_by: triggeredBy,
          trigger_source: triggerSource,
          tables_cleaned: [],
          total_rows_deleted: 0,
          duration_ms: duration,
          error_message: message,
          started_at: startedAt,
          completed_at: completedAt,
        }),
      );
      this.logger.error(`[TTL] Cleanup failed: ${message}`);

      return {
        status: 'error',
        run_id: run.id,
        tables_cleaned: [],
        total_rows_deleted: 0,
        duration_ms: duration,
        error: message,
        timestamp: completedAt.toISOString(),
      };
    }
  }

  async getDeleteRequestStatus(
    requestId: string,
  ): Promise<GdprDeletionRequest | null> {
    return this.deletionRequestRepo.findOne({ where: { id: requestId } });
  }

  async getPendingRequests(): Promise<GdprDeletionRequest[]> {
    return this.deletionRequestRepo.find({
      where: { status: In(['pending', 'in_progress']) },
      order: { request_date: 'DESC' },
    });
  }

  async getRetentionCleanupRuns(
    limit = 50,
  ): Promise<GdprRetentionCleanupRun[]> {
    const take = Math.min(Math.max(Math.trunc(limit), 1), 200);
    return this.retentionCleanupRunRepo.find({
      order: { created_at: 'DESC' },
      take,
    });
  }

  /**
   * Soft-delete de empresa e dados associados.
   */
  async deleteCompanyData(companyId: string): Promise<{
    status: string;
    company_id: string;
    tables_affected: number;
    total_rows_deleted: number;
    warning: string;
    timestamp: string;
  }> {
    if (!this.isValidUUID(companyId)) {
      throw new BadRequestException('Invalid company ID format');
    }

    this.logger.warn(
      `[GDPR] ENTERPRISE: Soft-delete company ${companyId} initiated`,
    );

    const tables = [
      'users',
      'sites',
      'aprs',
      'pts',
      'trainings',
      'medical_exams',
      'checklists',
      'inspections',
      'nonconformities',
      'corrective_actions',
      'audits',
      'cats',
      'document_registry',
      'mail_logs',
      'activities',
      'audit_logs',
    ];

    let totalRows = 0;
    const now = new Date();

    for (const table of tables) {
      try {
        const result: unknown = await this.dataSource.query(
          `UPDATE "${table}" SET deleted_at = $1 WHERE company_id = $2 AND deleted_at IS NULL`,
          [now, companyId],
        );
        const affectedRows = this.getAffectedRowCount(result);
        totalRows += affectedRows;
        this.logger.log(`  ✓ ${table}: ${affectedRows} rows soft-deleted`);
      } catch {
        this.logger.warn(
          `  ⚠  ${table}: Could not soft-delete (table may not have company_id)`,
        );
      }
    }

    return {
      status: 'success',
      company_id: companyId,
      tables_affected: tables.length,
      total_rows_deleted: totalRows,
      warning:
        'Company soft-deleted. Hard-delete by retention policy will occur automatically.',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Verifica se um usuário é elegível para deleção (LGPD Art. 18, VI).
   *
   * Retorna can_delete: false se:
   * - Usuário não existe
   * - Já existe requisição pending/in_progress para este usuário (evita duplicatas)
   */
  async validateUserConsent(userId: string): Promise<{
    can_delete: boolean;
    reason?: string;
  }> {
    const users = await this.queryRows<{ id: string }>(
      `SELECT id FROM users WHERE id = $1`,
      [userId],
    );

    if (users.length === 0) {
      return { can_delete: false, reason: 'User not found' };
    }

    const existing = await this.deletionRequestRepo.findOne({
      where: { user_id: userId, status: In(['pending', 'in_progress']) },
    });

    if (existing) {
      return {
        can_delete: false,
        reason: `Deletion request already ${existing.status} (id: ${existing.id})`,
      };
    }

    return { can_delete: true };
  }
}
