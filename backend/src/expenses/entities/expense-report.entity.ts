import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { Company } from '../../companies/entities/company.entity';
import { Site } from '../../sites/entities/site.entity';
import { User } from '../../users/entities/user.entity';
import { ExpenseAdvance } from './expense-advance.entity';
import { ExpenseItem } from './expense-item.entity';

export enum ExpenseReportStatus {
  ABERTA = 'aberta',
  FECHADA = 'fechada',
  CANCELADA = 'cancelada',
}

@Entity('expense_reports')
@Index('IDX_expense_reports_company_site_status_period', [
  'company_id',
  'site_id',
  'status',
  'period_start',
  'period_end',
])
export class ExpenseReport extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  period_start: string;

  @Column({ type: 'date' })
  period_end: string;

  @Column({ type: 'varchar', length: 24, default: ExpenseReportStatus.ABERTA })
  status: ExpenseReportStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  total_advances: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  total_expenses: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  balance: string;

  @Column({ type: 'jsonb', nullable: true })
  totals_by_category?: Record<string, string> | null;

  @Column({ type: 'timestamp', nullable: true })
  closed_at?: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'closed_by_id' })
  closed_by?: User | null;

  @Column({ type: 'uuid', nullable: true })
  closed_by_id?: string | null;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'uuid' })
  company_id: string;

  @ManyToOne(() => Site)
  @JoinColumn({ name: 'site_id' })
  site: Site;

  @Column({ type: 'uuid' })
  site_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'responsible_id' })
  responsible: User;

  @Column({ type: 'uuid' })
  responsible_id: string;

  @OneToMany(() => ExpenseAdvance, (advance) => advance.report)
  advances?: ExpenseAdvance[];

  @OneToMany(() => ExpenseItem, (item) => item.report)
  items?: ExpenseItem[];
}
