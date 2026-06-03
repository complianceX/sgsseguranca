import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type GdprRetentionCleanupStatus = 'success' | 'error';
export type GdprRetentionCleanupTrigger = 'manual' | 'scheduled';

@Entity('gdpr_retention_cleanup_runs')
export class GdprRetentionCleanupRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  status: GdprRetentionCleanupStatus;

  @Column({ name: 'triggered_by', type: 'varchar', length: 20 })
  triggered_by: GdprRetentionCleanupTrigger;

  @Column({ name: 'trigger_source', type: 'varchar', length: 120 })
  trigger_source: string;

  @Column({ name: 'tables_cleaned', type: 'jsonb', default: [] })
  tables_cleaned: { table: string; rows_deleted: number }[];

  @Column({ name: 'total_rows_deleted', type: 'integer', default: 0 })
  total_rows_deleted: number;

  @Column({ name: 'duration_ms', type: 'integer', default: 0 })
  duration_ms: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  error_message: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  started_at: Date;

  @Column({ name: 'completed_at', type: 'timestamptz' })
  completed_at: Date;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
