import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AprWorkflowStep } from './apr-workflow-step.entity';

export enum WorkflowCriticality {
  BAIXA = 'BAIXA',
  MEDIA = 'MEDIA',
  ALTA = 'ALTA',
  CRITICA = 'CRITICA',
}

@Entity('apr_workflow_configs')
@Index('IDX_apr_workflow_configs_tenant_active', ['tenantId', 'isActive'])
export class AprWorkflowConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'uuid', nullable: true })
  siteId: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  activityType: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  criticality: WorkflowCriticality | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => AprWorkflowStep, (step) => step.workflowConfig, {
    cascade: true,
    eager: false,
  })
  steps: AprWorkflowStep[];
}
