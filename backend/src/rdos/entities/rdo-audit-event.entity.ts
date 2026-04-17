import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Rdo } from './rdo.entity';
import { User } from '../../users/entities/user.entity';

@Entity('rdo_audit_events')
@Index(['rdo_id', 'created_at'])
export class RdoAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  rdo_id: string;

  @ManyToOne(() => Rdo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rdo_id' })
  rdo: Rdo;

  @Column({ type: 'uuid', nullable: true })
  user_id?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column()
  event_type: string;

  @Column({ type: 'jsonb', nullable: true })
  details?: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;
}
