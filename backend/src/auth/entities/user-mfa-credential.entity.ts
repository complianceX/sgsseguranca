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

@Index('IDX_user_mfa_credentials_user_type', ['user_id', 'type'], {
  unique: true,
})
@Entity('user_mfa_credentials')
export class UserMfaCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'varchar', length: 32, default: 'totp' })
  type: 'totp';

  @Column({ type: 'text' })
  secret_ciphertext: string;

  @Column({ type: 'varchar', length: 64 })
  secret_iv: string;

  @Column({ type: 'varchar', length: 64 })
  secret_tag: string;

  @Column({ type: 'integer', default: 1 })
  secret_version: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label?: string | null;

  @Column({ type: 'boolean', default: false })
  is_enabled: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  verified_at?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  disabled_at?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_used_at?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
