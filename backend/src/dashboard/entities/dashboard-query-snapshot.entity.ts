import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('dashboard_query_snapshots')
@Unique('UQ_dashboard_query_snapshots_company_query', [
  'company_id',
  'query_type',
])
@Index('IDX_dashboard_query_snapshots_query_expires', [
  'query_type',
  'expires_at',
])
export class DashboardQuerySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'varchar', length: 64 })
  query_type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'integer', default: 1 })
  schema_version: number;

  @Column({ type: 'timestamp' })
  generated_at: Date;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
