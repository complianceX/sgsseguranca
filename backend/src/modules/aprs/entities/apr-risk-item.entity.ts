import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { Apr } from './apr.entity';
import { AprRiskEvidence } from './apr-risk-evidence.entity';

/**
 * Hierarquia de controles (NIOSH/NOA):
 * Eliminação > Substituição > Engenharia (EPC) > Administrativo > EPI
 */
export enum AprControlHierarchy {
  ELIMINACAO = 'eliminacao',
  SUBSTITUICAO = 'substituicao',
  EPC = 'epc',
  ADMINISTRATIVO = 'administrativo',
  EPI = 'epi',
  COMBINADO = 'combinado',
}

@Entity('apr_risk_items')
export class AprRiskItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  apr_id: string;

  @ManyToOne(() => Apr, (apr) => apr.risk_items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'apr_id' })
  apr: Apr;

  // ── Identificação da atividade e etapa ───────────────────────────────────

  @Column({ type: 'text', nullable: true })
  atividade: string | null;

  /**
   * Etapa específica dentro da atividade.
   * Ex.: Atividade = "Troca de transformador" → Etapa = "Içamento do equipamento"
   */
  @Column({ type: 'text', nullable: true })
  etapa: string | null;

  // ── Identificação do perigo ──────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  agente_ambiental: string | null;

  @Column({ type: 'text', nullable: true })
  condicao_perigosa: string | null;

  @Column({ type: 'text', nullable: true })
  fonte_circunstancia: string | null;

  @Column({ type: 'text', nullable: true })
  lesao: string | null;

  // ── Avaliação de risco bruto (antes dos controles) ───────────────────────

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

  // ── Controles e hierarquia ───────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  medidas_prevencao: string | null;

  @Column({ type: 'text', nullable: true })
  epc: string | null;

  @Column({ type: 'text', nullable: true })
  epi: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  permissao_trabalho: string | null;

  @Column({ type: 'text', nullable: true })
  normas_relacionadas: string | null;

  /**
   * Classificação da medida de controle segundo hierarquia NIOSH/NOA.
   * Permite que auditores verifiquem se controles prioritários foram aplicados
   * antes de recorrer a EPIs.
   */
  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
    enum: AprControlHierarchy,
  })
  hierarquia_controle: AprControlHierarchy | null;

  // ── Risco residual (após aplicação dos controles) ────────────────────────

  /**
   * Probabilidade reavaliada após aplicação das medidas de controle.
   * Escala 1–5 (compatível com a nova matriz 5×5).
   */
  @Column({ type: 'int', nullable: true })
  residual_probabilidade: number | null;

  /**
   * Severidade reavaliada após aplicação das medidas de controle.
   * Escala 1–5.
   */
  @Column({ type: 'int', nullable: true })
  residual_severidade: number | null;

  /** Score residual = residual_probabilidade × residual_severidade */
  @Column({ type: 'int', nullable: true })
  residual_score: number | null;

  /** Categoria de risco residual após controles. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  residual_categoria: string | null;

  // ── Plano de ação ────────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  responsavel: string | null;

  @Column({ type: 'date', nullable: true })
  prazo: Date | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  status_acao: string | null;

  // ── Ordenação e controle ─────────────────────────────────────────────────

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

  /**
   * Soft delete: itens removidos ficam rastreáveis para fins forenses.
   * Itens com deleted_at preenchido são ignorados nas consultas normais
   * mas aparecem no histórico de auditoria.
   */
  @DeleteDateColumn({ nullable: true })
  deleted_at: Date | null;
}
