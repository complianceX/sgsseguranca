import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AprWorkflowConfig } from './apr-workflow-config.entity';

export enum WorkflowStepRole {
  TECNICO_SST = 'TECNICO_SST',
  SUPERVISOR = 'SUPERVISOR',
  GERENTE = 'GERENTE',
  CLIENTE = 'CLIENTE',
  CONTRATANTE = 'CONTRATANTE',
  RESPONSAVEL_TECNICO = 'RESPONSAVEL_TECNICO',
}

@Entity('apr_workflow_steps')
@Index(
  'UQ_apr_workflow_steps_config_order',
  ['workflowConfigId', 'stepOrder'],
  {
    unique: true,
  },
)
export class AprWorkflowStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workflowConfigId: string;

  @ManyToOne(() => AprWorkflowConfig, (config) => config.steps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflowConfigId' })
  workflowConfig: AprWorkflowConfig;

  @Column({ type: 'int' })
  stepOrder: number;

  @Column({ type: 'varchar', length: 40 })
  roleName: string;

  @Column({ default: true })
  isRequired: boolean;

  @Column({ default: false })
  canDelegate: boolean;

  @Column({ type: 'int', nullable: true })
  timeoutHours: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
