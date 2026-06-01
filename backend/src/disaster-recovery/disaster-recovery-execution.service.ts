import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import { TenantService } from '../common/tenant/tenant.service';
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
  ) {}

  async startExecution(
    input: DisasterRecoveryExecutionInput,
  ): Promise<DisasterRecoveryExecution> {
    const execution = await this.runAsGlobalSuperAdmin(async () => {
      const savedExecution = await this.executionRepository.save(
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
          started_at: new Date(),
        }),
      );

      await this.forensicTrailService.append({
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
      execution.completed_at = new Date();

      const finalized = await this.executionRepository.save(execution);

      await this.forensicTrailService.append({
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

  private runAsGlobalSuperAdmin<T>(callback: () => Promise<T>): Promise<T> {
    return Promise.resolve(
      this.tenantService.run(
        { companyId: undefined, isSuperAdmin: true, siteScope: 'all' },
        callback,
      ),
    );
  }
}
