import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AprRuleSeverity {
  BLOQUEANTE = 'BLOQUEANTE',
  ADVERTENCIA = 'ADVERTENCIA',
}

export enum AprRuleCategory {
  NR = 'NR',
  EPI = 'EPI',
  EPC = 'EPC',
  PT = 'PT',
  RESPONSAVEL = 'RESPONSAVEL',
  CONSISTENCIA = 'CONSISTENCIA',
}

@Entity('apr_rules')
@Index('UQ_apr_rules_code', ['code'], { unique: true })
export class AprRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 20 })
  severity: AprRuleSeverity;

  @Column({ type: 'varchar', length: 20 })
  category: AprRuleCategory;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  operationalMessage: string;

  @Column({ type: 'jsonb', nullable: true })
  triggerCondition: Record<string, unknown> | null;

  @Column({ type: 'text' })
  remediation: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  nrReference: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
