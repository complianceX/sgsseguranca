import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Apr } from './apr.entity';
import { AprRiskEvidence } from './apr-risk-evidence.entity';

@Entity('apr_risk_items')
export class AprRiskItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  apr_id: string;

  @ManyToOne(() => Apr, (apr) => apr.risk_items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'apr_id' })
  apr: Apr;

  @Column({ type: 'text', nullable: true })
  atividade: string | null;

  @Column({ type: 'text', nullable: true })
  agente_ambiental: string | null;

  @Column({ type: 'text', nullable: true })
  condicao_perigosa: string | null;

  @Column({ type: 'text', nullable: true })
  fonte_circunstancia: string | null;

  @Column({ type: 'text', nullable: true })
  lesao: string | null;

  @Column({ type: 'int', nullable: true })
  probabilidade: number | null;

  @Column({ type: 'int', nullable: true })
  severidade: number | null;

  @Column({ type: 'int', nullable: true })
  score_risco: number | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  categoria_risco: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  prioridade: string | null;

  @Column({ type: 'text', nullable: true })
  medidas_prevencao: string | null;

  @Column({ type: 'text', nullable: true })
  responsavel: string | null;

  @Column({ type: 'date', nullable: true })
  prazo: Date | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  status_acao: string | null;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @OneToMany(() => AprRiskEvidence, (evidence) => evidence.apr_risk_item, {
    cascade: false,
    eager: false,
  })
  evidences: AprRiskEvidence[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
