import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { GdprDeletionRequest } from '../entities/gdpr-deletion-request.entity';
import {
  GdprRetentionCleanupRun,
  GdprRetentionCleanupTrigger,
} from '../entities/gdpr-retention-cleanup-run.entity';
import { TenantService } from '../../../shared/tenant/tenant.service';
import { PrivilegedDbService } from '../../../shared/database/privileged-db.service';

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

export type DeleteCompanyDataResult =
  | {
      status: 'success';
      company_id: string;
      tables_affected: number;
      total_rows_deleted: number;
      warning: string;
      timestamp: string;
    }
  | {
      status: 'failed';
      company_id: string;
      failures: Array<{ table: string; error: string }>;
      timestamp: string;
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
    private readonly tenantService: TenantService,
    private readonly privilegedDb: PrivilegedDbService,
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
   * Anonima todos os dados de um usuario (LGPD Art. 18, VI).
   * Persiste a requisicao em banco para auditoria e sobreviver a restarts.
   */
  async deleteUserData(userId: string): Promise<GdprDeletionRequest> {
    if (!this.isValidUUID(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    // Idempotencia: retorna requisicao existente se ja concluida ou em andamento
    const existing = await this.deletionRequestRepo.findOne({
      where: { user_id: userId, status: In(['completed', 'in_progress']) },
      order: { request_date: 'DESC' },
    });
    if (existing) {
      this.logger.log(
        `[GDPR] Duplicate deletion request for ${userId} — returning existing record ${existing.id} (status=${existing.status})`,
      );
      return existing;
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
      // Contexto super-admin OBRIGATÓRIO: gdpr_delete_user_data() não é
      // SECURITY DEFINER e a role runtime (sgs_app) não tem BYPASSRLS. Todas
      // as tabelas alvo têm RLS com FORCE — sem este wrap, a RLS filtra as
      // linhas do titular e a função anonimiza 0 registros, reportando
      // "completed" com sucesso. O direito de exclusão (LGPD Art. 18, VI)
      // ficava sem efeito, silenciosamente.
      const result = await this.runAsGlobalSuperAdmin(() =>
        this.queryRows<GDPRDeletionCountRow>(
          `SELECT * FROM gdpr_delete_user_data($1)`,
          [userId],
        ),
      );

      for (const row of result) {
        const tableName = row.table_name ?? 'unknown';
        const deletedCount = this.toInt(row.deleted_count);
        record.tables_processed.push({
          table: tableName,
          rows_deleted: deletedCount,
        });
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
   * Executa cleanup de dados expirados (TTL automatico).
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

    return this.runAsGlobalSuperAdmin(async () => {
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
    });
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
   * Soft-delete atomico de empresa e todos os dados associados (LGPD offboarding).
   * All-or-nothing: qualquer falha de tabela faz rollback completo da transacao.
   */
  async deleteCompanyData(companyId: string): Promise<DeleteCompanyDataResult> {
    if (!this.isValidUUID(companyId)) {
      throw new BadRequestException('Invalid company ID format');
    }

    this.logger.warn(
      `[GDPR] ENTERPRISE: Soft-delete company ${companyId} initiated`,
    );

    // Descoberta dinamica fora da transacao (read-only, information_schema).
    const discoveredRows = await this.dataSource.query<
      { table_name: string }[]
    >(`
      SELECT DISTINCT c.table_name
      FROM information_schema.columns c
      INNER JOIN information_schema.columns d
        ON d.table_name = c.table_name
        AND d.table_schema = 'public'
        AND d.column_name = 'deleted_at'
      WHERE c.column_name = 'company_id'
        AND c.table_schema = 'public'
      ORDER BY c.table_name
    `);
    const tables = discoveredRows.map((r) => r.table_name);
    this.logger.log(
      `[GDPR] Discovered ${tables.length} tables with company_id + deleted_at`,
    );

    let totalRows = 0;
    const now = new Date();
    let failedTable = '<unknown>';

    try {
      if (this.privilegedDb.isEnabled()) {
        await this.privilegedDb.withPrivilegedClient(async (client) => {
          await client.query('BEGIN');
          try {
            await client.query("SET LOCAL app.is_super_admin = 'true'");
            for (const table of tables) {
              failedTable = table;
              const result = await client.query(
                `UPDATE "${table}" SET deleted_at = $1 WHERE company_id = $2 AND deleted_at IS NULL`,
                [now, companyId],
              );
              const affectedRows = result.rowCount ?? 0;
              totalRows += affectedRows;
              this.logger.log(
                `  ✓ ${table}: ${affectedRows} rows soft-deleted`,
              );
            }
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          }
        });
      } else {
        await this.dataSource.transaction(async (manager: EntityManager) => {
          // Garante bypass de RLS para o offboarding cross-tenant, independentemente
          // do tenant que o ADMIN_GERAL chamador tenha selecionado (x-company-id).
          await manager.query("SET LOCAL app.is_super_admin = 'true'");
          for (const table of tables) {
            failedTable = table;
            const result: unknown = await manager.query(
              `UPDATE "${table}" SET deleted_at = $1 WHERE company_id = $2 AND deleted_at IS NULL`,
              [now, companyId],
            );
            const affectedRows = this.getAffectedRowCount(result);
            totalRows += affectedRows;
            this.logger.log(`  ✓ ${table}: ${affectedRows} rows soft-deleted`);
          }
        });
      }

      this.logger.warn(
        `[GDPR] ENTERPRISE: Company ${companyId} soft-deleted — ${tables.length} tables, ${totalRows} rows affected`,
      );
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
      const message = this.getErrorMessage(error);
      this.logger.error(
        `[GDPR] ENTERPRISE: Company ${companyId} soft-delete FAILED on table "${failedTable}" — transaction rolled back. ${message}`,
      );
      return {
        status: 'failed',
        company_id: companyId,
        failures: [{ table: failedTable, error: message }],
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Verifica se um usuario e elegivel para delecao (LGPD Art. 18, VI).
   *
   * Retorna can_delete: false se:
   * - Usuario nao existe
   * - Ja existe requisicao pending/in_progress para este usuario (evita duplicatas)
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

  private runAsGlobalSuperAdmin<T>(callback: () => Promise<T>): Promise<T> {
    return Promise.resolve(
      this.tenantService.run(
        { companyId: undefined, isSuperAdmin: true, siteScope: 'all' },
        callback,
      ),
    );
  }
}
