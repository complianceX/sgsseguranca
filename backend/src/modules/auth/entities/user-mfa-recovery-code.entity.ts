import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { UserMfaCredential } from './user-mfa-credential.entity';

@Index('IDX_user_mfa_recovery_codes_user_consumed', ['user_id', 'consumed_at'])
@Entity('user_mfa_recovery_codes')
export class UserMfaRecoveryCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserMfaCredential)
  @JoinColumn({ name: 'credential_id' })
  credential: UserMfaCredential;

  @Column({ type: 'uuid' })
  credential_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'text' })
  code_hash: string;

  @Column({ type: 'timestamptz', nullable: true })
  consumed_at?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_used_at?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
