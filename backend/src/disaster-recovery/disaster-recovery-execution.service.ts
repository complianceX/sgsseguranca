import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
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
  ) {}

  async startExecution(
    input: DisasterRecoveryExecutionInput,
  ): Promise<DisasterRecoveryExecution> {
    const execution = await this.executionRepository.save(
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
      entityId: execution.id,
      userId: input.requestedByUserId ?? undefined,
      metadata: {
        operationType: execution.operation_type,
        scope: execution.scope,
        environment: execution.environment,
        targetEnvironment: execution.target_environment,
        triggerSource: execution.trigger_source,
        backupName: execution.backup_name,
      },
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

    const saved = await this.executionRepository.save(execution);

    await this.forensicTrailService.append({
      eventType:
        input.status === 'failed'
          ? 'dr_execution_failed'
          : 'dr_execution_completed',
      module: DR_MODULE,
      entityId: saved.id,
      userId: saved.requested_by_user_id ?? undefined,
      metadata: {
        operationType: saved.operation_type,
        scope: saved.scope,
        environment: saved.environment,
        targetEnvironment: saved.target_environment,
        triggerSource: saved.trigger_source,
        status: saved.status,
        backupName: saved.backup_name,
        artifactPath: saved.artifact_path,
        artifactStorageKey: saved.artifact_storage_key,
        errorMessage: saved.error_message,
      },
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
}
