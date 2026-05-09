import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { User } from '../../users/entities/user.entity';
import { ExpenseReport } from './expense-report.entity';

export enum ExpenseAdvanceMethod {
  PIX = 'pix',
  TRANSFERENCIA = 'transferencia',
  DINHEIRO = 'dinheiro',
  CARTAO = 'cartao',
  OUTRO = 'outro',
}

@Entity('expense_advances')
@Index('IDX_expense_advances_report_date', ['report_id', 'advance_date'])
export class ExpenseAdvance extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ExpenseReport, (report) => report.advances, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'report_id' })
  report: ExpenseReport;

  @Column({ type: 'uuid' })
  report_id: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'date' })
  advance_date: string;

  @Column({ type: 'varchar', length: 32 })
  method: ExpenseAdvanceMethod;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  created_by?: User | null;

  @Column({ type: 'uuid', nullable: true })
  created_by_id?: string | null;
}
