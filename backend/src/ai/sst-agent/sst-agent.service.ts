/**
 * SstAgentService - Servico principal do Agente SST.
 *
 * Melhorias v2:
 * - Rate limit por tenant (Redis, fail-open)
 * - Auditoria completa: model, provider, latency_ms, tokens, custo estimado
 * - Deteccao hibrida de needsHumanReview (5 criterios)
 * - Log estruturado com todos os campos de observabilidade
 * - SstChatResponse com interactionId + status + timestamp
 * - Isolamento multi-tenant defensivo em todas as queries
 */

import {
  Injectable,
  Logger,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

import { TenantService } from '../../common/tenant/tenant.service';
import { AiInteraction } from '../entities/ai-interaction.entity';
import { SstToolsExecutor, SST_TOOL_DEFINITIONS } from './sst-agent.tools';
import { SstRateLimitService } from './sst-rate-limit.service';
import {
  SstAgentResponse,
  SstChatResponse,
  ConversationMessage,
  AiInteractionStatus,
  ConfidenceLevel,
  HumanReviewReason,
  HUMAN_REVIEW_TRIGGERS,
  NORMATIVE_QUESTION_PATTERNS,
  CONCLUSIVE_QUESTION_PATTERNS,
  STUB_TOOL_NAMES,
  SuggestedAction,
} from './sst-agent.types';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_PROVIDER = 'anthropic';
const MAX_TOKENS = 2048;
const MAX_TOOL_ITERATIONS = 5;

/** Custo estimado por token — atualizar conforme pricing da Anthropic */
const COST_PER_INPUT_TOKEN = 3 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;

// ---------------------------------------------------------------------------
// Prompt de sistema
// ---------------------------------------------------------------------------

const SST_SYSTEM_PROMPT = `
Voce e um assistente especialista em Saude e Seguranca do Trabalho (SST) integrado ao sistema de gestao desta empresa.

## IDENTIDADE E PAPEL
Voce NAO e um profissional legalmente habilitado. Seu papel e INFORMAR, ORIENTAR e APOIAR.
Decisoes tecnicas, laudos e responsabilidades legais pertencem ao SESMT, Engenheiro de Seguranca ou Medico do Trabalho.

## NORMAS DE REFERENCIA
Cite sempre a norma ao mencionar obrigacoes: NR-1 a NR-35, CLT, Portarias MTE.

## REGRAS CRITICAS
1. NUNCA afirme prazos, multas ou obrigacoes sem citar a norma-fonte
2. NUNCA invente dados — use APENAS o que as ferramentas retornarem
3. NUNCA emita conclusao tecnica definitiva (laudo, nexo causal, etc.)
4. SEMPRE sinalize quando a resposta requer validacao humana
5. Se nao tiver dados suficientes, declare explicitamente
6. Se a ferramenta retornar aviso_stub, informe que os dados nao sao em tempo real

## USO DAS FERRAMENTAS
- Consulte a ferramenta correspondente antes de responder sobre pendencias
- Para diagnosticos gerais, use gerar_resumo_sst como ponto de partida
- Se a tool retornar is_stub=true, informe o usuario e nao apresente os dados como definitivos
`.trim();

// ---------------------------------------------------------------------------
// Servico
// ---------------------------------------------------------------------------

@Injectable()
export class SstAgentService {
  private readonly logger = new Logger(SstAgentService.name);
  private readonly anthropic: Anthropic | null;

  constructor(
    @InjectRepository(AiInteraction)
    private readonly interactionRepo: Repository<AiInteraction>,
    private readonly configService: ConfigService,
    private readonly tenantService: TenantService,
    private readonly toolsExecutor: SstToolsExecutor,
    private readonly rateLimitService: SstRateLimitService,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
      this.logger.log('SstAgentService iniciado com Anthropic API');
    } else {
      this.anthropic = null;
      this.logger.warn('ANTHROPIC_API_KEY nao configurada - SstAgentService em modo STUB');
    }
  }

  // -------------------------------------------------------------------------
  // API publica
  // -------------------------------------------------------------------------

  async chat(
    question: string,
    userId: string,
    history: ConversationMessage[] = [],
  ): Promise<SstChatResponse> {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException('Tenant nao identificado. Verifique autenticacao.');
    }

    // Rate limit por tenant
    const rlCheck = await this.rateLimitService.checkAndConsume(tenantId);
    if (!rlCheck.allowed) {
      this.logger.warn(
        `[SstAgent] Rate limit | tenant=${tenantId} | retryAfter=${rlCheck.retryAfterSeconds}s`,
      );
      throw new HttpException(
        `Limite atingido. Tente novamente em ${rlCheck.retryAfterSeconds} segundos.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const startTime = Date.now();

    const interaction = this.interactionRepo.create({
      tenant_id: tenantId,
      user_id: userId,
      question,
      model: this.anthropic ? ANTHROPIC_MODEL : 'stub',
      provider: this.anthropic ? ANTHROPIC_PROVIDER : 'stub',
      status: AiInteractionStatus.SUCCESS,
    });

    if (!this.anthropic) {
      const stubResp = this.buildStubResponse(question);
      interaction.response = stubResp;
      interaction.latency_ms = Date.now() - startTime;
      interaction.confidence = stubResp.confidence;
      interaction.needs_human_review = stubResp.needsHumanReview;
      await this.interactionRepo.save(interaction);
      return this.toSstChatResponse(stubResp, interaction.id, AiInteractionStatus.SUCCESS);
    }

    try {
      const { result, inputTokens, outputTokens, toolsUsed } =
        await this.runAgentLoop(question, history);

      const latency = Date.now() - startTime;
      const estimatedCost = this.estimateCost(inputTokens, outputTokens);
      const reviewReasons = this.detectHumanReviewReasons(result, question, toolsUsed);
      const finalStatus =
        reviewReasons.length > 0
          ? AiInteractionStatus.NEEDS_REVIEW
          : AiInteractionStatus.SUCCESS;

      interaction.response = result;
      interaction.tools_called = toolsUsed;
      interaction.status = finalStatus;
      interaction.latency_ms = latency;
      interaction.token_usage_input = inputTokens;
      interaction.token_usage_output = outputTokens;
      interaction.tokens_used = inputTokens + outputTokens;
      interaction.estimated_cost_usd = estimatedCost;
      interaction.confidence = result.confidence;
      interaction.needs_human_review = result.needsHumanReview;
      interaction.human_review_reasons = reviewReasons.length > 0 ? reviewReasons : null;
      interaction.human_review_reason = result.humanReviewReason ?? null;

      await this.interactionRepo.save(interaction);

      void this.rateLimitService.recordTokenUsage(tenantId, inputTokens + outputTokens);

      this.logInteraction({
        tenantId, userId, latency, inputTokens, outputTokens,
        estimatedCost, toolsUsed, confidence: result.confidence,
        needsHumanReview: result.needsHumanReview, status: finalStatus,
      });

      return this.toSstChatResponse(result, interaction.id, finalStatus);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const latency = Date.now() - startTime;
      this.logger.error(
        `[SstAgent] Erro | tenant=${tenantId} | user=${userId} | latency=${latency}ms | ${message}`,
      );
      interaction.status = AiInteractionStatus.ERROR;
      interaction.error_message = message;
      interaction.latency_ms = latency;
      await this.interactionRepo.save(interaction);
      throw err;
    }
  }

  async getHistory(userId: string, limit = 20): Promise<Partial<AiInteraction>[]> {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) throw new UnauthorizedException('Tenant nao identificado.');

    // Isolamento defensivo: sempre filtra por tenant_id + user_id
    return this.interactionRepo.find({
      where: { tenant_id: tenantId, user_id: userId },
      order: { created_at: 'DESC' },
      take: Math.min(limit, 100),
      select: ['id', 'question', 'status', 'confidence', 'needs_human_review', 'latency_ms', 'tokens_used', 'created_at'],
    });
  }

  async getInteraction(id: string): Promise<AiInteraction | null> {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) throw new UnauthorizedException('Tenant nao identificado.');

    // NUNCA busca apenas por ID — sempre inclui tenant_id para evitar cross-tenant leaks
    return this.interactionRepo.findOne({ where: { id, tenant_id: tenantId } });
  }

  // -------------------------------------------------------------------------
  // Loop de agente
  // -------------------------------------------------------------------------

  private async runAgentLoop(
    question: string,
    history: ConversationMessage[],
  ): Promise<{
    result: SstAgentResponse;
    inputTokens: number;
    outputTokens: number;
    toolsUsed: string[];
  }> {
    const toolsUsed: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const messages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await this.anthropic!.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system: SST_SYSTEM_PROMPT,
        tools: SST_TOOL_DEFINITIONS,
        messages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      this.logger.debug(
        `[SstAgent] iter=${i + 1} stop=${response.stop_reason} ` +
          `tokens=${response.usage.input_tokens}in/${response.usage.output_tokens}out`,
      );

      if (response.stop_reason === 'end_turn') {
        const text = response.content
          .filter((c): c is Anthropic.TextBlock => c.type === 'text')
          .map((c) => c.text)
          .join('\n');

        return {
          result: this.buildStructuredResponse(text, question, toolsUsed),
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          toolsUsed,
        };
      }

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use',
        );

        messages.push({ role: 'assistant', content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUseBlocks) {
          if (!toolsUsed.includes(toolUse.name)) toolsUsed.push(toolUse.name);
          this.logger.log(`[SstAgent] tool=${toolUse.name}`);

          const tr = await this.toolsExecutor.execute(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(tr.success ? tr.data : { erro: tr.error, disponivel: false }),
          });
        }

        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      break;
    }

    this.logger.warn(`[SstAgent] Limite de ${MAX_TOOL_ITERATIONS} iteracoes atingido`);
    return {
      result: this.buildStructuredResponse(
        'Nao consegui completar a analise. Reformule a pergunta ou acesse os modulos diretamente.',
        question,
        toolsUsed,
      ),
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      toolsUsed,
    };
  }

  // -------------------------------------------------------------------------
  // Deteccao hibrida de revisao humana (5 criterios)
  // -------------------------------------------------------------------------

  /**
   * Retorna array de razoes — vazio significa sem necessidade de revisao.
   *
   * Criterios:
   * 1. SENSITIVE_KEYWORD — termos sensiveis na resposta
   * 2. LOW_CONFIDENCE_NORMATIVE — pergunta normativa + confianca baixa
   * 3. STUB_TOOL_USED — ferramenta sem dados reais foi usada
   * 4. MISSING_NORMATIVE_SOURCES — pergunta normativa sem fontes extraidas
   * 5. CONCLUSIVE_QUESTION — pergunta decisoria/conclusiva identificada
   */
  private detectHumanReviewReasons(
    response: SstAgentResponse,
    question: string,
    toolsUsed: string[],
  ): HumanReviewReason[] {
    const reasons: HumanReviewReason[] = [];
    const answerLower = response.answer.toLowerCase();

    // 1. Keywords sensiveis na resposta
    if (HUMAN_REVIEW_TRIGGERS.some((t) => answerLower.includes(t.toLowerCase()))) {
      reasons.push(HumanReviewReason.SENSITIVE_KEYWORD);
    }

    const isNormativeQ = NORMATIVE_QUESTION_PATTERNS.some((p) => p.test(question));

    // 2. Pergunta normativa com confianca baixa
    if (isNormativeQ && response.confidence === ConfidenceLevel.LOW) {
      reasons.push(HumanReviewReason.LOW_CONFIDENCE_NORMATIVE);
    }

    // 3. Ferramenta stub usada
    if (toolsUsed.some((t) => STUB_TOOL_NAMES.has(t))) {
      reasons.push(HumanReviewReason.STUB_TOOL_USED);
    }

    // 4. Pergunta normativa sem fontes
    if (isNormativeQ && response.sources.length === 0) {
      reasons.push(HumanReviewReason.MISSING_NORMATIVE_SOURCES);
    }

    // 5. Pergunta conclusiva/decisoria
    if (CONCLUSIVE_QUESTION_PATTERNS.some((p) => p.test(question))) {
      reasons.push(HumanReviewReason.CONCLUSIVE_QUESTION);
    }

    return reasons;
  }

  // -------------------------------------------------------------------------
  // Construcao da resposta estruturada
  // -------------------------------------------------------------------------

  private buildStructuredResponse(
    text: string,
    question: string,
    toolsUsed: string[],
  ): SstAgentResponse {
    const confidence = this.detectConfidence(text, toolsUsed);
    const sources = this.extractNormativeSources(text);

    const hasSensitiveKeyword = HUMAN_REVIEW_TRIGGERS.some((t) =>
      text.toLowerCase().includes(t.toLowerCase()),
    );
    const stubToolUsed = toolsUsed.some((t) => STUB_TOOL_NAMES.has(t));
    const isNormativeQ = NORMATIVE_QUESTION_PATTERNS.some((p) => p.test(question));
    const isConclusive = CONCLUSIVE_QUESTION_PATTERNS.some((p) => p.test(question));

    const needsHumanReview =
      hasSensitiveKeyword ||
      stubToolUsed ||
      (isNormativeQ && confidence === ConfidenceLevel.LOW) ||
      isConclusive;

    return {
      answer: text,
      confidence,
      needsHumanReview,
      humanReviewReason: needsHumanReview
        ? 'Esta resposta requer validacao por profissional habilitado (Engenheiro de Seguranca, Medico do Trabalho ou Tecnico de Seguranca).'
        : undefined,
      sources,
      suggestedActions: this.buildSuggestedActions(text, toolsUsed),
      warnings: this.buildWarnings(needsHumanReview, toolsUsed, confidence),
      toolsUsed,
    };
  }

  private detectConfidence(text: string, toolsUsed: string[]): ConfidenceLevel {
    if (toolsUsed.length === 0) return ConfidenceLevel.LOW;

    const lower = text.toLowerCase();
    if (
      lower.includes('nao tenho dados') ||
      lower.includes('nao foi possivel') ||
      lower.includes('integracao em desenvolvimento')
    ) {
      return ConfidenceLevel.LOW;
    }

    const allStubs = toolsUsed.every((t) => STUB_TOOL_NAMES.has(t));
    if (allStubs) return ConfidenceLevel.MEDIUM;

    return toolsUsed.length >= 2 ? ConfidenceLevel.HIGH : ConfidenceLevel.MEDIUM;
  }

  private extractNormativeSources(text: string): string[] {
    const nrPattern = /NR-\d+/gi;
    const cltPattern = /CLT\s+art\.\s*\d+/gi;
    const portariaPattern = /portaria\s+(?:MTE\s+)?\d+[^\s,.)]*/gi;

    return [
      ...new Set([
        ...(text.match(nrPattern) ?? []),
        ...(text.match(cltPattern) ?? []),
        ...(text.match(portariaPattern) ?? []),
      ]),
    ];
  }

  private buildWarnings(
    needsHumanReview: boolean,
    toolsUsed: string[],
    confidence: ConfidenceLevel,
  ): string[] {
    const warnings: string[] = [];

    if (needsHumanReview) {
      warnings.push('Esta resposta requer validacao de profissional habilitado em SST.');
    }
    if (toolsUsed.length === 0) {
      warnings.push('Resposta baseada em conhecimento geral. Nenhum dado do sistema consultado.');
    } else if (toolsUsed.some((t) => STUB_TOOL_NAMES.has(t))) {
      warnings.push(
        'Dados parciais: alguns modulos ainda nao possuem integracao em tempo real. ' +
          'Consulte os modulos diretamente para confirmar.',
      );
    }
    if (confidence === ConfidenceLevel.LOW) {
      warnings.push('Confianca baixa: dados insuficientes ou parcialmente disponiveis.');
    }

    return warnings;
  }

  private buildSuggestedActions(text: string, toolsUsed: string[]): SuggestedAction[] {
    const actions: SuggestedAction[] = [];
    const lower = text.toLowerCase();

    if (toolsUsed.includes('buscar_treinamentos_pendentes') || lower.includes('treinamento')) {
      actions.push({ label: 'Ver Treinamentos', href: '/dashboard/trainings', priority: 'high' });
    }
    if (
      toolsUsed.includes('buscar_exames_medicos_pendentes') ||
      lower.includes('pcmso') ||
      lower.includes('aso')
    ) {
      actions.push({ label: 'Ver Exames (PCMSO)', href: '/dashboard/medical-exams', priority: 'high' });
    }
    if (toolsUsed.includes('buscar_nao_conformidades') || lower.includes('nao conformidade')) {
      actions.push({ label: 'Ver Nao Conformidades', href: '/dashboard/nonconformities', priority: 'medium' });
    }
    if (toolsUsed.includes('buscar_estatisticas_cats') || lower.includes('acidente de trabalho')) {
      actions.push({ label: 'Ver CATs e KPIs', href: '/dashboard/kpis', priority: 'medium' });
    }
    if (toolsUsed.includes('buscar_epis') || lower.includes('epi')) {
      actions.push({ label: 'Ver EPIs', href: '/dashboard/epis', priority: 'medium' });
    }
    if (toolsUsed.includes('buscar_riscos') || lower.includes('risco')) {
      actions.push({ label: 'Ver Mapa de Risco', href: '/dashboard/risk-map', priority: 'medium' });
    }
    if (toolsUsed.includes('buscar_ordens_de_servico') || lower.includes('ordem de servico')) {
      actions.push({ label: 'Ver Ordens de Servico', href: '/dashboard/service-orders', priority: 'medium' });
    }
    if (toolsUsed.includes('gerar_resumo_sst')) {
      actions.push({ label: 'Ver Dashboard', href: '/dashboard', priority: 'low' });
    }

    return actions;
  }

  // -------------------------------------------------------------------------
  // Utilitarios
  // -------------------------------------------------------------------------

  private toSstChatResponse(
    response: SstAgentResponse,
    interactionId: string,
    status: AiInteractionStatus,
  ): SstChatResponse {
    return { ...response, interactionId, status, timestamp: new Date().toISOString() };
  }

  private estimateCost(inputTokens: number, outputTokens: number): number {
    return inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;
  }

  private logInteraction(fields: {
    tenantId: string;
    userId: string;
    latency: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    toolsUsed: string[];
    confidence: ConfidenceLevel;
    needsHumanReview: boolean;
    status: AiInteractionStatus;
  }): void {
    this.logger.log(
      `[SstAgent] complete tenant=${fields.tenantId} user=${fields.userId} ` +
        `provider=${ANTHROPIC_PROVIDER} model=${ANTHROPIC_MODEL} ` +
        `latency=${fields.latency}ms tokens=${fields.inputTokens}in/${fields.outputTokens}out ` +
        `cost=$${fields.estimatedCost.toFixed(6)} tools=[${fields.toolsUsed.join(',')}] ` +
        `confidence=${fields.confidence} needsReview=${fields.needsHumanReview} status=${fields.status}`,
    );
  }

  private buildStubResponse(question: string): SstAgentResponse {
    return {
      answer:
        `Agente SST em modo demonstracao (ANTHROPIC_API_KEY nao configurada). ` +
        `Pergunta registrada: "${question.slice(0, 100)}${question.length > 100 ? '...' : ''}".`,
      confidence: ConfidenceLevel.LOW,
      needsHumanReview: false,
      sources: [],
      suggestedActions: [{ label: 'Ver Dashboard', href: '/dashboard', priority: 'low' }],
      warnings: ['ANTHROPIC_API_KEY nao configurada. Agente SST em modo stub.'],
      toolsUsed: [],
    };
  }
}
