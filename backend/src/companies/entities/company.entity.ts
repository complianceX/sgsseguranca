import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Site } from '../../sites/entities/site.entity';

export const COMPANY_ACCOUNT_STATUSES = [
  'trialing',
  'active',
  'trial_expired',
  'suspended',
  'cancelled',
] as const;

export type CompanyAccountStatus = (typeof COMPANY_ACCOUNT_STATUSES)[number];

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  razao_social: string;

  @Column({ unique: true })
  cnpj: string;

  @Column({ type: 'text' })
  endereco: string;

  @Column()
  responsavel: string;

  @Column({ type: 'text', nullable: true })
  email_contato?: string | null;

  @Column({ type: 'text', nullable: true })
  logo_url?: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  logo_storage_key?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  logo_content_type?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  logo_sha256?: string | null;

  @Column({ default: true })
  status: boolean;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  account_status: CompanyAccountStatus;

  @Column({ nullable: true })
  trial_started_at?: Date | null;

  @Column({ nullable: true })
  trial_ends_at?: Date | null;

  @Column({ nullable: true })
  activated_at?: Date | null;

  @Column({ nullable: true })
  suspended_at?: Date | null;

  @Column({ type: 'text', nullable: true })
  suspension_reason?: string | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    default: () =>
      `'{"blockCriticalRiskWithoutEvidence":true,"blockWorkerWithoutValidMedicalExam":true,"blockWorkerWithExpiredBlockingTraining":true,"requireAtLeastOneExecutante":false}'::jsonb`,
  })
  pt_approval_rules?: {
    blockCriticalRiskWithoutEvidence: boolean;
    blockWorkerWithoutValidMedicalExam: boolean;
    blockWorkerWithExpiredBlockingTraining: boolean;
    requireAtLeastOneExecutante: boolean;
  } | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    default: () =>
      `'{"enabled":true,"recipients":[],"includeWhatsapp":false,"lookaheadDays":30,"includeComplianceSummary":true,"includeOperationsSummary":true,"includeOccurrencesSummary":true,"deliveryHour":8,"weekdaysOnly":true,"cadenceDays":1,"skipWhenNoPending":false,"minimumPendingItems":0,"subjectPrefix":null,"snoozeUntil":null,"lastScheduledDispatchAt":null}'::jsonb`,
  })
  alert_settings?: {
    enabled: boolean;
    recipients: string[];
    includeWhatsapp: boolean;
    lookaheadDays: number;
    includeComplianceSummary: boolean;
    includeOperationsSummary: boolean;
    includeOccurrencesSummary: boolean;
    deliveryHour: number;
    weekdaysOnly: boolean;
    cadenceDays: number;
    skipWhenNoPending: boolean;
    minimumPendingItems: number;
    subjectPrefix: string | null;
    snoozeUntil: string | null;
    lastScheduledDispatchAt: string | null;
  } | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => User, (user) => user.company)
  users: User[];

  @OneToMany(() => Site, (site) => site.company)
  sites: Site[];
}
