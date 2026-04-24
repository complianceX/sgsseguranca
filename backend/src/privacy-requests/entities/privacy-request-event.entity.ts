import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { PrivacyRequestStatus } from './privacy-request.entity';

export type PrivacyRequestEventType =
  | 'created'
  | 'status_changed'
  | 'response_updated';

@Entity('privacy_request_events')
@Index('IDX_privacy_request_events_request_created', [
  'privacy_request_id',
  'created_at',
])
@Index('IDX_privacy_request_events_company_created', [
  'company_id',
  'created_at',
])
export class PrivacyRequestEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  privacy_request_id: string;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'uuid', nullable: true })
  actor_user_id: string | null;

  @Column({ type: 'varchar', length: 40 })
  event_type: PrivacyRequestEventType;

  @Column({ type: 'varchar', length: 64, nullable: true })
  from_status: PrivacyRequestStatus | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  to_status: PrivacyRequestStatus | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
