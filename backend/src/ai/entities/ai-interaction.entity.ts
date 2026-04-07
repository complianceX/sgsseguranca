import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import {
  AiInteractionStatus,
  ConfidenceLevel,
  HumanReviewReason,
} from '../sst-agent/sst-agent.types';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | object;

/**
 * Histórico de interações com o Agente SST.
 *
 * Isolamento multi-tenant:
 * - `tenant_id` presente em TODOS os registros
 * - Índices compostos garantem queries eficientes por tenant
 * - RLS ativo (ver migration 1709000000031) impede cross-tenant leaks a nível de banco
 *
 * Auditoria completa:
 * - model, provider, latency_ms para monitoramento de SLA
 * - token_usage_input/output + estimated_cost_usd para controle de custos
 * - confidence + needs_human_review para análise de qualidade das respostas
 */
@Entity('ai_interactions')
@Index('IDX_ai_interactions_tenant_created', ['tenant_id', 'created_at'])
@Index('IDX_ai_interactions_tenant_user_created', [
  'tenant_id',
  'user_id',
  'created_at',
])
export class AiInteraction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ID da empresa (companyId). Obrigatório para isolamento de dados. */
  @Index()
  @Column({ type: 'uuid' })
  tenant_id: string;

  /** ID do usuário que fez a pergunta. */
  @Column({ type: 'uuid' })
  user_id: string;

  /** Pergunta enviada pelo usuário. */
  @Column({ type: 'text' })
  question: string;

  /**
   * Resposta estruturada do agente (chat ou análise de imagem).
   * Armazenada como JSON para permitir consultas e auditoria futura.
   */
  @Column({ type: 'jsonb', nullable: true })
  response: JsonValue;

  /** Nomes das ferramentas chamadas durante a geração da resposta. */
  @Column({ type: 'jsonb', nullable: true })
  tools_called: string[] | null;

  @Column({ type: 'varchar', default: AiInteractionStatus.SUCCESS })
  status: AiInteractionStatus;

  /** Mensagem de erro técnico, se a interação falhou. */
  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  // -------------------------------------------------------------------------
  // Auditoria de provedor e modelo
  // -------------------------------------------------------------------------

  /** Modelo de IA utilizado (ex: 'claude-sonnet-4-6'). */
  @Column({ type: 'varchar', nullable: true })
  model: string | null;

  /** Provedor de IA (ex: 'anthropic'). */
  @Column({ type: 'varchar', nullable: true })
  provider: string | null;

  /** Latência total da chamada em milissegundos (inclui tool use). */
  @Column({ type: 'integer', nullable: true })
  latency_ms: number | null;

  // -------------------------------------------------------------------------
  // Controle de tokens e custos
  // -------------------------------------------------------------------------

  /** Tokens de entrada consumidos (soma de todas as iterações). */
  @Column({ type: 'integer', nullable: true })
  token_usage_input: number | null;

  /** Tokens de saída gerados (soma de todas as iterações). */
  @Column({ type: 'integer', nullable: true })
  token_usage_output: number | null;

  /**
   * Total de tokens (input + output). Mantido para compatibilidade.
   * @deprecated Use token_usage_input + token_usage_output
   */
  @Column({ type: 'integer', nullable: true })
  tokens_used: number | null;

  /** Custo estimado em USD baseado no modelo e tokens consumidos. */
  @Column({ type: 'decimal', precision: 12, scale: 8, nullable: true })
  estimated_cost_usd: number | null;

  // -------------------------------------------------------------------------
  // Qualidade e segurança da resposta
  // -------------------------------------------------------------------------

  /** Nível de confiança da resposta (high/medium/low). */
  @Column({ type: 'varchar', nullable: true })
  confidence: ConfidenceLevel | null;

  /** Indica se a resposta requer revisão humana. */
  @Column({ type: 'boolean', nullable: true })
  needs_human_review: boolean | null;

  /** Razões rastreáveis para needsHumanReview (JSON array de HumanReviewReason[]). */
  @Column({ type: 'jsonb', nullable: true })
  human_review_reasons: HumanReviewReason[] | null;

  /** Descrição textual do motivo de revisão humana. */
  @Column({ type: 'text', nullable: true })
  human_review_reason: string | null;

  @CreateDateColumn()
  created_at: Date;
}
