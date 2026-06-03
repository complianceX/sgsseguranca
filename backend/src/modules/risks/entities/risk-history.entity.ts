import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Risk } from './risk.entity';

@Entity('risk_history')
export class RiskHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  risk_id: string;

  @ManyToOne(() => Risk, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'risk_id' })
  risk: Risk;

  @Column({ nullable: true })
  changed_by?: string;

  @Column({ type: 'jsonb' })
  old_value: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  new_value: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;
}
