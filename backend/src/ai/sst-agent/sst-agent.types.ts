/**
 * Tipos, interfaces e enums do Agente SST.
 *
 * Regras de segurança incorporadas no design:
 * - Toda resposta tem campo `needsHumanReview` explícito com razões rastreáveis
 * - Confiança é declarada (high/medium/low) e nunca assumida
 * - Fontes normativas são rastreadas na resposta
 * - Ações sugeridas apontam para fluxos do sistema, não para decisões autônomas
 * - Ferramentas stub são marcadas explicitamente para reduzir confiança
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum AiInteractionStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  NEEDS_REVIEW = 'needs_review',
  RATE_LIMITED = 'rate_limited',
}

export enum ConfidenceLevel {
  /** Resposta baseada em dados concretos do sistema + fontes normativas. */
  HIGH = 'high',
  /** Resposta parcialmente embasada; alguns dados indisponíveis ou stubs usados. */
  MEDIUM = 'medium',
  /** Sem dados reais do sistema; resposta apenas orientativa/geral ou stubs dominam. */
  LOW = 'low',
}

/**
 * Razões rastreáveis para o flag `needsHumanReview`.
 * Permite ao frontend exibir contexto específico para o usuário.
 */
export enum HumanReviewReason {
  /** Resposta contém termo sensível (CAT, laudo, interdição, etc.) */
  SENSITIVE_KEYWORD = 'sensitive_keyword',
  /** Pergunta normativa/técnica com nível de confiança baixo */
  LOW_CONFIDENCE_NORMATIVE = 'low_confidence_normative',
  /** Ferramenta stub utilizada — dados não são em tempo real */
  STUB_TOOL_USED = 'stub_tool_used',
  /** Pergunta normativa sem fontes extraídas da resposta */
  MISSING_NORMATIVE_SOURCES = 'missing_normative_sources',
  /** Pergunta conclusiva ou decisória identificada */
  CONCLUSIVE_QUESTION = 'conclusive_question',
}

// ---------------------------------------------------------------------------
// Response estruturada do agente
// ---------------------------------------------------------------------------

export interface SuggestedAction {
  /** Texto do botão/link para o usuário. */
  label: string;
  /** Rota interna do sistema (ex: '/dashboard/trainings'). */
  href?: string;
  priority: 'high' | 'medium' | 'low';
}

export type ImageRiskLevel = 'Baixo' | 'Médio' | 'Alto' | 'Crítico';

export interface ImageRiskAnalysis {
  summary: string;
  riskLevel: ImageRiskLevel;
  imminentRisks: string[];
  immediateActions: string[];
  ppeRecommendations: string[];
  notes: string;
}

/**
 * Resposta padronizada do Agente SST.
 * Sempre estruturada — o frontend nunca recebe texto puro sem metadados.
 */
export interface SstAgentResponse {
  /** Resposta principal em texto. */
  answer: string;
  /** Nível de confiança declarado pelo agente. */
  confidence: ConfidenceLevel;
  /**
   * Indica se a resposta requer validação de profissional habilitado.
   * Deve ser exibido com destaque visual no frontend.
   */
  needsHumanReview: boolean;
  /** Motivo pelo qual validação humana é necessária (quando aplicável). */
  humanReviewReason?: string;
  /** Razões técnicas rastreáveis para needsHumanReview (para auditoria). */
  humanReviewReasons?: HumanReviewReason[];
  /** Normas/fontes normativas identificadas na resposta (ex: ['NR-6', 'NR-7']). */
  sources: string[];
  /** Próximos passos concretos sugeridos ao usuário. */
  suggestedActions: SuggestedAction[];
  /** Alertas e avisos importantes que devem ser exibidos ao usuário. */
  warnings: string[];
  /** Nomes das ferramentas (tools) chamadas durante a geração desta resposta. */
  toolsUsed: string[];
}

/**
 * Resposta completa do endpoint /ai/sst/chat.
 * Estende SstAgentResponse com metadados de auditoria da interação.
 * Totalmente backward-compatible.
 */
export interface SstChatResponse extends SstAgentResponse {
  /** UUID da interação salva no banco para rastreabilidade. */
  interactionId: string;
  /** Status final da interação. */
  status: AiInteractionStatus;
  /** ISO timestamp de quando a resposta foi gerada. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Conversa (histórico)
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// Resultado de execução de tool
// ---------------------------------------------------------------------------

export interface SstToolResult {
  success: boolean;
  /** Indica se este resultado vem de uma ferramenta stub (sem dados reais). */
  is_stub?: boolean;
  data?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------

export interface SstRateLimitCheck {
  allowed: boolean;
  retryAfterSeconds?: number;
  remaining: {
    perMinute: number;
    perDay: number;
  };
}

// ---------------------------------------------------------------------------
// Detecção de revisão humana — Abordagem Híbrida
// ---------------------------------------------------------------------------

/**
 * Gatilhos de revisão humana por keyword.
 * Se a RESPOSTA do modelo contiver qualquer um desses termos,
 * needsHumanReview é automaticamente definido como true.
 */
export const HUMAN_REVIEW_TRIGGERS = [
  'laudo técnico',
  'laudo pericial',
  'laudo de insalubridade',
  'laudo de periculosidade',
  'responsabilidade legal',
  'responsabilidade civil',
  'decisão técnica',
  'conclusão técnica',
  'conclusão pericial',
  'notificação de acidente',
  'comunicação de acidente',
  'processo trabalhista',
  'ação trabalhista',
  'interdição',
  'autuação',
  'embargo',
  'invalidez permanente',
  'afastamento médico',
  'nexo causal',
  'insalubridade',
  'periculosidade',
  'adicional de insalubridade',
  'adicional de periculosidade',
  'rescisão por justa causa',
  'acidente fatal',
  'óbito',
] as const;

/**
 * Padrões que indicam que a PERGUNTA é normativa/técnica.
 * Usado na detecção híbrida para cruzar com confiança baixa.
 */
export const NORMATIVE_QUESTION_PATTERNS = [
  /NR-\d+/i,
  /\bobriga\w*/i,
  /\bprazo\b/i,
  /\bmulta\b/i,
  /\bpenalidade\b/i,
  /\blegal\b/i,
  /\bnorma\b/i,
  /\blegislação\b/i,
  /\bCLT\b/i,
  /\bSESMT\b/i,
  /\bPCMSO\b/i,
  /\bPGR\b/i,
  /\bCIPA\b/i,
] as const;

/**
 * Padrões de pergunta conclusiva/decisória.
 * Indicam que o usuário busca uma decisão técnica definitiva.
 */
export const CONCLUSIVE_QUESTION_PATTERNS = [
  /posso\s+demitir/i,
  /sou\s+obrigado/i,
  /preciso\s+pagar/i,
  /é\s+obrigatório/i,
  /tenho\s+que\s+pagar/i,
  /qual\s+é\s+a\s+multa/i,
  /como\s+devo\s+proceder/i,
  /o\s+que\s+fazer\s+em\s+caso\s+de/i,
  /responsabilidade\s+é\s+minha/i,
  /posso\s+ser\s+multado/i,
  /caracteriza\s+acidente/i,
  /é\s+considerado\s+insalubre/i,
  /grau\s+de\s+insalubridade/i,
] as const;

/**
 * Nomes das ferramentas que são stubs (sem dados reais).
 * Usado para reduzir confiança e sinalizar ao usuário.
 */
export const STUB_TOOL_NAMES = new Set<string>([]);
