import {
  Injectable,
  Logger,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Scope,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { TenantService } from '../common/tenant/tenant.service';
import { AiInteraction } from './entities/ai-interaction.entity';
import { SstRateLimitService } from './sst-agent/sst-rate-limit.service';
import { AiInteractionStatus, ConfidenceLevel } from './sst-agent/sst-agent.types';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { RisksService } from '../risks/risks.service';
import { EpisService } from '../epis/epis.service';
import { ChecklistsService } from '../checklists/checklists.service';
import { TrainingsService } from '../trainings/trainings.service';
import { MedicalExamsService } from '../medical-exams/medical-exams.service';
import { NonConformitiesService } from '../nonconformities/nonconformities.service';
import { DdsService } from '../dds/dds.service';
import { getSophieSystemPrompt } from './sophie.prompt-resolver';
import {
  AnalyzeAprResponse,
  AnalyzeChecklistResponse,
  AnalyzePtResponse,
  CreateChecklistAutomationResponse,
  CreateDdsAutomationResponse,
  CreateNonConformityAutomationResponse,
  GenerateChecklistResponse,
  GenerateDdsResponse,
  InsightCard,
  InsightsResponse,
  QueueMonthlyReportAutomationResponse,
  SophieConfidence,
  SophieTask,
} from './sophie.types';
import type { CreateNonConformityDto } from '../nonconformities/dto/create-nonconformity.dto';
import type { CreateChecklistDto } from '../checklists/dto/create-checklist.dto';
import type { CreateDdsDto } from '../dds/dto/create-dds.dto';
import type { GenerateChecklistDto } from './dto/generate-checklist.dto';
import type { CreateAssistedChecklistDto } from './dto/create-assisted-checklist.dto';
import type { CreateAssistedNonConformityDto } from './dto/create-assisted-nonconformity.dto';
import type {
  CreateAssistedDdsDto,
  GenerateDdsDto,
} from './dto/generate-dds.dto';
import type { GenerateSophieReportDto } from './dto/generate-sophie-report.dto';
import { defaultJobOptions } from '../queue/default-job-options';

const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
const DEFAULT_OPENAI_FALLBACK_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENAI_REASONING_EFFORT = 'medium';
const MAX_JSON_TOKENS = 1600;
const PHASE2_DEFAULT_NC_THRESHOLD = 3;

@Injectable({ scope: Scope.REQUEST })
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openaiApiKey: string | null;
  private readonly openaiModel: string;
  private readonly openaiFallbackModel: string | null;
  private readonly openaiReasoningEffort: 'minimal' | 'low' | 'medium' | 'high';

  constructor(
    @InjectRepository(AiInteraction)
    private readonly interactionRepo: Repository<AiInteraction>,
    private readonly configService: ConfigService,
    private readonly tenantService: TenantService,
    private readonly rateLimitService: SstRateLimitService,
    private readonly risksService: RisksService,
    private readonly episService: EpisService,
    private readonly checklistsService: ChecklistsService,
    private readonly trainingsService: TrainingsService,
    private readonly medicalExamsService: MedicalExamsService,
    private readonly nonConformitiesService: NonConformitiesService,
    private readonly ddsService: DdsService,
    @InjectQueue('pdf-generation')
    private readonly pdfQueue: Queue,
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim() || null;
    this.openaiModel =
      this.configService.get<string>('OPENAI_MODEL')?.trim() || DEFAULT_OPENAI_MODEL;
    const configuredFallbackModel =
      this.configService.get<string>('OPENAI_FALLBACK_MODEL')?.trim() || '';
    this.openaiFallbackModel =
      configuredFallbackModel ||
      (this.openaiModel !== DEFAULT_OPENAI_FALLBACK_MODEL
        ? DEFAULT_OPENAI_FALLBACK_MODEL
        : null);
    this.openaiReasoningEffort =
      (this.configService.get<string>('OPENAI_REASONING_EFFORT')?.trim().toLowerCase() as
        | 'minimal'
        | 'low'
        | 'medium'
        | 'high'
        | undefined) || DEFAULT_OPENAI_REASONING_EFFORT;

    this.logger.log(
      `✅ SOPHIE AiService initialized (provider=openai model=${this.openaiModel} fallback=${this.openaiFallbackModel || 'none'} reasoning=${this.openaiReasoningEffort})`,
    );
  }

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException('Tenant nao identificado. Verifique autenticacao.');
    }
    return tenantId;
  }

  private getCurrentUserId(): string {
    return RequestContext.getUserId() || 'unknown';
  }

  private getTodayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async enforceRateLimit(tenantId: string): Promise<void> {
    const rlCheck = await this.rateLimitService.checkAndConsume(tenantId);
    if (!rlCheck.allowed) {
      this.logger.warn(
        `[SOPHIE] Rate limit | tenant=${tenantId} | retryAfter=${rlCheck.retryAfterSeconds}s`,
      );
      throw new HttpException(
        `Limite atingido. Tente novamente em ${rlCheck.retryAfterSeconds} segundos.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private extractJsonCandidate(raw: string): string {
    const normalized = String(raw || '').trim();
    const jsonMatch =
      normalized.match(/```json\s*([\s\S]*?)```/i) ||
      normalized.match(/```([\s\S]*?)```/i);
    return (jsonMatch?.[1] ?? normalized).trim();
  }

  private supportsReasoningEffort(model: string): boolean {
    const normalized = String(model || '').trim().toLowerCase();
    return (
      normalized.startsWith('gpt-5') ||
      normalized.startsWith('o1') ||
      normalized.startsWith('o3') ||
      normalized.startsWith('o4')
    );
  }

  private getOpenAiModelCandidates(primaryModel: string): string[] {
    return Array.from(
      new Set([primaryModel, this.openaiFallbackModel].map((value) => String(value || '').trim()).filter(Boolean)),
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
        message: parsed?.error?.message?.trim() || body.trim() || 'Erro desconhecido da OpenAI.',
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

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        if (index > 0) {
          this.logger.warn(
            `[SOPHIE] OpenAI fallback aplicado com sucesso | context=${params.context} | model=${model}`,
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
          `[SOPHIE] Tentando fallback OpenAI | context=${params.context} | from=${model} | to=${nextModel}`,
        );
        continue;
      }

      lastError = new Error(formattedError);
      break;
    }

    throw lastError || new Error(`Falha ao chamar OpenAI em ${params.context}.`);
  }

  private async callOpenAiJson<T>(params: {
    task: SophieTask;
    user: string;
    maxTokens?: number;
  }): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY nao configurada.');
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

    const systemPrompt = getSophieSystemPrompt(params.task);
    const { payload } = await this.requestOpenAiChatCompletion<OpenAiChatCompletion>({
      context: `json:${params.task}`,
      primaryModel: this.openaiModel,
      buildBody: (modelName) => ({
        model: modelName,
        temperature: 0.2,
        max_completion_tokens: params.maxTokens ?? MAX_JSON_TOKENS,
        reasoning_effort: this.openaiReasoningEffort,
        messages: [
          {
            role: 'developer',
            content:
              `${systemPrompt}\n\n` +
              'Responda SOMENTE em JSON valido, sem markdown, sem comentarios e sem texto fora do objeto JSON.',
          },
          { role: 'user', content: params.user },
        ],
      }),
    });
    const text = (payload.choices?.[0]?.message?.content ?? '').trim();
    if (!text) {
      throw new Error('OpenAI nao retornou conteudo utilizavel.');
    }

    const candidate = this.extractJsonCandidate(text);
    const parsed = JSON.parse(candidate) as T;

    return {
      data: parsed,
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
    };
  }

  private clampScore(value: number): number {
    const safe = Number.isFinite(value) ? value : 0;
    return Math.max(0, Math.min(100, Math.round(safe)));
  }

  private normalizeConfidence(value: unknown): SophieConfidence | undefined {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
      return normalized;
    }
    return undefined;
  }

  private normalizeStringArray(value: unknown, maxItems = 10): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const result = value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, Math.max(1, maxItems));
    return result.length ? result : undefined;
  }

  private toConfidenceLevel(value?: SophieConfidence): ConfidenceLevel {
    if (value === 'high') return ConfidenceLevel.HIGH;
    if (value === 'low') return ConfidenceLevel.LOW;
    return ConfidenceLevel.MEDIUM;
  }

  private isPhase2Enabled(): boolean {
    const raw =
      this.configService
        .get<string>('SOPHIE_AUTOMATION_PHASE2_ENABLED')
        ?.trim()
        .toLowerCase() ?? 'false';
    return raw === 'true';
  }

  private getPhase2ChecklistNcThreshold(): number {
    const raw = this.configService.get<string>('SOPHIE_PHASE2_CHECKLIST_NC_THRESHOLD');
    const parsed = Number.parseInt(String(raw ?? PHASE2_DEFAULT_NC_THRESHOLD), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return PHASE2_DEFAULT_NC_THRESHOLD;
    return parsed;
  }

  private normalizeRiskLevel(value: unknown): 'Baixo' | 'Médio' | 'Alto' | 'Crítico' {
    const normalized = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    if (normalized.includes('crit')) return 'Crítico';
    if (normalized.includes('alto')) return 'Alto';
    if (normalized.includes('medio') || normalized.includes('moder')) return 'Médio';
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
      flags.trabalho_altura || flags.espaco_confinado || flags.trabalho_quente || flags.eletricidade,
    );

    if (riskLevel === 'Crítico') {
      return {
        phase: 'phase2',
        riskBand: 'critical',
        requiresHumanApproval: true,
        recommendedFlow: 'review_required',
        reasons: ['Risco crítico identificado. Liberação automática bloqueada.'],
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

  private countChecklistNonConformities(items: unknown[]): number {
    if (!Array.isArray(items)) return 0;
    return items.filter((item: any) => {
      const raw = String(item?.status ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return raw === 'false' || raw === 'nao' || raw === 'nok' || raw.includes('nao conform');
    }).length;
  }

  private async tryAutoOpenNcFromChecklist(params: {
    checklist: any;
    summary: string;
    suggestions: string[];
    confidence?: SophieConfidence;
    nonConformCount: number;
  }): Promise<AnalyzeChecklistResponse['automation']> {
    if (!this.isPhase2Enabled()) {
      return { phase2Enabled: false, reasons: ['Fase 2 desativada por configuração.'] };
    }

    const threshold = this.getPhase2ChecklistNcThreshold();
    if (params.nonConformCount < threshold) {
      return {
        phase2Enabled: true,
        ncAutoOpened: false,
        reasons: [`Não conformidades abaixo do limiar automático (${threshold}).`],
      };
    }

    const checklistId = String(params.checklist?.id || '');
    const code = `NC-AUTO-CHK-${checklistId.slice(0, 8).toUpperCase()}`;

    try {
      const existing = await this.nonConformitiesService.findAll();
      const alreadyExists = existing.some(
        (nc: any) => String(nc?.codigo_nc || '').trim().toUpperCase() === code,
      );
      if (alreadyExists) {
        return {
          phase2Enabled: true,
          ncAutoOpened: false,
          reasons: ['NC automática já existente para este checklist.'],
          ncCode: code,
        };
      }

      const today = new Date();
      const isoDate = today.toISOString().slice(0, 10);
      const confidenceTag = params.confidence || 'medium';
      const dto: CreateNonConformityDto = {
        codigo_nc: code,
        tipo: 'CHECKLIST_AUTOMATIZADO',
        data_identificacao: isoDate,
        site_id: params.checklist?.site_id || undefined,
        local_setor_area: String(params.checklist?.site?.nome || params.checklist?.maquina || 'Área operacional'),
        atividade_envolvida: String(params.checklist?.titulo || 'Checklist SST'),
        responsavel_area: 'Responsável operacional',
        auditor_responsavel: 'SOPHIE',
        classificacao: ['AUTOMATICA', 'CHECKLIST', 'FASE2'],
        descricao: `NC aberta automaticamente pela SOPHIE Fase 2. ${params.summary || 'Checklist com não conformidades relevantes.'}`,
        evidencia_observada: `Foram identificadas ${params.nonConformCount} não conformidades no checklist.`,
        condicao_insegura: 'Desvios operacionais identificados no checklist.',
        requisito_nr: 'NR-01',
        requisito_item: 'Gerenciamento de riscos ocupacionais',
        risco_perigo: 'Não conformidades operacionais',
        risco_associado: 'Persistência de condição insegura',
        risco_nivel: params.nonConformCount >= threshold + 2 ? 'Alto' : 'Moderado',
        causa: ['FALHA_DE_VERIFICACAO_OPERACIONAL'],
        acao_imediata_descricao: params.suggestions?.[0] || 'Executar plano de ação corretivo imediato.',
        acao_imediata_data: isoDate,
        acao_imediata_responsavel: 'Responsável da área',
        acao_imediata_status: 'Pendente',
        acao_definitiva_descricao: params.suggestions?.[1] || 'Revisar processo e reforçar controles.',
        acao_definitiva_prazo: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        acao_definitiva_responsavel: 'Gestão SST',
        status: 'ABERTA',
        observacoes_gerais: `Abertura automática via SOPHIE Fase 2. Confiança da análise: ${confidenceTag}.`,
      };

      const created = await this.nonConformitiesService.create(dto);
      return {
        phase2Enabled: true,
        ncAutoOpened: true,
        ncId: created?.id,
        ncCode: created?.codigo_nc || code,
        reasons: ['NC automática aberta por criticidade de checklist na Fase 2.'],
      };
    } catch (error) {
      this.logger.error('Falha na abertura automática de NC (Fase 2).', error as any);
      return {
        phase2Enabled: true,
        ncAutoOpened: false,
        reasons: ['Falha ao abrir NC automática. Necessária ação manual.'],
      };
    }
  }

  private computeSafetyScore(snapshot: {
    trainingsExpired: number;
    trainingsExpiringSoon: number;
    examsExpired: number;
    examsExpiringSoon: number;
    ncOpenish: number;
  }): number {
    let score = 100;
    if (snapshot.trainingsExpired > 0) score -= 18;
    if (snapshot.trainingsExpiringSoon > 0) score -= 8;
    if (snapshot.examsExpired > 0) score -= 18;
    if (snapshot.examsExpiringSoon > 0) score -= 8;
    score -= Math.min(20, snapshot.ncOpenish * 2);
    return this.clampScore(score);
  }

  getAutomationRuntimeStatus() {
    return {
      phase2Enabled: this.isPhase2Enabled(),
      checklistNcThreshold: this.getPhase2ChecklistNcThreshold(),
    };
  }

  async getInsights(): Promise<InsightsResponse> {
    const tenantId = this.getTenantIdOrThrow();
    await this.enforceRateLimit(tenantId);

    const [trainings, exams, ncs] = await Promise.all([
      this.trainingsService.findExpirySummary(),
      this.medicalExamsService.findExpirySummary(),
      this.nonConformitiesService.summarizeByStatus(),
    ]);

    const openish =
      (ncs.byStatus?.['ABERTA'] ?? 0) +
      (ncs.byStatus?.['EM_ANDAMENTO'] ?? 0) +
      (ncs.byStatus?.['PENDENTE'] ?? 0);

    const safetyScore = this.computeSafetyScore({
      trainingsExpired: trainings.expired ?? 0,
      trainingsExpiringSoon: trainings.expiringSoon ?? 0,
      examsExpired: exams.expired ?? 0,
      examsExpiringSoon: exams.expiringSoon ?? 0,
      ncOpenish: openish,
    });

    const startTime = Date.now();
    const interaction = this.interactionRepo.create({
      tenant_id: tenantId,
      user_id: this.getCurrentUserId(),
      question: 'INSIGHTS',
      model: this.openaiModel,
      provider: 'openai',
      status: AiInteractionStatus.SUCCESS,
    });

    try {
      const { data, inputTokens, outputTokens } = await this.callOpenAiJson<{
        summary: string;
        insights: InsightCard[];
        confidence?: SophieConfidence;
        notes?: string[];
      }>({
        task: 'insights',
        user: `Gere um resumo executivo e 3 insights acionaveis para um dashboard SST.\n\nDados do sistema (tenant):\n- Treinamentos: ${JSON.stringify(
          trainings,
        )}\n- Exames (PCMSO/ASO): ${JSON.stringify(exams)}\n- Nao conformidades (por status): ${JSON.stringify(
          ncs,
        )}\n\nRegras:\n- insights[].type deve ser um de: info|warning|success\n- insights[].action deve ser uma rota interna (ex.: /dashboard/trainings)\n- Mensagens curtas e objetivas, sem alarmismo.\n\nRetorne APENAS JSON valido, sem markdown, sem comentarios e sem texto fora do JSON.\n\nFormato JSON:\n{\n  \"summary\": string,\n  \"insights\": [{\"type\":\"info|warning|success\",\"title\":string,\"message\":string,\"action\":string}],\n  \"confidence\": \"low|medium|high\",\n  \"notes\": string[]\n}`,
        maxTokens: 900,
      });
      const confidence = this.normalizeConfidence(data.confidence);
      const notes = this.normalizeStringArray(data.notes, 8);

      const response: InsightsResponse = {
        safetyScore,
        summary: String(data.summary || '').trim() || 'Resumo indisponivel no momento.',
        timestamp: new Date().toISOString(),
        insights: Array.isArray(data.insights) ? data.insights.slice(0, 6) : [],
        confidence,
        notes,
      };

      interaction.response = response as any;
      interaction.latency_ms = Date.now() - startTime;
      interaction.token_usage_input = inputTokens;
      interaction.token_usage_output = outputTokens;
      interaction.tokens_used = inputTokens + outputTokens;
      interaction.confidence = this.toConfidenceLevel(confidence);
      interaction.needs_human_review = false;
      await this.interactionRepo.save(interaction);

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      interaction.status = AiInteractionStatus.ERROR;
      interaction.error_message = message;
      interaction.latency_ms = Date.now() - startTime;
      try {
        await this.interactionRepo.save(interaction);
      } catch {
        // ignore logging failure
      }

      return {
        safetyScore,
        summary:
          'SOPHIE indisponivel no momento para sintetizar insights. Confira os modulos de Treinamentos, Exames e Nao Conformidades.',
        timestamp: new Date().toISOString(),
        confidence: 'low',
        notes: ['Fallback local aplicado por indisponibilidade temporaria da API de IA.'],
        insights: [
          {
            type: 'info',
            title: 'Treinamentos',
            message: 'Revise vencimentos e bloqueios por treinamento.',
            action: '/dashboard/trainings',
          },
          {
            type: 'info',
            title: 'Exames (PCMSO)',
            message: 'Verifique ASOs e pendencias do PCMSO.',
            action: '/dashboard/medical-exams',
          },
          {
            type: 'warning',
            title: 'Nao Conformidades',
            message: 'Priorize NCs abertas e em andamento com maior criticidade.',
            action: '/dashboard/nonconformities',
          },
        ],
      };
    }
  }

  async analyzeApr(description: string): Promise<AnalyzeAprResponse> {
    const tenantId = this.getTenantIdOrThrow();
    await this.enforceRateLimit(tenantId);

    const [risks, epis] = await Promise.all([
      this.risksService.findAll(),
      this.episService.findAll(),
    ]);

    const riskOptions = risks
      .map((risk: any) => ({ id: risk.id, nome: risk.nome, categoria: risk.categoria ?? null }))
      .slice(0, 300);
    const epiOptions = epis
      .map((epi: any) => ({ id: epi.id, nome: epi.nome, ca: epi.ca ?? null }))
      .slice(0, 300);

    const startTime = Date.now();
    const interaction = this.interactionRepo.create({
      tenant_id: tenantId,
      user_id: this.getCurrentUserId(),
      question: `ANALYZE_APR: ${description.slice(0, 220)}`,
      model: this.openaiModel,
      provider: 'openai',
      status: AiInteractionStatus.SUCCESS,
    });

    try {
      const { data, inputTokens, outputTokens } = await this.callOpenAiJson<AnalyzeAprResponse>({
        task: 'apr',
        user: `Contexto:\nDescricao da atividade/APR:\n${description}\n\nTarefa:\nSelecione riscos e EPIs existentes para esta atividade.\n\nLista de riscos disponiveis (escolha por id):\n${JSON.stringify(
          riskOptions,
        )}\n\nLista de EPIs disponiveis (escolha por id):\n${JSON.stringify(
          epiOptions,
        )}\n\nFormato JSON:\n{\n  \"risks\": [\"riskId\"],\n  \"epis\": [\"epiId\"],\n  \"explanation\": \"string curta explicando a escolha\",\n  \"confidence\": \"low|medium|high\",\n  \"notes\": string[]\n}\n\nRegras:\n- Retorne apenas IDs presentes nas listas.\n- Maximo: 8 risks e 8 epis.\n- Priorize riscos de acidentes, fisicos e quimicos mais provaveis pela descricao.\n- Retorne APENAS JSON valido, sem markdown, sem comentarios e sem texto fora do JSON.`,
        maxTokens: 800,
      });
      const confidence = this.normalizeConfidence(data.confidence);
      const notes = this.normalizeStringArray(data.notes, 8);

      const response: AnalyzeAprResponse = {
        risks: Array.isArray(data.risks) ? data.risks.slice(0, 8).filter(Boolean) : [],
        epis: Array.isArray(data.epis) ? data.epis.slice(0, 8).filter(Boolean) : [],
        explanation: String(data.explanation || '').trim() || 'Sugestao gerada pela SOPHIE.',
        confidence,
        notes,
      };

      interaction.response = response as any;
      interaction.latency_ms = Date.now() - startTime;
      interaction.token_usage_input = inputTokens;
      interaction.token_usage_output = outputTokens;
      interaction.tokens_used = inputTokens + outputTokens;
      interaction.confidence = this.toConfidenceLevel(confidence);
      interaction.needs_human_review = false;
      await this.interactionRepo.save(interaction);

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      interaction.status = AiInteractionStatus.ERROR;
      interaction.error_message = message;
      interaction.latency_ms = Date.now() - startTime;
      try {
        await this.interactionRepo.save(interaction);
      } catch {
        // ignore logging failure
      }

      return {
        risks: [],
        epis: [],
        explanation: 'SOPHIE indisponivel no momento para sugerir riscos e EPIs.',
        confidence: 'low',
        notes: ['Fallback local aplicado por indisponibilidade temporaria da API de IA.'],
      };
    }
  }

  async analyzePt(data: {
    titulo: string;
    descricao: string;
    trabalho_altura?: boolean;
    espaco_confinado?: boolean;
    trabalho_quente?: boolean;
    eletricidade?: boolean;
  }): Promise<AnalyzePtResponse> {
    const tenantId = this.getTenantIdOrThrow();
    await this.enforceRateLimit(tenantId);

    const startTime = Date.now();
    const interaction = this.interactionRepo.create({
      tenant_id: tenantId,
      user_id: this.getCurrentUserId(),
      question: `ANALYZE_PT: ${data.titulo}`,
      model: this.openaiModel,
      provider: 'openai',
      status: AiInteractionStatus.SUCCESS,
    });

    try {
      const flags = {
        trabalho_altura: Boolean(data.trabalho_altura),
        espaco_confinado: Boolean(data.espaco_confinado),
        trabalho_quente: Boolean(data.trabalho_quente),
        eletricidade: Boolean(data.eletricidade),
      };

      const { data: response, inputTokens, outputTokens } =
        await this.callOpenAiJson<AnalyzePtResponse>({
          task: 'pt',
          user: `Analise de Permissao de Trabalho (PT).\n\nTitulo: ${data.titulo}\nDescricao: ${data.descricao}\nSinais/flags: ${JSON.stringify(
            flags,
          )}\n\nGere um resumo e sugestoes tecnicas de controle.\n\nFormato JSON:\n{\n  \"summary\": string,\n  \"riskLevel\": \"Baixo|Médio|Alto|Crítico\",\n  \"suggestions\": string[],\n  \"confidence\": \"low|medium|high\",\n  \"notes\": string[]\n}\n\nRegras:\n- suggestions: 4 a 10 itens curtos.\n- Priorize hierarquia de controle.\n- Cite NRs relevantes quando pertinente (NR-10/12/20/33/35/06/01).\n- Retorne APENAS JSON valido, sem markdown, sem comentarios e sem texto fora do JSON.`,
          maxTokens: 900,
        });
      const confidence = this.normalizeConfidence(response.confidence);
      const notes = this.normalizeStringArray(response.notes, 8);
      const normalizedRiskLevel = this.normalizeRiskLevel(response.riskLevel);

      const normalized: AnalyzePtResponse = {
        summary: String(response.summary || '').trim() || 'Resumo indisponivel.',
        riskLevel: normalizedRiskLevel,
        suggestions: Array.isArray(response.suggestions)
          ? response.suggestions.map((s) => String(s).trim()).filter(Boolean).slice(0, 12)
          : [],
        confidence,
        notes,
        automation: this.buildPtAutomationDecision(normalizedRiskLevel, flags),
      };

      interaction.response = normalized as any;
      interaction.latency_ms = Date.now() - startTime;
      interaction.token_usage_input = inputTokens;
      interaction.token_usage_output = outputTokens;
      interaction.tokens_used = inputTokens + outputTokens;
      interaction.confidence = this.toConfidenceLevel(confidence);
      interaction.needs_human_review = false;
      await this.interactionRepo.save(interaction);

      return normalized;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      interaction.status = AiInteractionStatus.ERROR;
      interaction.error_message = message;
      interaction.latency_ms = Date.now() - startTime;
      try {
        await this.interactionRepo.save(interaction);
      } catch {
        // ignore logging failure
      }

      return {
        summary: 'SOPHIE indisponivel no momento para analisar esta PT.',
        riskLevel: 'Médio',
        suggestions: [
          'Revisar escopo da atividade e perigos principais.',
          'Garantir controles de engenharia e procedimentos antes de EPI.',
          'Validar requisitos NR aplicaveis (NR-01/06/10/12/33/35).',
        ],
        confidence: 'low',
        notes: ['Fallback local aplicado por indisponibilidade temporaria da API de IA.'],
        automation: this.buildPtAutomationDecision('Médio', data),
      };
    }
  }

  async analyzeChecklist(id: string): Promise<AnalyzeChecklistResponse> {
    const tenantId = this.getTenantIdOrThrow();
    await this.enforceRateLimit(tenantId);

    const checklist = await this.checklistsService.findOneEntity(id);
    const startTime = Date.now();
    const interaction = this.interactionRepo.create({
      tenant_id: tenantId,
      user_id: this.getCurrentUserId(),
      question: `ANALYZE_CHECKLIST: ${id}`,
      model: this.openaiModel,
      provider: 'openai',
      status: AiInteractionStatus.SUCCESS,
    });

    try {
      const checklistSnapshot = {
        id: checklist.id,
        titulo: checklist.titulo,
        descricao: checklist.descricao,
        equipamento: checklist.equipamento,
        maquina: checklist.maquina,
        status: checklist.status,
        itens: Array.isArray((checklist as any).itens)
          ? (checklist as any).itens.slice(0, 80)
          : [],
      };

      const { data, inputTokens, outputTokens } =
        await this.callOpenAiJson<AnalyzeChecklistResponse>({
          task: 'checklist',
          user: `Analise este checklist de SST e aponte pontos de atencao e melhorias.\n\nChecklist:\n${JSON.stringify(
            checklistSnapshot,
          )}\n\nFormato JSON:\n{\n  \"summary\": string,\n  \"suggestions\": string[],\n  \"confidence\": \"low|medium|high\",\n  \"notes\": string[]\n}\n\nRegras:\n- suggestions: 4 a 12 itens curtos.\n- Se houver muitos \"nao\"/\"nok\", priorize acoes imediatas.\n- Cite NRs quando pertinente.\n- Retorne APENAS JSON valido, sem markdown, sem comentarios e sem texto fora do JSON.`,
          maxTokens: 1000,
        });
      const confidence = this.normalizeConfidence(data.confidence);
      const notes = this.normalizeStringArray(data.notes, 8);
      const nonConformCount = this.countChecklistNonConformities(checklistSnapshot.itens || []);
      const automation = await this.tryAutoOpenNcFromChecklist({
        checklist: checklist,
        summary: String(data.summary || '').trim(),
        suggestions: Array.isArray(data.suggestions)
          ? data.suggestions.map((s) => String(s).trim()).filter(Boolean).slice(0, 16)
          : [],
        confidence,
        nonConformCount,
      });

      const response: AnalyzeChecklistResponse = {
        summary: String(data.summary || '').trim() || 'Resumo indisponivel.',
        suggestions: Array.isArray(data.suggestions)
          ? data.suggestions.map((s) => String(s).trim()).filter(Boolean).slice(0, 16)
          : [],
        confidence,
        notes,
        automation,
      };

      interaction.response = response as any;
      interaction.latency_ms = Date.now() - startTime;
      interaction.token_usage_input = inputTokens;
      interaction.token_usage_output = outputTokens;
      interaction.tokens_used = inputTokens + outputTokens;
      interaction.confidence = this.toConfidenceLevel(confidence);
      interaction.needs_human_review = false;
      await this.interactionRepo.save(interaction);

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      interaction.status = AiInteractionStatus.ERROR;
      interaction.error_message = message;
      interaction.latency_ms = Date.now() - startTime;
      try {
        await this.interactionRepo.save(interaction);
      } catch {
        // ignore logging failure
      }

      return {
        summary: 'SOPHIE indisponivel no momento para analisar este checklist.',
        suggestions: ['Revisar itens nao conformes e abrir plano de acao com prazos e responsaveis.'],
        confidence: 'low',
        notes: ['Fallback local aplicado por indisponibilidade temporaria da API de IA.'],
        automation: {
          phase2Enabled: this.isPhase2Enabled(),
          ncAutoOpened: false,
          reasons: ['Sem automação de NC devido indisponibilidade da IA.'],
        },
      };
    }
  }

  async generateDds(params?: GenerateDdsDto): Promise<GenerateDdsResponse> {
    const tenantId = this.getTenantIdOrThrow();
    await this.enforceRateLimit(tenantId);
    const temaBase = String(params?.tema || '').trim();
    const contexto = String(params?.contexto || '').trim();

    const startTime = Date.now();
    const interaction = this.interactionRepo.create({
      tenant_id: tenantId,
      user_id: this.getCurrentUserId(),
      question: `GENERATE_DDS: ${temaBase || contexto || 'tema livre'}`,
      model: this.openaiModel,
      provider: 'openai',
      status: AiInteractionStatus.SUCCESS,
    });

    try {
      const { data, inputTokens, outputTokens } = await this.callOpenAiJson<GenerateDdsResponse>({
        task: 'dds',
        user: `Gere um DDS (Diálogo Diario de Seguranca) pronto para uso.\n\nTema base: ${temaBase || 'definir automaticamente'}\nContexto operacional: ${contexto || 'nao informado'}\n\nFormato JSON:\n{\n  \"tema\": string,\n  \"conteudo\": string,\n  \"explanation\": string,\n  \"confidence\": \"low|medium|high\",\n  \"notes\": string[]\n}\n\nRegras:\n- conteudo em portugues, pratico, com 6 a 10 bullets.\n- incluir: objetivo, perigos, controles (hierarquia), EPIs, NRs relevantes.\n- evite jargoes e mantenha linguagem de campo.\n- Se houver tema base, respeite-o.\n- Retorne APENAS JSON valido, sem markdown, sem comentarios e sem texto fora do JSON.`,
        maxTokens: 1200,
      });
      const confidence = this.normalizeConfidence(data.confidence);
      const notes = this.normalizeStringArray(data.notes, 8);

      const response: GenerateDdsResponse = {
        tema: String(data.tema || '').trim() || 'DDS SST',
        conteudo: String(data.conteudo || '').trim() || '',
        explanation: String(data.explanation || '').trim() || 'Gerado pela SOPHIE.',
        confidence,
        notes,
      };

      interaction.response = response as any;
      interaction.latency_ms = Date.now() - startTime;
      interaction.token_usage_input = inputTokens;
      interaction.token_usage_output = outputTokens;
      interaction.tokens_used = inputTokens + outputTokens;
      interaction.confidence = this.toConfidenceLevel(confidence);
      interaction.needs_human_review = false;
      await this.interactionRepo.save(interaction);

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      interaction.status = AiInteractionStatus.ERROR;
      interaction.error_message = message;
      interaction.latency_ms = Date.now() - startTime;
      try {
        await this.interactionRepo.save(interaction);
      } catch {
        // ignore logging failure
      }

      return {
        tema: temaBase || 'Seguranca no Trabalho',
        conteudo:
          '- Objetivo: reforcar comportamentos seguros.\n- Perigos comuns: quedas, impacto, eletricidade, maquinas.\n- Controles: isolamento, sinalizacao, protecoes, procedimentos.\n- EPIs: capacete, oculos, luvas, calcado, protetor auricular.\n- NRs: NR-01, NR-06, NR-12, NR-35 (quando aplicavel).',
        explanation: 'Fallback local: SOPHIE indisponivel no momento.',
        confidence: 'low',
        notes: ['Fallback local aplicado por indisponibilidade temporaria da API de IA.'],
      };
    }
  }

  async generateChecklist(params: any): Promise<GenerateChecklistResponse> {
    const tenantId = this.getTenantIdOrThrow();
    await this.enforceRateLimit(tenantId);

    const baseTitle = String(params?.titulo || '').trim();
    const equip = String(params?.equipamento || '').trim();
    const machine = String(params?.maquina || '').trim();
    const descricao = String(params?.descricao || '').trim();

    const subject = machine || equip || baseTitle || 'Atividade';

    const startTime = Date.now();
    const interaction = this.interactionRepo.create({
      tenant_id: tenantId,
      user_id: String(params?.inspetor_id || 'unknown'),
      question: `GENERATE_CHECKLIST: ${subject}`,
      model: this.openaiModel,
      provider: 'openai',
      status: AiInteractionStatus.SUCCESS,
    });

    try {
      const { data, inputTokens, outputTokens } = await this.callOpenAiJson<{
        titulo: string;
        itens: Array<{ item: string }>;
        confidence?: SophieConfidence;
        notes?: string[];
      }>({
        task: 'generic',
        user: `Gere um checklist de inspecao SST para: ${subject}.\nDescricao: ${descricao || '(sem descricao)'}\n\nFormato JSON:\n{\n  \"titulo\": string,\n  \"itens\": [{\"item\": string}],\n  \"confidence\": \"low|medium|high\",\n  \"notes\": string[]\n}\n\nRegras:\n- 12 a 20 itens curtos e verificaveis.\n- Misture controles de engenharia, administrativos e EPI.\n- Se tema envolver NR-10/12/20/33/35, inclua verificacoes tipicas.\n- Nao incluir IDs, apenas texto.\n- Retorne APENAS JSON valido, sem markdown, sem comentarios e sem texto fora do JSON.`,
        maxTokens: 1200,
      });
      const confidence = this.normalizeConfidence(data.confidence);
      const notes = this.normalizeStringArray(data.notes, 8);

      const response: GenerateChecklistResponse = {
        id: 'sophie-generated',
        titulo: String(data.titulo || '').trim() || baseTitle || `Checklist - ${subject}`,
        itens: Array.isArray(data.itens)
          ? data.itens
              .map((i) => ({ item: String(i?.item || '').trim() }))
              .filter((i) => i.item)
              .slice(0, 24)
          : [],
        confidence,
        notes,
      };

      interaction.response = response as any;
      interaction.latency_ms = Date.now() - startTime;
      interaction.token_usage_input = inputTokens;
      interaction.token_usage_output = outputTokens;
      interaction.tokens_used = inputTokens + outputTokens;
      interaction.confidence = this.toConfidenceLevel(confidence);
      interaction.needs_human_review = false;
      await this.interactionRepo.save(interaction);

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      interaction.status = AiInteractionStatus.ERROR;
      interaction.error_message = message;
      interaction.latency_ms = Date.now() - startTime;
      try {
        await this.interactionRepo.save(interaction);
      } catch {
        // ignore logging failure
      }

      return {
        id: 'sophie-generated',
        titulo: baseTitle || `Checklist - ${subject}`,
        itens: [
          { item: 'Area isolada e sinalizada.' },
          { item: 'Protecoes e dispositivos de seguranca inspecionados.' },
          { item: 'Procedimento e permissao de trabalho verificados (se aplicavel).' },
          { item: 'EPIs adequados disponiveis e em bom estado (NR-06).' },
        ],
        confidence: 'low',
        notes: ['Fallback local aplicado por indisponibilidade temporaria da API de IA.'],
      };
    }
  }

  private normalizeGeneratedChecklistItems(
    generatedItems: GenerateChecklistResponse['itens'],
  ): Array<Record<string, unknown>> {
    return (generatedItems || []).map((entry, index) => ({
      id: `sophie-item-${index + 1}`,
      item: String(entry?.item || '').trim(),
      status: 'ok',
      tipo_resposta: 'conforme',
      obrigatorio: true,
      peso: 1,
      observacao: '',
      fotos: [],
    }));
  }

  private resolveChecklistRiskLevel(subject: string): string {
    const normalized = subject
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (
      normalized.includes('altura') ||
      normalized.includes('eletric') ||
      normalized.includes('espaco confinado') ||
      normalized.includes('trabalho quente')
    ) {
      return 'Alto';
    }

    if (normalized.includes('maquina') || normalized.includes('equipamento')) {
      return 'Médio';
    }

    return 'Médio';
  }

  private generateNonConformityCode(): string {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `NC-SOPHIE-${stamp}-${suffix}`;
  }

  async createChecklist(
    params: CreateAssistedChecklistDto,
  ): Promise<CreateChecklistAutomationResponse> {
    if (!params.site_id || !params.inspetor_id) {
      throw new BadRequestException(
        'site_id e inspetor_id são obrigatórios para criar checklist pela SOPHIE.',
      );
    }

    const generated = await this.generateChecklist(params as GenerateChecklistDto);
    const subject =
      String(params.titulo || '').trim() ||
      String(params.maquina || '').trim() ||
      String(params.equipamento || '').trim() ||
      generated.titulo ||
      'Checklist SST';

    const createDto: CreateChecklistDto = {
      titulo: generated.titulo || subject,
      descricao: String(params.descricao || '').trim() || `Checklist assistido pela SOPHIE para ${subject}.`,
      equipamento: params.equipamento,
      maquina: params.maquina,
      data: params.data || this.getTodayIsoDate(),
      status: 'Pendente',
      site_id: params.site_id,
      inspetor_id: params.inspetor_id,
      is_modelo: params.is_modelo ?? false,
      ativo: true,
      categoria: params.categoria || 'SST',
      periodicidade: params.periodicidade || 'Eventual',
      nivel_risco_padrao:
        params.nivel_risco_padrao || this.resolveChecklistRiskLevel(subject),
      itens: this.normalizeGeneratedChecklistItems(generated.itens),
    };

    const checklist = await this.checklistsService.create(createDto);

    return {
      checklist,
      generation: generated,
      persisted: true,
      message:
        'Checklist criado pela SOPHIE e salvo no sistema para revisão operacional.',
    };
  }

  async createDds(
    params: CreateAssistedDdsDto,
  ): Promise<CreateDdsAutomationResponse> {
    if (!params.site_id || !params.facilitador_id) {
      throw new BadRequestException(
        'site_id e facilitador_id são obrigatórios para criar DDS pela SOPHIE.',
      );
    }

    const generation = await this.generateDds({
      tema: params.tema,
      contexto: params.contexto,
    });

    const createDto: CreateDdsDto = {
      tema: generation.tema,
      conteudo: generation.conteudo,
      data: params.data || this.getTodayIsoDate(),
      is_modelo: params.is_modelo ?? false,
      site_id: params.site_id,
      facilitador_id: params.facilitador_id,
      participants: params.participants,
    };

    const created = await this.ddsService.create(createDto);
    const dds = await this.ddsService.findOne(created.id);

    return {
      dds,
      generation,
      persisted: true,
      message:
        'DDS criado pela SOPHIE e salvo no sistema para condução em campo.',
    };
  }

  async createNonConformity(
    params: CreateAssistedNonConformityDto,
  ): Promise<CreateNonConformityAutomationResponse> {
    if (!params.site_id) {
      throw new BadRequestException(
        'site_id é obrigatório para criar não conformidade pela SOPHIE.',
      );
    }

    const title =
      String(params.title || '').trim() || 'Não conformidade SST';
    const description =
      String(params.description || '').trim() ||
      'Desvio operacional identificado e pendente de tratamento.';
    const localSetorArea =
      String(params.local_setor_area || '').trim() || 'Área operacional';
    const responsavelArea =
      String(params.responsavel_area || '').trim() || 'Responsável da área';
    const tipo =
      String(params.tipo || '').trim() || 'DESVIO_OPERACIONAL';

    type GeneratedNonConformityDraft = {
      tipo?: string;
      classificacao?: string[];
      descricao?: string;
      evidencia_observada?: string;
      condicao_insegura?: string;
      requisito_nr?: string;
      requisito_item?: string;
      risco_perigo?: string;
      risco_associado?: string;
      risco_nivel?: string;
      causa?: string[];
      acao_imediata_descricao?: string;
      acao_definitiva_descricao?: string;
      acao_preventiva_medidas?: string;
      confidence?: SophieConfidence;
      notes?: string[];
    };

    const generated = await this.generateStructuredJson<GeneratedNonConformityDraft>({
      task: 'generic',
      maxTokens: 1400,
      prompt:
        `Crie um rascunho estruturado de Não Conformidade (NC) para SST em ambiente corporativo.\n\n` +
        `Contexto:\n` +
        `- Título: ${title}\n` +
        `- Descrição: ${description}\n` +
        `- Local/setor/área: ${localSetorArea}\n` +
        `- Tipo sugerido: ${tipo}\n\n` +
        `Objetivo:\n` +
        `- gerar um cadastro inicial consistente para revisão humana\n` +
        `- manter linguagem corporativa, técnica e objetiva\n` +
        `- priorizar hierarquia de controle\n` +
        `- considerar NR-01 e outras NRs aplicáveis quando pertinente\n\n` +
        `Formato JSON:\n` +
        `{\n` +
        `  "tipo": string,\n` +
        `  "classificacao": string[],\n` +
        `  "descricao": string,\n` +
        `  "evidencia_observada": string,\n` +
        `  "condicao_insegura": string,\n` +
        `  "requisito_nr": string,\n` +
        `  "requisito_item": string,\n` +
        `  "risco_perigo": string,\n` +
        `  "risco_associado": string,\n` +
        `  "risco_nivel": "Baixo|Médio|Alto|Crítico",\n` +
        `  "causa": string[],\n` +
        `  "acao_imediata_descricao": string,\n` +
        `  "acao_definitiva_descricao": string,\n` +
        `  "acao_preventiva_medidas": string,\n` +
        `  "confidence": "low|medium|high",\n` +
        `  "notes": string[]\n` +
        `}\n\n` +
        `Regras:\n` +
        `- Não inventar medições numéricas.\n` +
        `- Se o contexto for insuficiente, assumir um desvio operacional plausível e declarar isso em notes.\n` +
        `- descricao, evidencia_observada e condicao_insegura devem ser úteis para cadastro real.\n` +
        `- acao_imediata_descricao e acao_definitiva_descricao devem ser executáveis.\n` +
        `- Retorne somente JSON válido.`,
    });

    const today = this.getTodayIsoDate();
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const normalizedRiskLevel = this.normalizeRiskLevel(generated.risco_nivel);
    const confidence = this.normalizeConfidence(generated.confidence);
    const notes = this.normalizeStringArray(generated.notes);

    const createDto: CreateNonConformityDto = {
      codigo_nc: this.generateNonConformityCode(),
      tipo: String(generated.tipo || tipo).trim() || 'DESVIO_OPERACIONAL',
      data_identificacao: today,
      site_id: params.site_id,
      local_setor_area: localSetorArea,
      atividade_envolvida: title,
      responsavel_area: responsavelArea,
      auditor_responsavel: 'SOPHIE',
      classificacao:
        this.normalizeStringArray(generated.classificacao) || ['SOPHIE', 'NC_ASSISTIDA'],
      descricao:
        String(generated.descricao || '').trim() ||
        `${title}. ${description}`.trim(),
      evidencia_observada:
        String(generated.evidencia_observada || '').trim() || description,
      condicao_insegura:
        String(generated.condicao_insegura || '').trim() ||
        'Condição insegura identificada durante análise assistida.',
      requisito_nr: String(generated.requisito_nr || 'NR-01').trim() || 'NR-01',
      requisito_item:
        String(generated.requisito_item || 'Gerenciamento de riscos ocupacionais').trim() ||
        'Gerenciamento de riscos ocupacionais',
      risco_perigo:
        String(generated.risco_perigo || 'Desvio operacional').trim() || 'Desvio operacional',
      risco_associado:
        String(generated.risco_associado || 'Persistência de condição insegura').trim() ||
        'Persistência de condição insegura',
      risco_nivel: normalizedRiskLevel,
      causa:
        this.normalizeStringArray(generated.causa) || ['FALHA_DE_CONTROLE_OPERACIONAL'],
      acao_imediata_descricao:
        String(generated.acao_imediata_descricao || '').trim() ||
        'Executar contenção imediata do desvio e reforçar bloqueio operacional.',
      acao_imediata_data: today,
      acao_imediata_responsavel: responsavelArea,
      acao_imediata_status: 'Pendente',
      acao_definitiva_descricao:
        String(generated.acao_definitiva_descricao || '').trim() ||
        'Implementar correção definitiva e validar a eficácia do tratamento.',
      acao_definitiva_prazo: nextWeek,
      acao_definitiva_responsavel: 'Gestão SST',
      acao_preventiva_medidas:
        String(generated.acao_preventiva_medidas || '').trim() ||
        'Revisar controles, orientar equipe e reforçar monitoramento.',
      status: 'ABERTA',
      observacoes_gerais: [
        'NC criada pela SOPHIE em modo assistido.',
        confidence ? `Confiança da geração: ${confidence}.` : null,
        ...(notes || []),
      ]
        .filter(Boolean)
        .join(' '),
    };

    const created = await this.nonConformitiesService.create(createDto);

    return {
      nonConformity: created,
      generation: {
        title,
        riskLevel: normalizedRiskLevel,
        confidence,
        notes,
      },
      persisted: true,
      message:
        'Não conformidade criada pela SOPHIE e salva no sistema para validação técnica.',
    };
  }

  async queueMonthlyReport(
    params: GenerateSophieReportDto,
  ): Promise<QueueMonthlyReportAutomationResponse> {
    const companyId = this.getTenantIdOrThrow();
    await this.enforceRateLimit(companyId);

    const now = new Date();
    const year = params.ano || now.getFullYear();
    const month = params.mes || now.getMonth() + 1;
    const userId = this.getCurrentUserId();

    const job = await this.pdfQueue.add(
      'generate',
      {
        reportType: 'monthly',
        params: { companyId, year, month },
        userId,
        companyId,
      },
      defaultJobOptions,
    );

    return {
      reportType: 'monthly',
      year,
      month,
      jobId: job.id,
      statusUrl: `/reports/status/${job.id}`,
      queued: true,
      message:
        'Relatório mensal enfileirado pela SOPHIE. Acompanhe o processamento pelo status da fila.',
    };
  }

  async generateStructuredJson<T>(params: {
    task: SophieTask;
    prompt: string;
    maxTokens?: number;
  }): Promise<T> {
    const tenantId = this.getTenantIdOrThrow();
    await this.enforceRateLimit(tenantId);

    const maxTokens = Number.isFinite(params.maxTokens)
      ? Math.max(64, Math.min(2400, Math.trunc(Number(params.maxTokens))))
      : MAX_JSON_TOKENS;

    const userId = RequestContext.getUserId() || 'unknown';
    const startTime = Date.now();
    const interaction = this.interactionRepo.create({
      tenant_id: tenantId,
      user_id: userId,
      question: `GENERATE_JSON(${params.task}): ${String(params.prompt || '').slice(0, 220)}`,
      model: this.openaiModel,
      provider: 'openai',
      status: AiInteractionStatus.SUCCESS,
    });

    try {
      const { data, inputTokens, outputTokens } = await this.callOpenAiJson<T>({
        task: params.task,
        user: String(params.prompt || ''),
        maxTokens,
      });

      interaction.response = (data as unknown) as any;
      interaction.latency_ms = Date.now() - startTime;
      interaction.token_usage_input = inputTokens;
      interaction.token_usage_output = outputTokens;
      interaction.tokens_used = inputTokens + outputTokens;
      interaction.confidence = ConfidenceLevel.MEDIUM;
      interaction.needs_human_review = false;

      try {
        await this.interactionRepo.save(interaction);
      } catch {
        // ignore logging failure
      }

      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      interaction.status = AiInteractionStatus.ERROR;
      interaction.error_message = message;
      interaction.latency_ms = Date.now() - startTime;
      try {
        await this.interactionRepo.save(interaction);
      } catch {
        // ignore logging failure
      }
      throw error;
    }
  }

  // Compatibilidade com chamadas legadas.
  async generateJson<T>(prompt: string, schemaOrMaxTokens: string | number): Promise<T> {
    const maxTokens =
      typeof schemaOrMaxTokens === 'number'
        ? Math.max(64, Math.min(2400, Math.trunc(schemaOrMaxTokens)))
        : MAX_JSON_TOKENS;
    return this.generateStructuredJson<T>({
      task: 'generic',
      prompt,
      maxTokens,
    });
  }
}
