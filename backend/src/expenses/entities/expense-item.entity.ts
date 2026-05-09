import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { User } from '../../users/entities/user.entity';
import { ExpenseReport } from './expense-report.entity';

export enum ExpenseCategory {
  TRANSPORTE = 'transporte',
  ALIMENTACAO = 'alimentacao',
  HOSPEDAGEM = 'hospedagem',
  COMBUSTIVEL = 'combustivel',
  PEDAGIO = 'pedagio',
  IMPRESSAO = 'impressao',
  MATERIAIS = 'materiais',
  OUTROS = 'outros',
}

@Entity('expense_items')
@Index('IDX_expense_items_report_date', ['report_id', 'expense_date'])
@Index('IDX_expense_items_report_category', ['report_id', 'category'])
export class ExpenseItem extends BaseAuditEntity {
  @PrimaryColumn('uuid')
  id: string;

  @ManyToOne(() => ExpenseReport, (report) => report.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'report_id' })
  report: ExpenseReport;

  @Column({ type: 'uuid' })
  report_id: string;

  @Column({ type: 'varchar', length: 32 })
  category: ExpenseCategory;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'date' })
  expense_date: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  vendor?: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  location?: string | null;

  @Column({ type: 'text' })
  receipt_file_key: string;

  @Column({ type: 'text' })
  receipt_original_name: string;

  @Column({ type: 'varchar', length: 120 })
  receipt_mime_type: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  created_by?: User | null;

  @Column({ type: 'uuid', nullable: true })
  created_by_id?: string | null;
}
