import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { PoolClient } from 'pg';
import { Repository } from 'typeorm';
import { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import { TenantService } from '../../shared/tenant/tenant.service';
import { PrivilegedDbService } from '../../shared/database/privileged-db.service';
import type { AppendForensicTrailEventInput } from '../forensic-trail/forensic-trail.service';
import type {
  DisasterRecoveryExecutionInput,
  DisasterRecoveryExecutionResultInput,
} from './disaster-recovery.types';
import { DisasterRecoveryExecution } from './entities/disaster-recovery-execution.entity';

const DR_MODULE = 'disaster-recovery';

@Injectable()
export class DisasterRecoveryExecutionService {
  private readonly logger = new Logger(DisasterRecoveryExecutionService.name);

  constructor(
    @InjectRepository(DisasterRecoveryExecution)
    private readonly executionRepository: Repository<DisasterRecoveryExecution>,
    private readonly forensicTrailService: ForensicTrailService,
    private readonly tenantService: TenantService,
    private readonly privilegedDb: PrivilegedDbService,
  ) {}

  async startExecution(
    input: DisasterRecoveryExecutionInput,
  ): Promise<DisasterRecoveryExecution> {
    const execution = await this.runAsGlobalSuperAdmin(async () => {
      const savedExecution = await this.persistStartedExecution(input);

      await this.appendForensicEvent({
        eventType: 'dr_execution_started',
        module: DR_MODULE,
        entityId: savedExecution.id,
        userId: input.requestedByUserId ?? undefined,
        metadata: {
          operationType: savedExecution.operation_type,
          scope: savedExecution.scope,
          environment: savedExecution.environment,
          targetEnvironment: savedExecution.target_environment,
          triggerSource: savedExecution.trigger_source,
          backupName: savedExecution.backup_name,
        },
      });

      return savedExecution;
    });

    this.logger.log({
      event: 'dr_execution_started',
      executionId: execution.id,
      operationType: execution.operation_type,
      scope: execution.scope,
      environment: execution.environment,
      targetEnvironment: execution.target_environment,
      triggerSource: execution.trigger_source,
    });

    return execution;
  }

  async finalizeExecution(
    executionId: string,
    input: DisasterRecoveryExecutionResultInput,
  ): Promise<DisasterRecoveryExecution> {
    const saved = await this.runAsGlobalSuperAdmin(async () => {
      const finalized = await this.persistFinalizedExecution(
        executionId,
        input,
      );

      await this.appendForensicEvent({
        eventType:
          input.status === 'failed'
            ? 'dr_execution_failed'
            : 'dr_execution_completed',
        module: DR_MODULE,
        entityId: finalized.id,
        userId: finalized.requested_by_user_id ?? undefined,
        metadata: {
          operationType: finalized.operation_type,
          scope: finalized.scope,
          environment: finalized.environment,
          targetEnvironment: finalized.target_environment,
          triggerSource: finalized.trigger_source,
          status: finalized.status,
          backupName: finalized.backup_name,
          artifactPath: finalized.artifact_path,
          artifactStorageKey: finalized.artifact_storage_key,
          errorMessage: finalized.error_message,
        },
      });

      return finalized;
    });

    const loggerPayload = {
      event: 'dr_execution_finalized',
      executionId: saved.id,
      operationType: saved.operation_type,
      scope: saved.scope,
      environment: saved.environment,
      targetEnvironment: saved.target_environment,
      status: saved.status,
      triggerSource: saved.trigger_source,
      artifactPath: saved.artifact_path,
      artifactStorageKey: saved.artifact_storage_key,
      errorMessage: saved.error_message,
    };

    if (input.status === 'failed') {
      this.logger.error(JSON.stringify(loggerPayload));
    } else {
      this.logger.log(loggerPayload);
    }

    return saved;
  }

  private async persistStartedExecution(
    input: DisasterRecoveryExecutionInput,
  ): Promise<DisasterRecoveryExecution> {
    const startedAt = new Date();
    if (!this.privilegedDb.isEnabled()) {
      return this.executionRepository.save(
        this.executionRepository.create({
          operation_type: input.operationType,
          scope: input.scope,
          environment: input.environment,
          target_environment: input.targetEnvironment ?? null,
          status: 'running',
          trigger_source: input.triggerSource,
          requested_by_user_id: input.requestedByUserId ?? null,
          backup_name: input.backupName ?? null,
          artifact_path: input.artifactPath ?? null,
          artifact_storage_key: input.artifactStorageKey ?? null,
          metadata: input.metadata ?? null,
          started_at: startedAt,
        }),
      );
    }

    return this.withPrivilegedExecutionContext(async (client) => {
      const result = await client.query(
        `
          INSERT INTO "disaster_recovery_executions" (
            "operation_type",
            "scope",
            "environment",
            "target_environment",
            "status",
            "trigger_source",
            "requested_by_user_id",
            "backup_name",
            "artifact_path",
            "artifact_storage_key",
            "metadata",
            "started_at"
          )
          VALUES ($1, $2, $3, $4, 'running', $5, $6, $7, $8, $9, $10::jsonb, $11)
          RETURNING *
        `,
        [
          input.operationType,
          input.scope,
          input.environment,
          input.targetEnvironment ?? null,
          input.triggerSource,
          input.requestedByUserId ?? null,
          input.backupName ?? null,
          input.artifactPath ?? null,
          input.artifactStorageKey ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
          startedAt,
        ],
      );

      return this.requireExecutionRow(result.rows[0]);
    });
  }

  private async persistFinalizedExecution(
    executionId: string,
    input: DisasterRecoveryExecutionResultInput,
  ): Promise<DisasterRecoveryExecution> {
    const completedAt = new Date();
    if (!this.privilegedDb.isEnabled()) {
      const execution = await this.executionRepository.findOneByOrFail({
        id: executionId,
      });

      execution.status = input.status;
      execution.backup_name = input.backupName ?? execution.backup_name ?? null;
      execution.artifact_path =
        input.artifactPath ?? execution.artifact_path ?? null;
      execution.artifact_storage_key =
        input.artifactStorageKey ?? execution.artifact_storage_key ?? null;
      execution.error_message = input.errorMessage ?? null;
      execution.metadata = {
        ...(execution.metadata || {}),
        ...(input.metadata || {}),
      };
      execution.completed_at = completedAt;

      return this.executionRepository.save(execution);
    }

    return this.withPrivilegedExecutionContext(async (client) => {
      const result = await client.query(
        `
          UPDATE "disaster_recovery_executions"
          SET
            "status" = $2,
            "backup_name" = COALESCE($3::text, "backup_name"),
            "artifact_path" = COALESCE($4::text, "artifact_path"),
            "artifact_storage_key" = COALESCE($5::text, "artifact_storage_key"),
            "error_message" = $6,
            "metadata" = COALESCE("metadata", '{}'::jsonb) || $7::jsonb,
            "completed_at" = $8,
            "updated_at" = $8
          WHERE "id" = $1
          RETURNING *
        `,
        [
          executionId,
          input.status,
          input.backupName ?? null,
          input.artifactPath ?? null,
          input.artifactStorageKey ?? null,
          input.errorMessage ?? null,
          JSON.stringify(input.metadata ?? {}),
          completedAt,
        ],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(
          `Execução de disaster recovery ${executionId} não encontrada.`,
        );
      }

      return this.requireExecutionRow(result.rows[0]);
    });
  }

  private withPrivilegedExecutionContext<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.privilegedDb.withPrivilegedClient(async (client) => {
      let transactionStarted = false;
      try {
        await client.query('BEGIN');
        transactionStarted = true;
        await client.query("SET LOCAL app.is_super_admin = 'true'");
        const result = await operation(client);
        await client.query('COMMIT');
        transactionStarted = false;
        return result;
      } catch (error) {
        if (transactionStarted) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            this.logger.warn({
              event: 'dr_execution_privileged_rollback_failed',
              error:
                rollbackError instanceof Error
                  ? rollbackError.message
                  : String(rollbackError),
            });
          }
        }
        throw error;
      }
    });
  }

  private requireExecutionRow(row: unknown): DisasterRecoveryExecution {
    if (!row || typeof row !== 'object') {
      throw new NotFoundException(
        'Execução de disaster recovery não encontrada após persistência.',
      );
    }

    return Object.assign(new DisasterRecoveryExecution(), row);
  }

  private appendForensicEvent(
    input: AppendForensicTrailEventInput,
  ): Promise<unknown> {
    if (!this.privilegedDb.isEnabled()) {
      return this.forensicTrailService.append(input);
    }

    return this.withPrivilegedExecutionContext((client) =>
      this.forensicTrailService.appendWithPrivilegedClient(input, client),
    );
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
