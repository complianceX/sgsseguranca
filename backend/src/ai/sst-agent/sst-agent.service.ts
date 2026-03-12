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
import { MoreThanOrEqual, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

import { TenantService } from '../../common/tenant/tenant.service';
import { AiInteraction } from '../entities/ai-interaction.entity';
import { SOPHIE_IMAGE_ANALYSIS_PROMPT, SOPHIE_SYSTEM_PROMPT } from '../sophie.prompts';
import { SophieLocalChatService } from '../../sophie/sophie.local-chat.service';
import {
  GEMINI_TOOL_DECLARATIONS,
  OPENAI_TOOL_DEFINITIONS,
  SstToolsExecutor,
  SST_TOOL_DEFINITIONS,
} from './sst-agent.tools';
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
const GEMINI_PROVIDER = 'gemini';
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
const OPENAI_PROVIDER = 'openai';
const LOCAL_PROVIDER = 'local';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENAI_VISION_MODEL = 'gpt-4.1-mini';
const MAX_TOKENS = 2048;
const MAX_TOOL_ITERATIONS = 5;
const DEFAULT_AI_HISTORY_DAYS = 30;
const DEFAULT_AI_HISTORY_MAX_DAYS = 90;
const DEFAULT_AI_HISTORY_MAX_LIMIT = 100;

/** Custo estimado por token — atualizar conforme pricing da Anthropic */
const COST_PER_INPUT_TOKEN = 3 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

type SupportedAiProvider =
  | typeof OPENAI_PROVIDER
  | typeof ANTHROPIC_PROVIDER
  | typeof GEMINI_PROVIDER
  | typeof LOCAL_PROVIDER
  | 'stub';

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  promptFeedback?: {
    blockReason?: string;
  };
};

type GeminiFunctionCall = {
  name: string;
  args?: Record<string, unknown>;
};

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: GeminiFunctionCall;
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
  thoughtSignature?: string;
};

type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

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
  private readonly geminiApiKey: string | null;
  private readonly openaiApiKey: string | null;
  private readonly openaiModel: string;
  private readonly openaiVisionModel: string;
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
  ) {
    const preferredProvider = this.configService
      .get<string>('AI_PROVIDER')
      ?.trim()
      .toLowerCase();
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim() || null;
    const anthropicApiKey = this.configService.get<string>('ANTHROPIC_API_KEY')?.trim();
    const geminiApiKey =
      this.configService.get<string>('GEMINI_API_KEY')?.trim() ||
      this.configService.get<string>('GOOGLE_API_KEY')?.trim() ||
      null;
    const anthropicModel =
      this.configService.get<string>('ANTHROPIC_MODEL')?.trim() ||
      DEFAULT_ANTHROPIC_MODEL;
    const geminiModel =
      this.configService.get<string>('GEMINI_MODEL')?.trim() || DEFAULT_GEMINI_MODEL;
    const openaiModel =
      this.configService.get<string>('OPENAI_MODEL')?.trim() || DEFAULT_OPENAI_MODEL;
    const openaiVisionModel =
      this.configService.get<string>('OPENAI_VISION_MODEL')?.trim() ||
      openaiModel ||
      DEFAULT_OPENAI_VISION_MODEL;

    this.geminiApiKey = null;
    this.openaiApiKey = openaiApiKey;
    this.openaiModel = openaiModel;
    this.openaiVisionModel = openaiVisionModel;
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

    if (preferredProvider === LOCAL_PROVIDER) {
      this.anthropic = null;
      this.geminiApiKey = null;
      this.provider = LOCAL_PROVIDER;
      this.model = 'sophie-local';
      this.logger.log('SstAgentService iniciado com SOPHIE local (base interna)');
      return;
    }

    if ((preferredProvider === OPENAI_PROVIDER || !preferredProvider) && openaiApiKey) {
      this.anthropic = null;
      this.provider = OPENAI_PROVIDER;
      this.model = openaiModel;
      this.logger.log(`SstAgentService iniciado com OpenAI API (${this.model})`);
      return;
    }

    if ((preferredProvider === ANTHROPIC_PROVIDER || !preferredProvider) && anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
      this.provider = ANTHROPIC_PROVIDER;
      this.model = anthropicModel;
      this.logger.log('SstAgentService iniciado com Anthropic API');
      return;
    }

    if ((preferredProvider === GEMINI_PROVIDER || !preferredProvider) && geminiApiKey) {
      this.anthropic = null;
      this.geminiApiKey = geminiApiKey;
      this.provider = GEMINI_PROVIDER;
      this.model = geminiModel;
      this.logger.log(`SstAgentService iniciado com Gemini API (${this.model})`);
      return;
    }

    if (openaiApiKey) {
      this.anthropic = null;
      this.provider = OPENAI_PROVIDER;
      this.model = openaiModel;
      this.logger.log(`SstAgentService iniciado com OpenAI API (${this.model})`);
      return;
    }

    if (anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
      this.provider = ANTHROPIC_PROVIDER;
      this.model = anthropicModel;
      this.logger.log('SstAgentService iniciado com Anthropic API');
      return;
    }

    if (geminiApiKey) {
      this.anthropic = null;
      this.geminiApiKey = geminiApiKey;
      this.provider = GEMINI_PROVIDER;
      this.model = geminiModel;
      this.logger.log(`SstAgentService iniciado com Gemini API (${this.model})`);
      return;
    }

    this.anthropic = null;
    if (preferredProvider === 'stub') {
      this.logger.warn(
        'Nenhum provider de IA configurado (OPENAI_API_KEY, ANTHROPIC_API_KEY ou GEMINI_API_KEY) - SstAgentService em modo STUB',
      );
      return;
    }

    this.provider = LOCAL_PROVIDER;
    this.model = 'sophie-local';
    this.logger.log('Nenhum provider externo configurado - usando SOPHIE local (base interna)');
  }

  getRuntimeStatus() {
    return {
      provider: this.provider,
      model: this.model,
      openaiModel: this.openaiModel,
      openaiVisionModel: this.openaiVisionModel,
      historyDefaultDays: this.historyDefaultDays,
      historyMaxDays: this.historyMaxDays,
      historyMaxLimit: this.historyMaxLimit,
      imageAnalysisEnabled:
        this.provider === OPENAI_PROVIDER ||
        this.provider === ANTHROPIC_PROVIDER ||
        this.provider === GEMINI_PROVIDER,
      externalProviderEnabled:
        this.provider === OPENAI_PROVIDER ||
        this.provider === ANTHROPIC_PROVIDER ||
        this.provider === GEMINI_PROVIDER,
      localFallbackEnabled: true,
    };
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
      model: this.model,
      provider: this.provider,
      status: AiInteractionStatus.SUCCESS,
    });

    if (this.provider === LOCAL_PROVIDER) {
      const localResp = this.sophieLocalChatService.chat(question);
      interaction.response = localResp;
      interaction.latency_ms = Date.now() - startTime;
      interaction.confidence = localResp.confidence;
      interaction.needs_human_review = localResp.needsHumanReview;
      interaction.tools_called = localResp.toolsUsed;
      try {
        await this.interactionRepo.save(interaction);
      } catch (saveErr) {
        this.logger.warn(
          `[SstAgent] Falha ao persistir interação local (non-fatal): ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
        );
      }
      return this.toSstChatResponse(localResp, interaction.id, AiInteractionStatus.SUCCESS);
    }

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
      return this.toSstChatResponse(stubResp, interaction.id, AiInteractionStatus.SUCCESS);
    }

    try {
      const { result, inputTokens, outputTokens, toolsUsed } =
        this.provider === OPENAI_PROVIDER
          ? await this.runOpenAiAgentLoop(question, history)
          : this.provider === ANTHROPIC_PROVIDER
            ? await this.runAnthropicAgentLoop(question, history)
            : await this.runGeminiAgentLoop(question, history);

      const latency = Date.now() - startTime;
      const estimatedCost = this.estimateCost(inputTokens, outputTokens, this.provider);
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
        needsHumanReview: result.needsHumanReview, status: finalStatus, provider: this.provider, model: this.model,
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
      select: ['id', 'question', 'status', 'confidence', 'needs_human_review', 'latency_ms', 'tokens_used', 'created_at'],
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
      throw new UnauthorizedException('Tenant nao identificado. Verifique autenticacao.');
    }

    if (this.provider === LOCAL_PROVIDER) {
      // Sem modelo de visão local: orientar o usuário a descrever o cenário.
      return {
        summary:
          'Análise de imagem indisponível no modo SOPHIE local. Descreva a atividade e o ambiente para eu analisar perigos e riscos.',
        riskLevel: 'Médio',
        imminentRisks: [],
        immediateActions: [
          'Descreva atividade, setor, máquinas e condições do ambiente',
          'Informe se há trabalho em altura, eletricidade, espaço confinado ou químicos',
        ],
        ppeRecommendations: [],
        notes: 'Para análise local, use o chat informando os campos: atividade/setor/máquina/ambiente.',
      };
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
      throw new HttpException('Formato de imagem nao suportado.', HttpStatus.BAD_REQUEST);
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
        this.provider === OPENAI_PROVIDER
          ? await this.analyzeImageWithOpenAi(imageBuffer, mimeType, context)
          : this.provider === ANTHROPIC_PROVIDER
            ? await this.analyzeImageWithAnthropic(imageBuffer, mimeType, context)
            : await this.analyzeImageWithGemini(imageBuffer, mimeType, context);

      const latency = Date.now() - startTime;
      interaction.response = analysis;
      interaction.latency_ms = latency;
      interaction.token_usage_input = inputTokens;
      interaction.token_usage_output = outputTokens;
      interaction.tokens_used = inputTokens + outputTokens;
      interaction.estimated_cost_usd = this.estimateCost(inputTokens, outputTokens, this.provider);
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
      { role: 'system', content: SST_SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: question },
    ];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: this.openaiModel,
          temperature: 0.2,
          max_tokens: MAX_TOKENS,
          messages,
          tools: OPENAI_TOOL_DEFINITIONS,
          tool_choice: 'auto',
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${body}`);
      }

      const payload = (await response.json()) as OpenAiChatCompletion;
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
              ? { success: true, data: toolResult.data ?? null, is_stub: toolResult.is_stub ?? false }
              : { success: false, error: toolResult.error ?? 'Erro desconhecido ao executar ferramenta.' },
          ),
        });
      }
    }

    this.logger.warn(`[SstAgent] OpenAI atingiu o limite de ${MAX_TOOL_ITERATIONS} iteracoes`);
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
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.openaiVisionModel,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: SST_IMAGE_ANALYSIS_PROMPT },
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

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI vision error ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as OpenAiVisionResponse;
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

  private async runGeminiAgentLoop(
    question: string,
    history: ConversationMessage[],
  ): Promise<{
    result: SstAgentResponse;
    inputTokens: number;
    outputTokens: number;
    toolsUsed: string[];
  }> {
    if (!this.geminiApiKey) {
      throw new Error('GEMINI_API_KEY nao configurada.');
    }

    const toolsUsed: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const historyContents: GeminiContent[] = history.map((message) => ({
      role: (message.role === 'assistant' ? 'model' : 'user') as GeminiContent['role'],
      parts: [{ text: message.content }],
    }));
    const contents: GeminiContent[] = [
      ...historyContents,
      {
        role: 'user' as const,
        parts: [{ text: question }],
      },
    ];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: 'POST',
          // Credencial via header — nunca expor em query string (logs, proxies, traces)
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.geminiApiKey },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: SST_SYSTEM_PROMPT }],
            },
            contents,
            tools: [
              {
                functionDeclarations: GEMINI_TOOL_DECLARATIONS,
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: MAX_TOKENS,
            },
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${body}`);
      }

      const payload = (await response.json()) as GeminiGenerateContentResponse;
      if (payload.promptFeedback?.blockReason) {
        throw new Error(`Gemini bloqueou a resposta: ${payload.promptFeedback.blockReason}`);
      }

      totalInputTokens += payload.usageMetadata?.promptTokenCount ?? 0;
      totalOutputTokens += payload.usageMetadata?.candidatesTokenCount ?? 0;

      const candidate = payload.candidates?.[0];
      const modelContent = candidate?.content;
      if (!modelContent?.parts?.length) {
        throw new Error('Gemini nao retornou conteudo utilizavel.');
      }

      const functionCalls = modelContent.parts
        .map((part) => part.functionCall)
        .filter((value): value is GeminiFunctionCall => Boolean(value?.name));
      const text = modelContent.parts
        .map((part) => part.text?.trim())
        .filter((value): value is string => Boolean(value))
        .join('\n')
        .trim();

      if (functionCalls.length === 0) {
        if (!text) {
          throw new Error('Gemini nao retornou texto utilizavel.');
        }

        return {
          result: this.buildStructuredResponse(text, question, toolsUsed),
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          toolsUsed,
        };
      }

      contents.push({
        role: 'model',
        parts: modelContent.parts,
      });

      const functionResponses: GeminiPart[] = [];
      for (const functionCall of functionCalls) {
        if (!toolsUsed.includes(functionCall.name)) {
          toolsUsed.push(functionCall.name);
        }

        const toolResult = await this.toolsExecutor.execute(
          functionCall.name,
          functionCall.args ?? {},
        );

        functionResponses.push({
          functionResponse: {
            name: functionCall.name,
            response: toolResult.success
              ? {
                  success: true,
                  data: toolResult.data ?? null,
                  is_stub: toolResult.is_stub ?? false,
                }
              : {
                  success: false,
                  error: toolResult.error ?? 'Erro desconhecido ao executar ferramenta.',
                },
          },
        });
      }

      contents.push({
        role: 'user',
        parts: functionResponses,
      });
    }

    this.logger.warn(`[SstAgent] Gemini atingiu o limite de ${MAX_TOOL_ITERATIONS} iteracoes`);
    const fallbackAnswer =
      'Nao consegui completar a analise com os dados disponiveis. Reformule a pergunta ou acesse os modulos diretamente para confirmar as informacoes.';

    return {
      result: this.buildStructuredResponse(fallbackAnswer, question, toolsUsed),
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      toolsUsed,
    };
  }

  private async analyzeImageWithGemini(
    imageBuffer: Buffer,
    mimeType: string,
    context?: string,
  ): Promise<{
    analysis: ImageRiskAnalysis;
    inputTokens: number;
    outputTokens: number;
  }> {
    if (!this.geminiApiKey) {
      throw new Error('GEMINI_API_KEY nao configurada.');
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      {
        method: 'POST',
        // Credencial via header — nunca expor em query string (logs, proxies, traces)
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.geminiApiKey },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SST_IMAGE_ANALYSIS_PROMPT }],
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: imageBuffer.toString('base64'),
                  },
                },
                {
                  text: context?.trim()
                    ? `Contexto adicional do usuario: ${context.trim()}`
                    : 'Sem contexto adicional fornecido.',
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: MAX_TOKENS,
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const answer = payload.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text?.trim())
      .filter((value): value is string => Boolean(value))
      .join('\n')
      .trim();

    if (!answer) {
      throw new Error('Gemini nao retornou analise de imagem.');
    }

    return {
      analysis: this.parseImageRiskAnalysis(answer),
      inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
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
        ppeRecommendations: this.normalizeStringArray(parsed.ppeRecommendations),
        notes: parsed.notes?.trim() || 'Sem observacoes adicionais.',
      };
    } catch {
      return {
        summary: candidate.slice(0, 280) || 'Nao foi possivel estruturar a analise automaticamente.',
        riskLevel: 'Médio',
        imminentRisks: [],
        immediateActions: ['Revisar manualmente a imagem e confirmar os riscos em campo.'],
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
        `Agente SST em modo demonstracao (nenhum provider configurado). ` +
        `Pergunta registrada: "${question.slice(0, 100)}${question.length > 100 ? '...' : ''}".`,
      confidence: ConfidenceLevel.LOW,
      needsHumanReview: false,
      sources: [],
      suggestedActions: [{ label: 'Ver Dashboard', href: '/dashboard', priority: 'low' }],
      warnings: [
        'Configure OPENAI_API_KEY (recomendado) ou ANTHROPIC_API_KEY/GEMINI_API_KEY para habilitar a SOPHIE.',
      ],
      toolsUsed: [],
    };
  }

  private buildProviderFallbackResponse(question: string): SstAgentResponse {
    const truncatedQuestion =
      question.length > 120 ? `${question.slice(0, 120)}...` : question;

    return {
      answer:
        `Estou com instabilidade momentanea no provedor de IA, mas registrei sua solicitacao: ` +
        `"${truncatedQuestion}". Tente novamente em instantes.`,
      confidence: ConfidenceLevel.LOW,
      needsHumanReview: false,
      sources: [],
      suggestedActions: [{ label: 'Ver Dashboard', href: '/dashboard', priority: 'low' }],
      warnings: [
        'A SOPHIE entrou em modo degradado porque o provedor de IA nao respondeu corretamente.',
      ],
      toolsUsed: [],
    };
  }

  private buildStubImageAnalysis(): ImageRiskAnalysis {
    return {
      summary: 'Analise de imagem indisponivel no modo stub.',
      riskLevel: 'Médio',
      imminentRisks: [],
      immediateActions: ['Configure um provider de IA para habilitar a analise de imagem.'],
      ppeRecommendations: [],
      notes: 'Configure OPENAI_API_KEY (recomendado) ou ANTHROPIC_API_KEY/GEMINI_API_KEY para usar a analise de fotos.',
    };
  }

  private buildProviderFallbackImageAnalysis(): ImageRiskAnalysis {
    return {
      summary: 'A SOPHIE nao conseguiu concluir a analise automatica da imagem neste momento.',
      riskLevel: 'Médio',
      imminentRisks: [],
      immediateActions: [
        'Revisar a imagem manualmente e repetir a analise em instantes.',
      ],
      ppeRecommendations: [],
      notes:
        'O provedor de IA apresentou instabilidade temporaria. Nenhum risco automatico foi validado.',
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
