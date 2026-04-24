import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type GdprDeletionStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

@Entity('gdpr_deletion_requests')
export class GdprDeletionRequest {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  user_id: string;

  @Column({ name: 'request_date', type: 'timestamptz' })
  request_date: Date;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: GdprDeletionStatus;

  @Column({ name: 'tables_processed', type: 'jsonb', default: [] })
  tables_processed: { table: string; rows_deleted: number }[];

  @Column({ name: 'error_message', type: 'text', nullable: true })
  error_message: string | null;

  @Column({ name: 'completed_date', type: 'timestamptz', nullable: true })
  completed_date: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
