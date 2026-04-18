import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Dds } from './dds.entity';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';
import { Signature } from '../../signatures/entities/signature.entity';

export enum DdsApprovalAction {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELED = 'canceled',
  REOPENED = 'reopened',
}

@Entity('dds_approval_records')
@Index('IDX_dds_approval_records_dds_cycle', [
  'company_id',
  'dds_id',
  'cycle',
  'level_order',
])
@Index('IDX_dds_approval_records_hash', ['event_hash'], { unique: true })
export class DdsApprovalRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'uuid' })
  company_id: string;

  @ManyToOne(() => Dds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dds_id' })
  dds: Dds;

  @Column({ type: 'uuid' })
  dds_id: string;

  @Column({ type: 'integer' })
  cycle: number;

  @Column({ type: 'integer' })
  level_order: number;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 120 })
  approver_role: string;

  @Column({ type: 'varchar', length: 24 })
  action: DdsApprovalAction;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_user_id' })
  actor: User | null;

  @Column({ type: 'uuid', nullable: true })
  actor_user_id: string | null;

  @ManyToOne(() => Signature, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_signature_id' })
  actor_signature: Signature | null;

  @Column({ type: 'uuid', nullable: true })
  actor_signature_id: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  actor_signature_hash: string | null;

  @Column({ type: 'timestamp', nullable: true })
  actor_signature_signed_at: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  actor_signature_timestamp_authority: string | null;

  @Column({ type: 'text', nullable: true })
  decision_reason: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  decided_ip: string | null;

  @Column({ type: 'text', nullable: true })
  decided_user_agent: string | null;

  @Column({ type: 'timestamp' })
  event_at: Date;

  @Column({ type: 'varchar', length: 64, nullable: true })
  previous_event_hash: string | null;

  @Column({ type: 'varchar', length: 64 })
  event_hash: string;

  @CreateDateColumn()
  created_at: Date;
}
