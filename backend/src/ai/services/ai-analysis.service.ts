import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AprsService } from '../../aprs/aprs.service';
import { PtsService } from '../../pts/pts.service';
import { DocumentStorageService } from '../../common/services/document-storage.service';
import { IntegrationResilienceService } from '../../common/resilience/integration-resilience.service';
import { OpenAiCircuitBreakerService } from '../../common/resilience/openai-circuit-breaker.service';
import { requestOpenAiChatCompletionResponse } from '../openai-request.util';
import { getSophieSystemPrompt } from '../sophie.prompt-resolver';
import { SOPHIE_JSON_RUNTIME_INSTRUCTION } from '../sophie-task-prompts';
import {
  AiAnalysisResult,
  AnalyzeAprResponse,
  AnalyzePtResponse,
  SophieConfidence,
  SophieImageAnalysisJsonResponse,
  SophiePtJsonResponse,
  SophieTask,
} from '../sophie.types';
import { MetricsService } from '../../common/observability/metrics.service';

const DEFAULT_OPENAI_MODEL = 'gpt-4o-2024-11-20';
const DEFAULT_OPENAI_REASONING_EFFORT = 'medium';
const OPENAI_MODEL_RECOVERY_CANDIDATES = ['gpt-4o-2024-11-20'] as const;
const MAX_JSON_TOKENS = 1600;

type AnalyzePtInput = {
  titulo: string;
  descricao: string;
  trabalho_altura?: boolean;
  espaco_confinado?: boolean;
  trabalho_quente?: boolean;
  eletricidade?: boolean;
};

@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);
  private readonly openaiApiKey: string | null;
  private readonly openaiModel: string;
  private readonly openaiFallbackModel: string | null;
  private readonly openaiReasoningEffort: 'minimal' | 'low' | 'medium' | 'high';

  constructor(
    private readonly configService: ConfigService,
    private readonly integration: IntegrationResilienceService,
    private readonly openAiCircuitBreaker: OpenAiCircuitBreakerService,
    private readonly aprsService: AprsService,
    private readonly ptsService: PtsService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly metricsService: MetricsService,
  ) {
    this.openaiApiKey =
      this.configService.get<string>('OPENAI_API_KEY')?.trim() || null;
    this.openaiModel =
      this.configService.get<string>('OPENAI_MODEL')?.trim() ||
      DEFAULT_OPENAI_MODEL;
    const configuredFallbackModel =
      this.configService.get<string>('OPENAI_FALLBACK_MODEL')?.trim() || '';
    this.openaiFallbackModel = configuredFallbackModel || null;
    this.openaiReasoningEffort =
      (this.configService
        .get<string>('OPENAI_REASONING_EFFORT')
        ?.trim()
        .toLowerCase() as 'minimal' | 'low' | 'medium' | 'high' | undefined) ||
      DEFAULT_OPENAI_REASONING_EFFORT;
  }

  async analyzeApr(aprId: string, tenantId: string): Promise<AiAnalysisResult> {
    const apr = await this.aprsService.findOne(aprId);
    if (apr.company_id !== tenantId) {
      throw new NotFoundException(`APR com ID ${aprId} não encontrada`);
    }

    const description = String(
      apr.descricao || apr.titulo || apr.numero || '',
    ).trim();
    if (!description) {
      throw new BadRequestException(
        'A APR não possui conteúdo suficiente para análise.',
      );
    }

    return this.analyzeAprDescription(description, tenantId);
  }

  async analyzePt(ptId: string, tenantId: string): Promise<AiAnalysisResult> {
    const pt = await this.ptsService.findOne(ptId);
    if (pt.company_id !== tenantId) {
      throw new NotFoundException(`PT com ID ${ptId} não encontrada`);
    }

    return this.analyzePtPayload(
      {
        titulo: this.toSafeString(pt.titulo || pt.numero || `PT ${pt.id}`),
        descricao:
          this.toSafeString(pt.descricao) ||
          'Sem descrição detalhada da atividade.',
        trabalho_altura: Boolean(pt.trabalho_altura),
        espaco_confinado: Boolean(pt.espaco_confinado),
        trabalho_quente: Boolean(pt.trabalho_quente),
        eletricidade: Boolean(pt.eletricidade),
      },
      tenantId,
    );
  }

  async analyzeImage(
    buffer: Buffer,
    context: string | undefined,
    tenantId: string,
  ): Promise<AiAnalysisResult> {
    let imageBuffer = buffer;
    if (!imageBuffer || imageBuffer.length === 0) {
      const keyFromContext = this.extractStorageKeyFromContext(context);
      if (keyFromContext) {
        imageBuffer =
          await this.documentStorageService.downloadFileBuffer(keyFromContext);
      }
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new BadRequestException('Imagem inválida para análise.');
    }

    const startTime = Date.now();
    try {
      const contextText = String(context || '').trim();
      const prompt = this.buildAnalysisPrompt({
        task: 'image-analysis',
        sections: [
          contextText
            ? `Contexto operacional informado:\n${contextText}`
            : 'Analise a imagem e descreva os riscos de SST mais relevantes.',
          'Retorne um JSON objetivo com riscos iminentes, ações imediatas e recomendações de EPI.',
        ],
        additionalRules: [
          'não invente detalhes que não estejam visíveis na imagem',
          'não inclua dados clínicos nem suposições médicas',
          'imminentRisks e immediateActions devem ter no máximo 8 itens',
        ],
      });

      const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
      const { payload, model } =
        await this.requestOpenAiChatCompletion<OpenAiChatCompletion>({
          context: 'analysis:image',
          primaryModel: this.openaiModel,
          buildBody: (modelName) => ({
            model: modelName,
            temperature: 0.2,
            max_completion_tokens: 1000,
            reasoning_effort: this.openaiReasoningEffort,
            messages: [
              {
                role: 'developer',
                content: `${getSophieSystemPrompt('image-analysis')}\n\n${SOPHIE_JSON_RUNTIME_INSTRUCTION}`,
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              },
            ],
          }),
        });

      const text = (payload.choices?.[0]?.message?.content ?? '').trim();
      if (!text) {
        throw new BadGatewayException(
          'Serviço de IA retornou resposta inválida. Tente novamente.',
        );
      }

      const parsed = JSON.parse(
        this.extractJsonCandidate(text),
      ) as SophieImageAnalysisJsonResponse;
      const normalized: SophieImageAnalysisJsonResponse = {
        summary:
          String(parsed.summary || '').trim() ||
          'Análise de imagem indisponível.',
        riskLevel: this.normalizeRiskLevel(parsed.riskLevel),
        imminentRisks: this.normalizeStringArray(parsed.imminentRisks, 8) || [],
        immediateActions:
          this.normalizeStringArray(parsed.immediateActions, 8) || [],
        ppeRecommendations:
          this.normalizeStringArray(parsed.ppeRecommendations, 8) || [],
        confidence: this.normalizeConfidence(parsed.confidence),
        notes: this.normalizeStringArray(parsed.notes, 8),
      };

      this.recordAiMetrics({
        tenantId,
        model,
        tool: 'image-analysis',
        durationMs: Date.now() - startTime,
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
      });

      return normalized;
    } catch (error) {
      this.logger.warn(
        `[AiAnalysis] analyzeImage fallback aplicado | tenant=${tenantId} | reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return {
        summary:
          'SOPHIE indisponível no momento para análise de imagem. Use revisão técnica manual.',
        riskLevel: 'Médio',
        imminentRisks: [],
        immediateActions: [
          'Interromper atividade em condição insegura até validação técnica.',
        ],
        ppeRecommendations: ['Validar EPI obrigatório aplicável à atividade.'],
        confidence: 'low',
        notes: [
          'Fallback local aplicado por indisponibilidade temporária da API de IA.',
        ],
      };
    }
  }

  async analyzeAprDescription(
    description: string,
    tenantId: string,
  ): Promise<AnalyzeAprResponse> {
    const startTime = Date.now();
    try {
      const { data, model, inputTokens, outputTokens } =
        await this.callOpenAiJson<AnalyzeAprResponse>({
          task: 'apr',
          user: this.buildAnalysisPrompt({
            task: 'apr',
            sections: [`Descrição da atividade/APR:\n${description}`],
            additionalRules: [
              'máximo de 8 risks e 8 epis',
              'retorne IDs somente quando houver base concreta; caso contrário, use arrays vazios',
              'priorize riscos de acidentes, físicos e químicos mais prováveis pela descrição',
            ],
          }),
          maxTokens: 800,
          context: 'analysis:apr',
        });
      const response: AnalyzeAprResponse = {
        risks: Array.isArray(data.risks)
          ? data.risks.slice(0, 8).filter(Boolean)
          : [],
        epis: Array.isArray(data.epis)
          ? data.epis.slice(0, 8).filter(Boolean)
          : [],
        explanation:
          String(data.explanation || '').trim() ||
          'Sugestão gerada pela SOPHIE.',
        confidence: this.normalizeConfidence(data.confidence),
        notes: this.normalizeStringArray(data.notes, 8),
      };

      this.recordAiMetrics({
        tenantId,
        model,
        tool: 'apr',
        durationMs: Date.now() - startTime,
        inputTokens,
        outputTokens,
      });

      return response;
    } catch (error) {
      this.logger.warn(
        `[AiAnalysis] analyzeApr fallback aplicado | tenant=${tenantId} | reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        risks: [],
        epis: [],
        explanation:
          'SOPHIE indisponível no momento para sugerir riscos e EPIs.',
        confidence: 'low',
        notes: [
          'Fallback local aplicado por indisponibilidade temporária da API de IA.',
        ],
      };
    }
  }

  async analyzePtPayload(
    data: AnalyzePtInput,
    tenantId: string,
  ): Promise<AnalyzePtResponse> {
    const startTime = Date.now();
    const flags = {
      trabalho_altura: Boolean(data.trabalho_altura),
      espaco_confinado: Boolean(data.espaco_confinado),
      trabalho_quente: Boolean(data.trabalho_quente),
      eletricidade: Boolean(data.eletricidade),
    };

    try {
      const {
        data: response,
        model,
        inputTokens,
        outputTokens,
      } = await this.callOpenAiJson<SophiePtJsonResponse>({
        task: 'pt',
        user: this.buildAnalysisPrompt({
          task: 'pt',
          sections: [
            'Analise esta Permissão de Trabalho (PT).',
            `Título: ${data.titulo}\nDescrição: ${data.descricao}\nSinais/flags: ${JSON.stringify(flags)}`,
          ],
          additionalRules: [
            'suggestions deve ter de 4 a 10 itens curtos',
            'priorize hierarquia de controle',
            'cite NRs relevantes apenas quando houver aderência clara, como NR-10, NR-12, NR-20, NR-33, NR-35, NR-06 e NR-01',
          ],
        }),
        maxTokens: 900,
        context: 'analysis:pt',
      });
      const normalizedRiskLevel = this.normalizeRiskLevel(response.riskLevel);
      const normalized: AnalyzePtResponse = {
        summary:
          String(response.summary || '').trim() || 'Resumo indisponível.',
        riskLevel: normalizedRiskLevel,
        suggestions: Array.isArray(response.suggestions)
          ? response.suggestions
              .map((suggestion) => String(suggestion).trim())
              .filter(Boolean)
              .slice(0, 12)
          : [],
        confidence: this.normalizeConfidence(response.confidence),
        notes: this.normalizeStringArray(response.notes, 8),
        automation: this.buildPtAutomationDecision(normalizedRiskLevel, flags),
      };

      this.recordAiMetrics({
        tenantId,
        model,
        tool: 'pt',
        durationMs: Date.now() - startTime,
        inputTokens,
        outputTokens,
      });

      return normalized;
    } catch (error) {
      this.logger.warn(
        `[AiAnalysis] analyzePt fallback aplicado | tenant=${tenantId} | reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        summary: 'SOPHIE indisponível no momento para analisar esta PT.',
        riskLevel: 'Médio',
        suggestions: [
          'Revisar escopo da atividade e perigos principais.',
          'Garantir controles de engenharia e procedimentos antes de EPI.',
          'Validar requisitos NR aplicáveis (NR-01/06/10/12/33/35).',
        ],
        confidence: 'low',
        notes: [
          'Fallback local aplicado por indisponibilidade temporária da API de IA.',
        ],
        automation: this.buildPtAutomationDecision('Médio', flags),
      };
    }
  }

  private extractStorageKeyFromContext(context?: string): string | null {
    const text = this.toSafeString(context);
    if (!text) {
      return null;
    }

    try {
      const parsed = JSON.parse(text) as {
        storageKey?: unknown;
        key?: unknown;
      };
      const storageKey = this.toSafeString(parsed.storageKey || parsed.key);
      return storageKey || null;
    } catch {
      const match = text.match(/(documents\/[a-zA-Z0-9_-]+\/[^\s"'`]+)/i);
      return match?.[1] || null;
    }
  }

  /**
   * TODO: Fase 3 — unificar buildAnalysisPrompt com a camada compartilhada
   * de prompts da Sophie para evitar duplicação entre análise e chat.
   */
  private buildAnalysisPrompt(params: {
    task: SophieTask;
    sections: Array<string | undefined | null>;
    additionalRules?: Array<string | undefined | null>;
  }): string {
    const sections = params.sections
      .map((section) => String(section || '').trim())
      .filter(Boolean);
    const rules = (params.additionalRules || [])
      .map((rule) => String(rule || '').trim())
      .filter(Boolean)
      .map((rule) => `- ${rule}`)
      .join('\n');

    return [
      ...sections,
      rules ? `Regras adicionais desta chamada:\n${rules}` : null,
      `Use estritamente o contrato JSON governado da task "${params.task}". Não adicione campos extras e não repita o schema em texto.`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private extractJsonCandidate(raw: string): string {
    const normalized = String(raw || '').trim();
    const jsonMatch =
      normalized.match(/```json\s*([\s\S]*?)```/i) ||
      normalized.match(/```([\s\S]*?)```/i);
    return (jsonMatch?.[1] ?? normalized).trim();
  }

  private normalizeConfidence(value: unknown): SophieConfidence | undefined {
    const normalized = this.toSafeString(value).toLowerCase();
    if (
      normalized === 'low' ||
      normalized === 'medium' ||
      normalized === 'high'
    ) {
      return normalized;
    }
    return undefined;
  }

  private normalizeStringArray(
    value: unknown,
    maxItems = 10,
  ): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const result = value
      .map((item) => this.toSafeString(item))
      .filter(Boolean)
      .slice(0, Math.max(1, maxItems));
    return result.length ? result : undefined;
  }

  private normalizeRiskLevel(
    value: unknown,
  ): 'Baixo' | 'Médio' | 'Alto' | 'Crítico' {
    const normalized = this.toSafeString(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (normalized.includes('crit')) return 'Crítico';
    if (normalized.includes('alto')) return 'Alto';
    if (normalized.includes('medio') || normalized.includes('moder'))
      return 'Médio';
    return 'Baixo';
  }

  private buildPtAutomationDecision(
    riskLevel: AnalyzePtResponse['riskLevel'],
    flags: {
      trabalho_altura?: boolean;
      espaco_confinado?: boolean;
      trabalho_quente?: boolean;
      eletricidade?: boolean;
    },
  ): AnalyzePtResponse['automation'] {
    const criticalFlag = Boolean(
      flags.trabalho_altura ||
      flags.espaco_confinado ||
      flags.trabalho_quente ||
      flags.eletricidade,
    );

    if (riskLevel === 'Crítico') {
      return {
        phase: 'phase2',
        riskBand: 'critical',
        requiresHumanApproval: true,
        recommendedFlow: 'review_required',
        reasons: [
          'Risco crítico identificado. Liberação automática bloqueada.',
        ],
      };
    }

    if (riskLevel === 'Alto' || criticalFlag) {
      return {
        phase: 'phase2',
        riskBand: 'high',
        requiresHumanApproval: true,
        recommendedFlow: 'review_required',
        reasons: [
          criticalFlag
            ? 'Atividade crítica (altura/espaço confinado/quente/eletricidade) exige validação humana.'
            : 'Risco alto exige validação humana antes da liberação.',
        ],
      };
    }

    if (riskLevel === 'Médio') {
      return {
        phase: 'phase2',
        riskBand: 'moderate',
        requiresHumanApproval: false,
        recommendedFlow: 'auto',
        reasons: ['Risco moderado permite fluxo assistido com monitoramento.'],
      };
    }

    return {
      phase: 'phase2',
      riskBand: 'low',
      requiresHumanApproval: false,
      recommendedFlow: 'auto',
      reasons: ['Risco baixo apto para fluxo assistido automático.'],
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
        [
          primaryModel,
          this.openaiFallbackModel,
          ...OPENAI_MODEL_RECOVERY_CANDIDATES,
        ]
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
    model: string;
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

    if (params.status === 404) {
      return true;
    }

    if (params.status === 403) {
      return (
        normalizedMessage.includes('model') || normalizedCode.includes('model')
      );
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

  private toSafeString(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }

    return '';
  }

  private async requestOpenAiChatCompletion<T>(params: {
    context: string;
    primaryModel: string;
    buildBody: (model: string) => Record<string, unknown>;
  }): Promise<{ payload: T; model: string }> {
    if (!this.openaiApiKey) {
      throw new ServiceUnavailableException(
        'Serviço de IA temporariamente indisponível.',
      );
    }

    const candidates = this.getOpenAiModelCandidates(params.primaryModel);

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
        circuitBreaker: this.openAiCircuitBreaker,
      });

      if (response.ok) {
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

      this.logger.error(formattedError);

      if (
        this.shouldRetryWithFallback({
          status: response.status,
          model,
          candidateIndex: index,
          candidates,
          errorMessage: parsedError.message,
          errorCode: parsedError.code,
        })
      ) {
        const nextModel = candidates[index + 1];
        this.logger.warn(
          `[AiAnalysis] Tentando fallback OpenAI | context=${params.context} | from=${model} | to=${nextModel}`,
        );
        continue;
      }

      throw new BadGatewayException(
        'Serviço de IA retornou resposta inválida. Tente novamente.',
      );
    }

    throw new BadGatewayException(
      'Serviço de IA retornou resposta inválida. Tente novamente.',
    );
  }

  private async callOpenAiJson<T>(params: {
    task: SophieTask;
    user: string;
    context: string;
    maxTokens?: number;
  }): Promise<{
    data: T;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }> {
    const { payload, model } =
      await this.requestOpenAiChatCompletion<OpenAiChatCompletion>({
        context: params.context,
        primaryModel: this.openaiModel,
        buildBody: (modelName) => ({
          model: modelName,
          temperature: 0.2,
          max_completion_tokens: params.maxTokens ?? MAX_JSON_TOKENS,
          reasoning_effort: this.openaiReasoningEffort,
          messages: [
            {
              role: 'developer',
              content: `${getSophieSystemPrompt(params.task)}\n\n${SOPHIE_JSON_RUNTIME_INSTRUCTION}`,
            },
            { role: 'user', content: params.user },
          ],
        }),
      });
    const text = (payload.choices?.[0]?.message?.content ?? '').trim();
    if (!text) {
      throw new BadGatewayException(
        'Serviço de IA retornou resposta inválida. Tente novamente.',
      );
    }

    return {
      data: JSON.parse(this.extractJsonCandidate(text)) as T,
      model,
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
    };
  }

  private recordAiMetrics(params: {
    tenantId: string;
    model: string;
    tool: string;
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
  }) {
    this.metricsService.incrementAiInteraction(params.tenantId, params.tool);
    this.metricsService.recordAiResponseTime(
      params.model,
      params.tool,
      params.durationMs / 1000,
    );
    this.metricsService.addAiTokensUsed(
      params.tenantId,
      params.model,
      params.inputTokens + params.outputTokens,
    );
  }
}

type OpenAiChatCompletion = {
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
