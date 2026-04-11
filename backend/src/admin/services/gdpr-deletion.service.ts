import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuid } from 'uuid';

/**
 * ⚖️ GDPR Data Deletion Service
 * Implementa "Direito ao Esquecimento" conforme LGPD/GDPR
 *
 * Métodos:
 * - deleteUserData(userId) → Anônima todos os dados do usuário
 * - deleteCompanyData(companyId) → Cleanup total (escalonado)
 * - deleteExpiredData() → Cleanup TTL automático
 * - getDeleteRequestStatus(requestId) → Status da operação
 */

export interface GDPRDeleteRequest {
  id: string;
  user_id: string;
  request_date: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  tables_processed: { table: string; rows_deleted: number }[];
  error_message?: string;
  completed_date?: Date;
}

type GDPRDeletionCountRow = {
  table_name?: string;
  deleted_count?: string | number;
};

type GDPRConsentRow = {
  ai_processing_consent?: boolean;
};

@Injectable()
export class GDPRDeletionService {
  private readonly logger = new Logger('GDPRDeletionService');

  // Rastreia requisições de deleção em memória (para demo, usar DB em prod)
  private deleteRequests = new Map<string, GDPRDeleteRequest>();

  constructor(private dataSource: DataSource) {}

  private async queryRows<T>(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<T[]> {
    return this.dataSource.query(sql, parameters);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return typeof error === 'string' ? error : 'Unknown GDPR error';
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

  private getAffectedRowCount(result: unknown): number {
    if (typeof result === 'number') {
      return Number.isFinite(result) ? result : 0;
    }

    if (Array.isArray(result)) {
      const firstItem: unknown = result[0];

      if (typeof firstItem === 'number') {
        return Number.isFinite(firstItem) ? firstItem : 0;
      }

      return result.length;
    }

    return 0;
  }

  /**
   * Anônima todos os dados de um usuário
   * Implementa: SELECT * FROM gdpr_delete_user_data(user_id)
   */
  async deleteUserData(userId: string): Promise<GDPRDeleteRequest> {
    const requestId = uuid();
    const request: GDPRDeleteRequest = {
      id: requestId,
      user_id: userId,
      request_date: new Date(),
      status: 'in_progress',
      tables_processed: [],
    };

    this.deleteRequests.set(requestId, request);
    this.logger.log(
      `[GDPR] User deletion request: ${userId} (Request ID: ${requestId})`,
    );

    try {
      // Validar UUID format
      if (!this.isValidUUID(userId)) {
        throw new BadRequestException('Invalid user ID format');
      }

      // Execute GDPR function no banco
      const result = await this.queryRows<GDPRDeletionCountRow>(
        `SELECT * FROM gdpr_delete_user_data($1)`,
        [userId],
      );

      // Processar resultados
      for (const row of result) {
        const tableName = row.table_name ?? 'unknown';
        const deletedCount = this.toInt(row.deleted_count);

        request.tables_processed.push({
          table: tableName,
          rows_deleted: deletedCount,
        });

        this.logger.log(`  ✓ ${tableName}: ${deletedCount} rows anonymized`);
      }

      request.status = 'completed';
      request.completed_date = new Date();

      this.logger.log(
        `[GDPR] User deletion completed. Total tables: ${request.tables_processed.length}`,
      );

      return request;
    } catch (error: unknown) {
      request.status = 'failed';
      request.error_message = this.getErrorMessage(error);
      request.completed_date = new Date();

      this.logger.error(
        `[GDPR] User deletion failed: ${this.getErrorMessage(error)}`,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      return request;
    } finally {
      this.deleteRequests.set(requestId, request);
    }
  }

  /**
   * Execute cleanup de dados expirados (TTL)
   * Implementa: SELECT * FROM cleanup_expired_data()
   *
   * Executa:
   * - mail_logs: 90 dias
   * - user_sessions: 30 dias expiradas
   * - forensic_trail_events: 2 anos
   * - activities: 1 ano
   * - audit_logs: 2 anos
   */
  async deleteExpiredData(): Promise<{
    status: string;
    tables_cleaned: { table: string; rows_deleted: number }[];
    total_rows_deleted: number;
    duration_ms: number;
    timestamp: string;
    error?: string;
  }> {
    const startTime = Date.now();
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

        tables_cleaned.push({
          table: tableName,
          rows_deleted: deletedCount,
        });

        totalRows += deletedCount;

        this.logger.log(`  ✓ ${tableName}: ${deletedCount} rows deleted`);
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `[TTL] Cleanup completed. Total rows deleted: ${totalRows} in ${duration}ms`,
      );

      return {
        status: 'success',
        tables_cleaned,
        total_rows_deleted: totalRows,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      this.logger.error(`[TTL] Cleanup failed: ${message}`);

      return {
        status: 'error',
        tables_cleaned: [],
        total_rows_deleted: 0,
        duration_ms: Date.now() - startTime,
        error: message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get status of a deletion request
   */
  getDeleteRequestStatus(requestId: string): GDPRDeleteRequest | null {
    return this.deleteRequests.get(requestId) || null;
  }

  /**
   * Get all pending deletion requests
   */
  getPendingRequests(): GDPRDeleteRequest[] {
    return Array.from(this.deleteRequests.values()).filter(
      (r) => r.status === 'pending' || r.status === 'in_progress',
    );
  }

  /**
   * Soft-delete a company and all associated data
   * ⚠️ Enterprise only - requires careful planning
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
    this.logger.warn(
      `[GDPR] This will soft-delete all associated data. Hard-delete happens after retention period.`,
    );

    try {
      // Find all tables with company_id
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
          // Soft-delete: SET deleted_at = NOW()
          const result: unknown = await this.dataSource.query(
            `UPDATE "${table}" SET deleted_at = $1 WHERE company_id = $2 AND deleted_at IS NULL`,
            [now, companyId],
          );

          const affectedRows = this.getAffectedRowCount(result);
          totalRows += affectedRows;
          this.logger.log(`  ✓ ${table}: ${affectedRows} rows soft-deleted`);
        } catch {
          this.logger.warn(
            `  ⚠️  ${table}: Could not soft-delete (table may not have company_id)`,
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
    } catch (error: unknown) {
      this.logger.error(
        `[GDPR] Enterprise deletion failed: ${this.getErrorMessage(error)}`,
      );

      throw error instanceof Error
        ? error
        : new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Validate user consent before deletion
   * Check ai_processing_consent flag
   */
  async validateUserConsent(userId: string): Promise<{
    can_delete: boolean;
    reason?: string;
  }> {
    try {
      const result = await this.queryRows<GDPRConsentRow>(
        `SELECT ai_processing_consent FROM users WHERE id = $1`,
        [userId],
      );

      if (result.length === 0) {
        return { can_delete: false, reason: 'User not found' };
      }

      const hasConsent = Boolean(result[0]?.ai_processing_consent);

      return {
        can_delete: true,
        reason: hasConsent
          ? 'User has AI processing consent - can delete'
          : 'User did not consent to AI processing',
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to validate consent: ${this.getErrorMessage(error)}`,
      );
      throw error instanceof Error
        ? error
        : new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Helper: Validate UUID format
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}
