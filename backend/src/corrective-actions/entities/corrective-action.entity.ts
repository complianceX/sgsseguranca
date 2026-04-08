import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Site } from '../../sites/entities/site.entity';
import { User } from '../../users/entities/user.entity';

export type CorrectiveActionSource = 'manual' | 'nonconformity' | 'audit';
export type CorrectiveActionStatus =
  | 'open'
  | 'in_progress'
  | 'done'
  | 'overdue'
  | 'cancelled';
export type CorrectiveActionPriority = 'low' | 'medium' | 'high' | 'critical';

@Entity('corrective_actions')
export class CorrectiveAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'varchar',
    default: 'manual',
  })
  source_type: CorrectiveActionSource;

  @Column({ nullable: true })
  source_id?: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

  @ManyToOne(() => Site, { nullable: true })
  @JoinColumn({ name: 'site_id' })
  site?: Site;

  @Column({ nullable: true })
  site_id?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'responsible_user_id' })
  responsible_user?: User;

  @Column({ nullable: true })
  responsible_user_id?: string;

  @Column({ nullable: true })
  responsible_name?: string;

  @Column({ type: 'date' })
  due_date: Date;

  @Column({
    type: 'varchar',
    default: 'open',
  })
  status: CorrectiveActionStatus;

  @Column({
    type: 'varchar',
    default: 'medium',
  })
  priority: CorrectiveActionPriority;

  @Column({ type: 'int', nullable: true })
  sla_days?: number;

  @Column({ type: 'text', nullable: true })
  evidence_notes?: string;

  @Column({ type: 'jsonb', nullable: true })
  evidence_files?: string[];

  @Column({ type: 'timestamp', nullable: true })
  last_reminder_at?: Date;

  @Column({ type: 'int', default: 0 })
  escalation_level: number;

  @Column({ type: 'timestamp', nullable: true })
  closed_at?: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn({ nullable: true })
  deleted_at?: Date | null;
}
