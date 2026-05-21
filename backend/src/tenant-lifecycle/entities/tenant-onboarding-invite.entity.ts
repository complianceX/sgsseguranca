import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

const isSqlite =
  process.env.DATABASE_TYPE === 'sqlite' ||
  process.env.DATABASE_TYPE === 'better-sqlite3';

@Entity('tenant_onboarding_invites')
export class TenantOnboardingInvite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  token_hash: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  intended_company_name?: string | null;

  @Column()
  expires_at: Date;

  @Column({ nullable: true })
  used_at?: Date | null;

  @Column({ nullable: true })
  revoked_at?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  created_by_user_id?: string | null;

  @Column({ type: 'uuid', nullable: true })
  created_company_id?: string | null;

  @Column({ type: 'uuid', nullable: true })
  created_user_id?: string | null;

  @Column({ type: isSqlite ? 'simple-json' : 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
