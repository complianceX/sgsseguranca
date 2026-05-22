import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Signature } from '../../signatures/entities/signature.entity';
import { User } from '../../users/entities/user.entity';
import { Dds } from './dds.entity';

@Entity('dds_signature_invites')
@Index('UQ_dds_signature_invites_token_hash', ['token_hash'], { unique: true })
@Index('IDX_dds_signature_invites_company_dds_participant', [
  'company_id',
  'dds_id',
  'participant_user_id',
])
@Index('IDX_dds_signature_invites_active', [
  'company_id',
  'expires_at',
  'revoked_at',
  'used_at',
])
export class DdsSignatureInvite {
  @PrimaryColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'uuid' })
  company_id: string;

  @ManyToOne(() => Dds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dds_id' })
  dds: Dds;

  @Column({ type: 'uuid' })
  dds_id: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'participant_user_id' })
  participant: User;

  @Column({ type: 'uuid' })
  participant_user_id: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: User | null;

  @Column({ type: 'uuid', nullable: true })
  created_by_user_id: string | null;

  @ManyToOne(() => Signature, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'signed_signature_id' })
  signed_signature: Signature | null;

  @Column({ type: 'uuid', nullable: true })
  signed_signature_id: string | null;

  @Column({ type: 'varchar', length: 64 })
  token_hash: string;

  @Column({ type: 'integer' })
  dds_version: number;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  revoked_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  used_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_viewed_at: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  signed_ip_hash: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  signed_user_agent_hash: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
