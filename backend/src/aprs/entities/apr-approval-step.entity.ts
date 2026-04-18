import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../auth/enums/roles.enum';
import { User } from '../../users/entities/user.entity';
import { Apr } from './apr.entity';

export enum AprApprovalStepStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SKIPPED = 'skipped',
}

@Entity('apr_approval_steps')
export class AprApprovalStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  apr_id: string;

  @ManyToOne(() => Apr, (apr) => apr.approval_steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'apr_id' })
  apr: Apr;

  @Column({ type: 'int' })
  level_order: number;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 120 })
  approver_role: Role | string;

  @Column({
    type: 'varchar',
    length: 20,
    default: AprApprovalStepStatus.PENDING,
  })
  status: AprApprovalStepStatus;

  @Column({ type: 'uuid', nullable: true })
  approver_user_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approver_user_id' })
  approver_user?: User | null;

  @Column({ type: 'text', nullable: true })
  decision_reason: string | null;

  @Column({ type: 'inet', nullable: true })
  decided_ip: string | null;

  @Column({ type: 'timestamp', nullable: true })
  decided_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
