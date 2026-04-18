import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ApprovalRecordAction {
  APROVADO = 'APROVADO',
  REPROVADO = 'REPROVADO',
  REABERTO = 'REABERTO',
  DELEGADO = 'DELEGADO',
}

@Entity('apr_approval_records')
@Index('IDX_apr_approval_records_apr_step', ['aprId', 'stepOrder'])
export class AprApprovalRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  aprId: string;

  @Column({ type: 'uuid', nullable: true })
  workflowConfigId: string | null;

  @Column({ type: 'int' })
  stepOrder: number;

  @Column({ type: 'varchar', length: 40 })
  roleName: string;

  @Column({ type: 'uuid' })
  approverId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approverId' })
  approver: User | null;

  @Column({ type: 'varchar', length: 20 })
  action: ApprovalRecordAction;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  occurredAt: Date;
}
