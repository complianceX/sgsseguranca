import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  DisasterRecoveryExecutionMetadata,
  DisasterRecoveryExecutionStatus,
  DisasterRecoveryOperationType,
  DisasterRecoveryScope,
} from '../disaster-recovery.types';

@Entity('disaster_recovery_executions')
@Index('IDX_dr_execution_operation_environment_started', [
  'operation_type',
  'environment',
  'started_at',
])
@Index('IDX_dr_execution_status_started', ['status', 'started_at'])
export class DisasterRecoveryExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  operation_type: DisasterRecoveryOperationType;

  @Column({ type: 'varchar', length: 20 })
  scope: DisasterRecoveryScope;

  @Column({ type: 'varchar', length: 50 })
  environment: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  target_environment?: string | null;

  @Column({ type: 'varchar', length: 50 })
  status: DisasterRecoveryExecutionStatus;

  @Column({ type: 'varchar', length: 50 })
  trigger_source: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  requested_by_user_id?: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  backup_name?: string | null;

  @Column({ type: 'text', nullable: true })
  artifact_path?: string | null;

  @Column({ type: 'text', nullable: true })
  artifact_storage_key?: string | null;

  @Column({ type: 'text', nullable: true })
  error_message?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: DisasterRecoveryExecutionMetadata | null;

  @Column({ type: 'timestamptz' })
  started_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
