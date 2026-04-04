import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('forensic_trail_events')
@Index(
  'UQ_forensic_trail_events_stream_sequence',
  ['stream_key', 'stream_sequence'],
  {
    unique: true,
  },
)
@Index('UQ_forensic_trail_events_event_hash', ['event_hash'], { unique: true })
@Index('IDX_forensic_trail_events_company_module_entity_created', [
  'company_id',
  'module',
  'entity_id',
  'created_at',
])
export class ForensicTrailEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  stream_key: string;

  @Column({ type: 'integer' })
  stream_sequence: number;

  @Column({ type: 'varchar', length: 100 })
  event_type: string;

  @Column({ type: 'varchar', length: 50 })
  module: string;

  @Column({ type: 'varchar', length: 120 })
  entity_id: string;

  @Column({ type: 'uuid', nullable: true })
  company_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  request_id: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  ip: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  previous_event_hash: string | null;

  @Column({ type: 'varchar', length: 64 })
  event_hash: string;

  @Column({ type: 'timestamp' })
  occurred_at: Date;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
