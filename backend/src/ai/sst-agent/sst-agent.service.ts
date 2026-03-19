/**
 * SstAgentService - Servico principal do Agente SST.
 *
 * SOPHIE runtime:
 * - OpenAI como provedora oficial e unica do assistente
 * - Rate limit por tenant (Redis, fail-open)
 * - Auditoria completa: model, provider, latency_ms, tokens, custo estimado
 * - Deteccao hibrida de needsHumanReview
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
import { MoreThanOrEqual, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

import { TenantService } from '../../common/tenant/tenant.service';
import { IntegrationResilienceService } from '../../common/resilience/integration-resilience.service';
import { AiInteraction } from '../entities/ai-interaction.entity';
import {
  SOPHIE_IMAGE_ANALYSIS_PROMPT,
  SOPHIE_SYSTEM_PROMPT,
} from '../sophie.prompts';
import { SophieLocalChatService } from '../../sophie/sophie.local-chat.service';
import {
  OPENAI_TOOL_DEFINITIONS,
  SstToolsExecutor,
  SST_TOOL_DEFINITIONS,
} from './sst-agent.tools';
import { requestOpenAiChatCompletionResponse } from '../openai-request.util';
import { SstRateLimitService } from './sst-rate-limit.service';
import {
  SstAgentResponse,
  SstChatResponse,
  ConversationMessage,
  ImageRiskAnalysis,
  ImageRiskLevel,
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

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_PROVIDER = 'anthropic';
const OPENAI_PROVIDER = 'openai';
const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
const DEFAULT_OPENAI_VISION_MODEL = 'gpt-5-mini';
const DEFAULT_OPENAI_FALLBACK_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_REASONING_EFFORT = 'medium';
const MAX_TOKENS = 2048;
const MAX_TOOL_ITERATIONS = 5;
const DEFAULT_AI_HISTORY_DAYS = 30;
const DEFAULT_AI_HISTORY_MAX_DAYS = 90;
const DEFAULT_AI_HISTORY_MAX_LIMIT = 100;

/** Custo estimado por token — atualizar conforme pricing da Anthropic */
const COST_PER_INPUT_TOKEN = 3 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;
const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

type SupportedAiProvider =
  | typeof OPENAI_PROVIDER
  | typeof ANTHROPIC_PROVIDER
  | 'local'
  | 'stub';

// ---------------------------------------------------------------------------
// Prompt de sistema
// ---------------------------------------------------------------------------

const SST_SYSTEM_PROMPT = SOPHIE_SYSTEM_PROMPT;
const SST_IMAGE_ANALYSIS_PROMPT = SOPHIE_IMAGE_ANALYSIS_PROMPT;

// ---------------------------------------------------------------------------
// Servico
// ---------------------------------------------------------------------------

@Injectable()
export class SstAgentService {
  private readonly logger = new Logger(SstAgentService.name);
  private readonly anthropic: Anthropic | null;
  private readonly openaiApiKey: string | null;
  private readonly openaiModel: string;
  private readonly openaiVisionModel: string;
  private readonly openaiFallbackModel: string | null;
  private readonly openaiReasoningEffort: 'minimal' | 'low' | 'medium' | 'high';
  private readonly provider: SupportedAiProvider;
  private readonly model: string;
  private readonly anthropicModel: string;
  private readonly historyDefaultDays: number;
  private readonly historyMaxDays: number;
  private readonly historyMaxLimit: number;

  constructor(
    @InjectRepository(AiInteraction)
    private readonly interactionRepo: Repository<AiInteraction>,
    private readonly configService: ConfigService,
    private readonly tenantService: TenantService,
    private readonly toolsExecutor: SstToolsExecutor,
    private readonly rateLimitService: SstRateLimitService,
    private readonly sophieLocalChatService: SophieLocalChatService,
    private readonly integration: IntegrationResilienceService,
  ) {
    const openaiApiKey =
      this.configService.get<string>('OPENAI_API_KEY')?.trim() || null;
    const anthropicModel =
      this.configService.get<string>('ANTHROPIC_MODEL')?.trim() ||
      DEFAULT_ANTHROPIC_MODEL;
    const openaiModel =
      this.configService.get<string>('OPENAI_MODEL')?.trim() ||
      DEFAULT_OPENAI_MODEL;
    const openaiVisionModel =
      this.configService.get<string>('OPENAI_VISION_MODEL')?.trim() ||
      openaiModel ||
      DEFAULT_OPENAI_VISION_MODEL;
    const configuredFallbackModel =
      this.configService.get<string>('OPENAI_FALLBACK_MODEL')?.trim() || '';
    const openaiReasoningEffort =
      (this.configService
        .get<string>('OPENAI_REASONING_EFFORT')
        ?.trim()
        .toLowerCase() as 'minimal' | 'low' | 'medium' | 'high' | undefined) ||
      DEFAULT_OPENAI_REASONING_EFFORT;
    this.openaiApiKey = openaiApiKey;
    this.openaiModel = openaiModel;
    this.openaiVisionModel = openaiVisionModel;
    this.openaiFallbackModel =
      configuredFallbackModel ||
      (openaiModel !== DEFAULT_OPENAI_FALLBACK_MODEL
        ? DEFAULT_OPENAI_FALLBACK_MODEL
        : null);
    this.openaiReasoningEffort = openaiReasoningEffort;
    this.provider = 'stub';
    this.model = 'stub';
    this.anthropicModel = anthropicModel;
    this.historyDefaultDays = this.getPositiveIntConfig(
      'AI_HISTORY_DEFAULT_DAYS',
      DEFAULT_AI_HISTORY_DAYS,
    );
    this.historyMaxDays = this.getPositiveIntConfig(
      'AI_HISTORY_MAX_DAYS',
      DEFAULT_AI_HISTORY_MAX_DAYS,
    );
    this.historyMaxLimit = this.getPositiveIntConfig(
      'AI_HISTORY_MAX_LIMIT',
      DEFAULT_AI_HISTORY_MAX_LIMIT,
    );
    this.anthropic = null;

    const configuredProvider = this.configService
      .get<string>('AI_PROVIDER')
      ?.trim()
      .toLowerCase();

    if (
      configuredProvider &&
      configuredProvider !== OPENAI_PROVIDER &&
      configuredProvider !== 'stub'
    ) {
      this.logger.warn(
        `AI_PROVIDER=${configuredProvider} ignorado. A SOPHIE usa OpenAI como provedora oficial unica.`,
      );
    }

    if (openaiApiKey) {
      this.provider = OPENAI_PROVIDER;
      this.model = openaiModel;
      this.logger.log(
        `SOPHIE iniciada com OpenAI (${this.model}) como motor oficial (fallback=${this.openaiFallbackModel || 'none'} reasoning=${this.openaiReasoningEffort}).`,
      );
      return;
    }

    this.provider = 'stub';
    this.model = 'openai-unconfigured';
    this.logger.warn(
      'OPENAI_API_KEY nao configurada. A SOPHIE permanece visivel, mas operando em modo indisponivel ate a OpenAI ser configurada.',
    );
  }

  getRuntimeStatus() {
    return {
      provider: this.provider,
      officialProvider: OPENAI_PROVIDER,
      configured: this.provider === OPENAI_PROVIDER,
      runtimeMode: this.provider === OPENAI_PROVIDER ? 'online' : 'degraded',
      model: this.model,
      openaiModel: this.openaiModel,
      openaiVisionModel: this.openaiVisionModel,
      openaiFallbackModel: this.openaiFallbackModel,
      openaiReasoningEffort: this.openaiReasoningEffort,
      historyDefaultDays: this.historyDefaultDays,
      historyMaxDays: this.historyMaxDays,
      historyMaxLimit: this.historyMaxLimit,
      imageAnalysisEnabled: this.provider === OPENAI_PROVIDER,
      externalProviderEnabled: this.provider === OPENAI_PROVIDER,
      localFallbackEnabled: false,
    };
  }

  private supportsReasoningEffort(model: string): boolean {
    const normalized = String(model || '')
      .trim()
      .toLowerCase();
    return (
      normalized.startsWith('gpt-5') ||
      normalized.startsWith('o1') ||
      normalized.startsWith('o3') ||
      normalized.startsWith('o4')
    );
  }

  private getOpenAiModelCandidates(primaryModel: string): string[] {
    return Array.from(
      new Set(
        [primaryModel, this.openaiFallbackModel]
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      ),
    );
  }

  private parseOpenAiErrorBody(body: string): {
    message: string;
    type?: string;
    code?: string;
  } {
    try {
      const parsed = JSON.parse(body) as {
        error?: { message?: string; type?: string; code?: string };
      };
      return {
        message:
          parsed?.error?.message?.trim() ||
          body.trim() ||
          'Erro desconhecido da OpenAI.',
        type: parsed?.error?.type,
        code: parsed?.error?.code,
      };
    } catch {
      return {
        message: body.trim() || 'Erro desconhecido da OpenAI.',
      };
    }
  }

  private shouldRetryWithFallback(params: {
    status: number;
    candidateIndex: number;
    candidates: string[];
    errorMessage: string;
    errorCode?: string;
  }): boolean {
    if (params.candidateIndex >= params.candidates.length - 1) {
      return false;
    }

    const normalizedMessage = params.errorMessage.toLowerCase();
    const normalizedCode = String(params.errorCode || '').toLowerCase();

    if (params.status === 403 || params.status === 404) {
      return true;
    }

    if (params.status === 400) {
      return (
        normalizedMessage.includes('model') ||
        normalizedMessage.includes('reasoning_effort') ||
        normalizedCode.includes('model')
      );
    }

    return false;
  }

  private formatOpenAiError(params: {
    status: number;
    model: string;
    context: string;
    message: string;
    type?: string;
    code?: string;
  }): string {
    const meta = [
      `context=${params.context}`,
      `model=${params.model}`,
      params.type ? `type=${params.type}` : null,
      params.code ? `code=${params.code}` : null,
    ]
      .filter(Boolean)
      .join(' ');

    return `OpenAI API error ${params.status} (${meta}): ${params.message}`;
  }

  private async requestOpenAiChatCompletion<T>(params: {
    context: string;
    primaryModel: string;
    buildBody: (model: string) => Record<string, unknown>;
  }): Promise<{ payload: T; model: string }> {
    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY nao configurada.');
    }

    const candidates = this.getOpenAiModelCandidates(params.primaryModel);
    let lastError: Error | null = null;

    for (let index = 0; index < candidates.length; index += 1) {
      const model = candidates[index];
      const body = params.buildBody(model);

      if (!this.supportsReasoningEffort(model) && 'reasoning_effort' in body) {
        delete body.reasoning_effort;
      }

      const response = await requestOpenAiChatCompletionResponse({
        apiKey: this.openaiApiKey,
        body,
        configService: this.configService,
        integration: this.integration,
      });

      if (response.ok) {
        if (index > 0) {
          this.logger.warn(
            `[SstAgent] OpenAI fallback aplicado com sucesso | context=${params.context} | model=${model}`,
          );
        }
        return {
          payload: (await response.json()) as T,
          model,
        };
      }

      const rawBody = await response.text();
      const parsedError = this.parseOpenAiErrorBody(rawBody);
      const formattedError = this.formatOpenAiError({
        status: response.status,
        model,
        context: params.context,
        message: parsedError.message,
        type: parsedError.type,
        code: parsedError.code,
      });

      this.logger.error(`[SstAgent] ${formattedError}`);

      if (
        this.shouldRetryWithFallback({
          status: response.status,
          candidateIndex: index,
          candidates,
          errorMessage: parsedError.message,
          errorCode: parsedError.code,
        })
      ) {
        const nextModel = candidates[index + 1];
        this.logger.warn(
          `[SstAgent] Tentando fallback OpenAI | context=${params.context} | from=${model} | to=${nextModel}`,
        );
        continue;
      }

      lastError = new Error(formattedError);
      break;
    }

    throw (
      lastError || new Error(`Falha ao chamar OpenAI em ${params.context}.`)
    );
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
      throw new UnauthorizedException(
        'Tenant nao identificado. Verifique autenticacao.',
      );
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
      model: this.model,
      provider: this.provider,
      status: AiInteractionStatus.SUCCESS,
    });

    if (this.provider === 'stub') {
      const stubResp = this.buildStubResponse(question);
      interaction.response = stubResp;
      interaction.latency_ms = Date.now() - startTime;
      interaction.confidence = stubResp.confidence;
      interaction.needs_human_review = stubResp.needsHumanReview;
      try {
        await this.interactionRepo.save(interaction);
      } catch (saveErr) {
        this.logger.warn(
          `[SstAgent] Falha ao persistir interação stub (non-fatal): ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
        );
      }
      return this.toSstChatResponse(
        stubResp,
        interaction.id,
        AiInteractionStatus.SUCCESS,
      );
    }

    try {
      const { result, inputTokens, outputTokens, toolsUsed } =
        await this.runOpenAiAgentLoop(question, history);

      const latency = Date.now() - startTime;
      const estimatedCost = this.estimateCost(
        inputTokens,
        outputTokens,
        this.provider,
      );
      const reviewReasons = this.detectHumanReviewReasons(
        result,
        question,
        toolsUsed,
      );
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
      interaction.human_review_reasons =
        reviewReasons.length > 0 ? reviewReasons : null;
      interaction.human_review_reason = result.humanReviewReason ?? null;

      await this.interactionRepo.save(interaction);

      void this.rateLimitService.recordTokenUsage(
        tenantId,
        inputTokens + outputTokens,
      );

      this.logInteraction({
        tenantId,
        userId,
        latency,
        inputTokens,
        outputTokens,
        estimatedCost,
        toolsUsed,
        confidence: result.confidence,
        needsHumanReview: result.needsHumanReview,
        status: finalStatus,
        provider: this.provider,
        model: this.model,
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
      try {
        await this.interactionRepo.save(interaction);
      } catch (saveErr) {
        this.logger.warn(
          `[SstAgent] Falha ao persistir interação com erro (non-fatal): ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
        );
      }

      return this.toSstChatResponse(
        this.buildProviderFallbackResponse(question),
        interaction.id,
        AiInteractionStatus.ERROR,
      );
    }
  }

  async getHistory(
    userId: string,
    limit = 20,
    days?: number,
  ): Promise<Partial<AiInteraction>[]> {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) throw new UnauthorizedException('Tenant nao identificado.');

    const safeLimit = this.clampPositiveInt(limit, this.historyMaxLimit, 20);
    const safeDays = this.clampPositiveInt(
      days,
      this.historyMaxDays,
      this.historyDefaultDays,
    );
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    // Isolamento defensivo: sempre filtra por tenant_id + user_id.
    // O recorte temporal padrão evita histórico amplo demais em tenants maiores.
    return this.interactionRepo.find({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        created_at: MoreThanOrEqual(since),
      },
      order: { created_at: 'DESC' },
      take: safeLimit,
      select: [
        'id',
        'question',
        'status',
        'confidence',
        'needs_human_review',
        'latency_ms',
        'tokens_used',
        'created_at',
      ],
    });
  }

  async getInteraction(id: string): Promise<AiInteraction | null> {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) throw new UnauthorizedException('Tenant nao identificado.');

    // NUNCA busca apenas por ID — sempre inclui tenant_id para evitar cross-tenant leaks
    return this.interactionRepo.findOne({ where: { id, tenant_id: tenantId } });
  }

  async analyzeImageRisk(
    imageBuffer: Buffer,
    mimeType: string,
    userId: string,
    context?: string,
  ): Promise<ImageRiskAnalysis> {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Tenant nao identificado. Verifique autenticacao.',
      );
    }

    if (
      !ALLOWED_IMAGE_MIME_TYPES.includes(
        mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
      )
    ) {
      throw new HttpException(
        'Formato de imagem nao suportado.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const rlCheck = await this.rateLimitService.checkAndConsume(tenantId);
    if (!rlCheck.allowed) {
      throw new HttpException(
        `Limite atingido. Tente novamente em ${rlCheck.retryAfterSeconds} segundos.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const startTime = Date.now();
    const question = context?.trim()
      ? `Analise a foto considerando este contexto: ${context.trim()}`
      : 'Analise a foto e descreva os principais riscos de SST visiveis.';

    const interaction = this.interactionRepo.create({
      tenant_id: tenantId,
      user_id: userId,
      question,
      model: this.model,
      provider: this.provider,
      status: AiInteractionStatus.SUCCESS,
    });

    if (this.provider === 'stub') {
      const stub = this.buildStubImageAnalysis();
      interaction.response = stub;
      interaction.latency_ms = Date.now() - startTime;
      try {
        await this.interactionRepo.save(interaction);
      } catch (saveErr) {
        this.logger.warn(
          `[SstAgent] Falha ao persistir interação stub de imagem (non-fatal): ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
        );
      }
      return stub;
    }

    try {
      const { analysis, inputTokens, outputTokens } =
        await this.analyzeImageWithOpenAi(imageBuffer, mimeType, context);

      const latency = Date.now() - startTime;
      interaction.response = analysis;
      interaction.latency_ms = latency;
      interaction.token_usage_input = inputTokens;
      interaction.token_usage_output = outputTokens;
      interaction.tokens_used = inputTokens + outputTokens;
      interaction.estimated_cost_usd = this.estimateCost(
        inputTokens,
        outputTokens,
        this.provider,
      );
      interaction.confidence =
        analysis.riskLevel === 'Crítico' || analysis.riskLevel === 'Alto'
          ? ConfidenceLevel.HIGH
          : ConfidenceLevel.MEDIUM;

      await this.interactionRepo.save(interaction);

      this.logger.log(
        `[SstAgent] image-analysis tenant=${tenantId} user=${userId} provider=${this.provider} model=${this.model} latency=${latency}ms`,
      );

      return analysis;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      interaction.status = AiInteractionStatus.ERROR;
      interaction.error_message = message;
      interaction.latency_ms = Date.now() - startTime;
      try {
        await this.interactionRepo.save(interaction);
      } catch (saveErr) {
        this.logger.warn(
          `[SstAgent] Falha ao persistir erro da analise de imagem (non-fatal): ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
        );
      }
      return this.buildProviderFallbackImageAnalysis();
    }
  }

  // -------------------------------------------------------------------------
  // Loop de agente
  // -------------------------------------------------------------------------

  private async runOpenAiAgentLoop(
    question: string,
    history: ConversationMessage[],
  ): Promise<{
    result: SstAgentResponse;
    inputTokens: number;
    outputTokens: number;
    toolsUsed: string[];
  }> {
    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY nao configurada.');
    }

    type OpenAiToolCall = {
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    };

    type OpenAiChatCompletion = {
      choices?: Array<{
        message?: {
          role?: 'assistant';
          content?: string | null;
          tool_calls?: OpenAiToolCall[];
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
    };

    const toolsUsed: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const messages: Array<Record<string, unknown>> = [
      { role: 'developer', content: SST_SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: question },
    ];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const { payload } =
        await this.requestOpenAiChatCompletion<OpenAiChatCompletion>({
          context: 'agent-loop',
          primaryModel: this.openaiModel,
          buildBody: (model) => ({
            model,
            temperature: 0.2,
            max_completion_tokens: MAX_TOKENS,
            reasoning_effort: this.openaiReasoningEffort,
            messages,
            tools: OPENAI_TOOL_DEFINITIONS,
            tool_choice: 'auto',
          }),
        });
      totalInputTokens += payload.usage?.prompt_tokens ?? 0;
      totalOutputTokens += payload.usage?.completion_tokens ?? 0;

      const message = payload.choices?.[0]?.message;
      const toolCalls = message?.tool_calls ?? [];
      const text = (message?.content ?? '').trim();

      if (!toolCalls.length) {
        if (!text) {
          throw new Error('OpenAI nao retornou texto utilizavel.');
        }

        return {
          result: this.buildStructuredResponse(text, question, toolsUsed),
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          toolsUsed,
        };
      }

      messages.push({
        role: 'assistant',
        content: message?.content ?? '',
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name;
        if (!toolName) continue;

        if (!toolsUsed.includes(toolName)) {
          toolsUsed.push(toolName);
        }

        let args: Record<string, unknown> = {};
        const rawArgs = toolCall.function?.arguments ?? '';
        if (rawArgs) {
          try {
            args = JSON.parse(rawArgs) as Record<string, unknown>;
          } catch {
            args = {};
          }
        }

        const toolResult = await this.toolsExecutor.execute(toolName, args);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(
            toolResult.success
              ? {
                  success: true,
                  data: toolResult.data ?? null,
                  is_stub: toolResult.is_stub ?? false,
                }
              : {
                  success: false,
                  error:
                    toolResult.error ??
                    'Erro desconhecido ao executar ferramenta.',
                },
          ),
        });
      }
    }

    this.logger.warn(
      `[SstAgent] OpenAI atingiu o limite de ${MAX_TOOL_ITERATIONS} iteracoes`,
    );
    const fallbackAnswer =
      'Nao consegui completar a analise com os dados disponiveis. Reformule a pergunta ou acesse os modulos diretamente para confirmar as informacoes.';

    return {
      result: this.buildStructuredResponse(fallbackAnswer, question, toolsUsed),
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      toolsUsed,
    };
  }

  private async runAnthropicAgentLoop(
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
        model: this.anthropicModel,
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
            content: JSON.stringify(
              tr.success ? tr.data : { erro: tr.error, disponivel: false },
            ),
          });
        }

        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      break;
    }

    this.logger.warn(
      `[SstAgent] Limite de ${MAX_TOOL_ITERATIONS} iteracoes atingido`,
    );
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

  private async analyzeImageWithAnthropic(
    imageBuffer: Buffer,
    mimeType: string,
    context?: string,
  ): Promise<{
    analysis: ImageRiskAnalysis;
    inputTokens: number;
    outputTokens: number;
  }> {
    const response = await this.anthropic!.messages.create({
      model: this.anthropicModel,
      max_tokens: MAX_TOKENS,
      system: SST_IMAGE_ANALYSIS_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as
                  | 'image/jpeg'
                  | 'image/png'
                  | 'image/webp',
                data: imageBuffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: context?.trim()
                ? `Contexto adicional do usuario: ${context.trim()}`
                : 'Sem contexto adicional fornecido.',
            },
          ],
        },
      ],
    });

    const answer = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return {
      analysis: this.parseImageRiskAnalysis(answer),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  private async analyzeImageWithOpenAi(
    imageBuffer: Buffer,
    mimeType: string,
    context?: string,
  ): Promise<{
    analysis: ImageRiskAnalysis;
    inputTokens: number;
    outputTokens: number;
  }> {
    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY nao configurada.');
    }

    type OpenAiVisionResponse = {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
    };

    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    const userContext = context?.trim()
      ? `Contexto adicional do usuario: ${context.trim()}`
      : 'Sem contexto adicional fornecido.';

    const { payload } =
      await this.requestOpenAiChatCompletion<OpenAiVisionResponse>({
        context: 'image-analysis',
        primaryModel: this.openaiVisionModel,
        buildBody: (model) => ({
          model,
          temperature: 0.2,
          max_completion_tokens: 1200,
          reasoning_effort: this.openaiReasoningEffort,
          messages: [
            { role: 'developer', content: SST_IMAGE_ANALYSIS_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: userContext },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      });
    const answer = (payload.choices?.[0]?.message?.content ?? '').trim();
    if (!answer) {
      throw new Error('OpenAI nao retornou analise de imagem.');
    }

    return {
      analysis: this.parseImageRiskAnalysis(answer),
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
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
    if (
      HUMAN_REVIEW_TRIGGERS.some((t) => answerLower.includes(t.toLowerCase()))
    ) {
      reasons.push(HumanReviewReason.SENSITIVE_KEYWORD);
    }

    const isNormativeQ = NORMATIVE_QUESTION_PATTERNS.some((p) =>
      p.test(question),
    );

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
    const isNormativeQ = NORMATIVE_QUESTION_PATTERNS.some((p) =>
      p.test(question),
    );
    const isConclusive = CONCLUSIVE_QUESTION_PATTERNS.some((p) =>
      p.test(question),
    );

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

    return toolsUsed.length >= 2
      ? ConfidenceLevel.HIGH
      : ConfidenceLevel.MEDIUM;
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
      warnings.push(
        'Esta resposta requer validacao de profissional habilitado em SST.',
      );
    }
    if (toolsUsed.length === 0) {
      warnings.push(
        'Resposta baseada em conhecimento geral. Nenhum dado do sistema consultado.',
      );
    } else if (toolsUsed.some((t) => STUB_TOOL_NAMES.has(t))) {
      warnings.push(
        'Dados parciais: alguns modulos ainda nao possuem integracao em tempo real. ' +
          'Consulte os modulos diretamente para confirmar.',
      );
    }
    if (confidence === ConfidenceLevel.LOW) {
      warnings.push(
        'Confianca baixa: dados insuficientes ou parcialmente disponiveis.',
      );
    }

    return warnings;
  }

  private buildSuggestedActions(
    text: string,
    toolsUsed: string[],
  ): SuggestedAction[] {
    const actions: SuggestedAction[] = [];
    const lower = text.toLowerCase();

    if (
      toolsUsed.includes('buscar_treinamentos_pendentes') ||
      lower.includes('treinamento')
    ) {
      actions.push({
        label: 'Ver Treinamentos',
        href: '/dashboard/trainings',
        priority: 'high',
      });
    }
    if (
      toolsUsed.includes('buscar_exames_medicos_pendentes') ||
      lower.includes('pcmso') ||
      lower.includes('aso')
    ) {
      actions.push({
        label: 'Ver Exames (PCMSO)',
        href: '/dashboard/medical-exams',
        priority: 'high',
      });
    }
    if (
      toolsUsed.includes('buscar_nao_conformidades') ||
      lower.includes('nao conformidade')
    ) {
      actions.push({
        label: 'Ver Nao Conformidades',
        href: '/dashboard/nonconformities',
        priority: 'medium',
      });
    }
    if (
      toolsUsed.includes('buscar_estatisticas_cats') ||
      lower.includes('acidente de trabalho')
    ) {
      actions.push({
        label: 'Ver CATs e KPIs',
        href: '/dashboard/kpis',
        priority: 'medium',
      });
    }
    if (toolsUsed.includes('buscar_epis') || lower.includes('epi')) {
      actions.push({
        label: 'Ver EPIs',
        href: '/dashboard/epis',
        priority: 'medium',
      });
    }
    if (toolsUsed.includes('buscar_riscos') || lower.includes('risco')) {
      actions.push({
        label: 'Ver Mapa de Risco',
        href: '/dashboard/risk-map',
        priority: 'medium',
      });
    }
    if (
      toolsUsed.includes('buscar_ordens_de_servico') ||
      lower.includes('ordem de servico')
    ) {
      actions.push({
        label: 'Ver Ordens de Servico',
        href: '/dashboard/service-orders',
        priority: 'medium',
      });
    }
    if (toolsUsed.includes('gerar_resumo_sst')) {
      actions.push({
        label: 'Ver Dashboard',
        href: '/dashboard',
        priority: 'low',
      });
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
    return {
      ...response,
      interactionId,
      status,
      timestamp: new Date().toISOString(),
    };
  }

  private parseImageRiskAnalysis(rawText: string): ImageRiskAnalysis {
    const normalized = rawText.trim();
    const jsonMatch =
      normalized.match(/```json\s*([\s\S]*?)```/i) ||
      normalized.match(/```([\s\S]*?)```/i);
    const candidate = (jsonMatch?.[1] ?? normalized).trim();

    try {
      const parsed = JSON.parse(candidate) as Partial<ImageRiskAnalysis>;
      return {
        summary: parsed.summary?.trim() || 'Analise de risco concluida.',
        riskLevel: this.normalizeRiskLevel(parsed.riskLevel),
        imminentRisks: this.normalizeStringArray(parsed.imminentRisks),
        immediateActions: this.normalizeStringArray(parsed.immediateActions),
        ppeRecommendations: this.normalizeStringArray(
          parsed.ppeRecommendations,
        ),
        notes: parsed.notes?.trim() || 'Sem observacoes adicionais.',
      };
    } catch {
      return {
        summary:
          candidate.slice(0, 280) ||
          'Nao foi possivel estruturar a analise automaticamente.',
        riskLevel: 'Médio',
        imminentRisks: [],
        immediateActions: [
          'Revisar manualmente a imagem e confirmar os riscos em campo.',
        ],
        ppeRecommendations: [],
        notes: candidate,
      };
    }
  }

  private normalizeRiskLevel(value?: string): ImageRiskLevel {
    switch ((value || '').toLowerCase()) {
      case 'baixo':
        return 'Baixo';
      case 'medio':
      case 'médio':
        return 'Médio';
      case 'alto':
        return 'Alto';
      case 'critico':
      case 'crítico':
        return 'Crítico';
      default:
        return 'Médio';
    }
  }

  private normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, 8);
  }

  private estimateCost(
    inputTokens: number,
    outputTokens: number,
    provider: SupportedAiProvider,
  ): number {
    if (provider !== ANTHROPIC_PROVIDER) {
      return 0;
    }

    return (
      inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN
    );
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
    provider: SupportedAiProvider;
    model: string;
  }): void {
    this.logger.log(
      `[SstAgent] complete tenant=${fields.tenantId} user=${fields.userId} ` +
        `provider=${fields.provider} model=${fields.model} ` +
        `latency=${fields.latency}ms tokens=${fields.inputTokens}in/${fields.outputTokens}out ` +
        `cost=$${fields.estimatedCost.toFixed(6)} tools=[${fields.toolsUsed.join(',')}] ` +
        `confidence=${fields.confidence} needsReview=${fields.needsHumanReview} status=${fields.status}`,
    );
  }

  private buildStubResponse(question: string): SstAgentResponse {
    return {
      answer:
        `A SOPHIE usa OpenAI como motor oficial, mas a integração não está configurada neste ambiente. ` +
        `Pergunta registrada: "${question.slice(0, 100)}${question.length > 100 ? '...' : ''}".`,
      confidence: ConfidenceLevel.LOW,
      needsHumanReview: false,
      sources: [],
      suggestedActions: [
        { label: 'Ver Dashboard', href: '/dashboard', priority: 'low' },
      ],
      warnings: [
        'Configure OPENAI_API_KEY para habilitar a SOPHIE com OpenAI.',
      ],
      toolsUsed: [],
    };
  }

  private buildProviderFallbackResponse(question: string): SstAgentResponse {
    const truncatedQuestion =
      question.length > 120 ? `${question.slice(0, 120)}...` : question;

    return {
      answer:
        `Estou com instabilidade momentanea na integração da OpenAI, mas registrei sua solicitacao: ` +
        `"${truncatedQuestion}". Tente novamente em instantes.`,
      confidence: ConfidenceLevel.LOW,
      needsHumanReview: false,
      sources: [],
      suggestedActions: [
        { label: 'Ver Dashboard', href: '/dashboard', priority: 'low' },
      ],
      warnings: [
        'A SOPHIE entrou em modo degradado porque a OpenAI nao respondeu corretamente.',
      ],
      toolsUsed: [],
    };
  }

  private buildStubImageAnalysis(): ImageRiskAnalysis {
    return {
      summary:
        'Analise de imagem indisponivel porque a integração OpenAI não está configurada.',
      riskLevel: 'Médio',
      imminentRisks: [],
      immediateActions: [
        'Configure OPENAI_API_KEY para habilitar a analise de imagem da SOPHIE.',
      ],
      ppeRecommendations: [],
      notes:
        'A SOPHIE usa OpenAI como motor oficial para análise de fotos neste ambiente.',
    };
  }

  private buildProviderFallbackImageAnalysis(): ImageRiskAnalysis {
    return {
      summary:
        'A SOPHIE nao conseguiu concluir a analise automatica da imagem neste momento.',
      riskLevel: 'Médio',
      imminentRisks: [],
      immediateActions: [
        'Revisar a imagem manualmente e repetir a analise em instantes.',
      ],
      ppeRecommendations: [],
      notes:
        'A OpenAI apresentou instabilidade temporaria. Nenhum risco automatico foi validado.',
    };
  }

  private getPositiveIntConfig(key: string, fallback: number): number {
    const rawValue = this.configService.get<string | number>(key);
    const parsed =
      typeof rawValue === 'number'
        ? rawValue
        : Number.parseInt(String(rawValue ?? ''), 10);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private clampPositiveInt(
    value: number | undefined,
    upperBound: number,
    fallback: number,
  ): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(Math.max(Math.trunc(value!), 1), upperBound);
  }
}
