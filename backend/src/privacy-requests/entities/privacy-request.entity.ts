import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PrivacyRequestType =
  | 'confirmation'
  | 'access'
  | 'correction'
  | 'anonymization'
  | 'deletion'
  | 'portability'
  | 'sharing_info'
  | 'consent_revocation'
  | 'automated_decision_review';

export type PrivacyRequestStatus =
  | 'open'
  | 'in_review'
  | 'waiting_controller'
  | 'fulfilled'
  | 'rejected'
  | 'cancelled';

@Entity('privacy_requests')
@Index('IDX_privacy_requests_company_status_due', [
  'company_id',
  'status',
  'due_at',
])
@Index('IDX_privacy_requests_requester_created', [
  'requester_user_id',
  'created_at',
])
export class PrivacyRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'uuid' })
  requester_user_id: string;

  @Column({ type: 'varchar', length: 64 })
  type: PrivacyRequestType;

  @Column({ type: 'varchar', length: 64, default: 'open' })
  status: PrivacyRequestStatus;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  response_summary: string | null;

  @Column({ type: 'uuid', nullable: true })
  handled_by_user_id: string | null;

  @Column({ type: 'timestamptz' })
  due_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fulfilled_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  rejected_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
