import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('monthly_snapshots')
export class MonthlySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  month: string;

  @Column({ type: 'uuid' })
  site_id: string;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  risk_score: number;

  @Column({ type: 'int', default: 0 })
  nc_count: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  training_compliance: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
