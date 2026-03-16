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
import {
  AiInteractionStatus,
  ConfidenceLevel,
} from './sst-agent/sst-agent.types';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { RisksService } from '../risks/risks.service';
import { EpisService } from '../epis/epis.service';
import { ChecklistsService } from '../checklists/checklists.service';
import { TrainingsService } from '../trainings/trainings.service';
import { MedicalExamsService } from '../medical-exams/medical-exams.service';
import { NonConformitiesService } from '../nonconformities/nonconformities.service';
import { DdsService } from '../dds/dds.service';
import { InspectionsService } from '../inspections/inspections.service';
import { ActivitiesService } from '../activities/activities.service';
import { ToolsService } from '../tools/tools.service';
import { MachinesService } from '../machines/machines.service';
import { UsersService } from '../users/users.service';
import { getSophieSystemPrompt } from './sophie.prompt-resolver';
import {
  AnalyzeAprResponse,
  AnalyzeChecklistResponse,
  AnalyzePtResponse,
  CreateChecklistAutomationResponse,
  CreateDdsAutomationResponse,
  CreateNonConformityAutomationResponse,
  GenerateAprDraftResponse,
  GenerateChecklistResponse,
  GenerateDdsResponse,
  GeneratePtDraftResponse,
  InsightCard,
  InsightsResponse,
  QueueMonthlyReportAutomationResponse,
  SophieActionPlanItem,
  SophieConfidence,
  SophieTask,
} from './sophie.types';
import type { CreateNonConformityDto } from '../nonconformities/dto/create-nonconformity.dto';
import type { CreateChecklistDto } from '../checklists/dto/create-checklist.dto';
import type { CreateDdsDto } from '../dds/dto/create-dds.dto';
import type { GenerateChecklistDto } from './dto/generate-checklist.dto';
import type { CreateAssistedChecklistDto } from './dto/create-assisted-checklist.dto';
import type { CreateAssistedAprDto } from './dto/create-assisted-apr.dto';
import type { CreateAssistedNonConformityDto } from './dto/create-assisted-nonconformity.dto';
import type { CreateAssistedPtDto } from './dto/create-assisted-pt.dto';
import type {
  CreateAssistedDdsDto,
  GenerateDdsDto,
} from './dto/generate-dds.dto';
import type { GenerateSophieReportDto } from './dto/generate-sophie-report.dto';
import { defaultJobOptions } from '../queue/default-job-options';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import { requestOpenAiChatCompletionResponse } from './openai-request.util';

const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
const DEFAULT_OPENAI_FALLBACK_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_REASONING_EFFORT = 'medium';
const MAX_JSON_TOKENS = 1600;
const PHASE2_DEFAULT_NC_THRESHOLD = 3;
const MAX_IMPORTED_EVIDENCE_ATTACHMENTS = 6;

type SophieActivityProfile = {
  key: string;
  keywords: readonly string[];
  ptChecklistId?: string;
  ptChecklistLabel?: string;
  ptChecklistReason?: string;
  templateKeywords?: readonly string[];
  riskHints?: readonly string[];
};

const SOPHIE_ACTIVITY_PROFILES: readonly SophieActivityProfile[] = [
  {
    key: 'altura',
    keywords: [
      'altura',
      'telhado',
      'escada',
      'andaime',
      'plataforma',
      'linha de vida',
    ],
    ptChecklistId: 'trabalho_altura_checklist',
    ptChecklistLabel: 'Checklist de trabalho em altura',
    ptChecklistReason:
      'A atividade indica exposicao a queda e exige validacao de protecoes coletivas, ancoragem e resgate.',
    templateKeywords: ['altura'],
    riskHints: ['Queda de altura', 'Queda de objetos', 'Falha de ancoragem'],
  },
  {
    key: 'eletricidade',
    keywords: [
      'eletric',
      'painel',
      'subestacao',
      'energizado',
      'cabine',
      'arco eletrico',
    ],
    ptChecklistId: 'trabalho_eletrico_checklist',
    ptChecklistLabel: 'Checklist de trabalho eletrico',
    ptChecklistReason:
      'O contexto aponta risco de choque, arco eletrico e necessidade de bloqueio/ausencia de tensao.',
    templateKeywords: ['eletric'],
    riskHints: ['Choque eletrico', 'Arco eletrico', 'Reenergizacao indevida'],
  },
  {
    key: 'quente',
    keywords: [
      'solda',
      'oxicorte',
      'esmerilh',
      'corte',
      'lixamento',
      'quente',
      'faisca',
    ],
    ptChecklistId: 'trabalho_quente_checklist',
    ptChecklistLabel: 'Checklist de trabalho a quente',
    ptChecklistReason:
      'Existe potencial de ignicao, fumos e projecao de particulas, exigindo liberacao controlada.',
    templateKeywords: ['quente'],
    riskHints: ['Queimaduras', 'Incendio', 'Fumos metalicos'],
  },
  {
    key: 'confinado',
    keywords: [
      'confinado',
      'tanque',
      'silo',
      'poço',
      'poco',
      'galeria',
      'vaso',
      'reator',
    ],
    ptChecklistId: 'trabalho_espaco_confinado_checklist',
    ptChecklistLabel: 'Checklist de espaco confinado',
    ptChecklistReason:
      'O ambiente sugere entrada em area confinada com necessidade de vigia, monitoramento atmosferico e resgate.',
    templateKeywords: ['confinado'],
    riskHints: ['Atmosfera perigosa', 'Asfixia', 'Resgate complexo'],
  },
  {
    key: 'escavacao',
    keywords: ['escav', 'vala', 'talude', 'retroescavadeira', 'trincheira'],
    ptChecklistId: 'trabalho_escavacao_checklist',
    ptChecklistLabel: 'Checklist de escavacao',
    ptChecklistReason:
      'A atividade envolve abertura de solo e pede controle de soterramento, interferencias e estabilidade.',
    templateKeywords: ['escava'],
    riskHints: [
      'Soterramento',
      'Colapso de talude',
      'Interferencia subterranea',
    ],
  },
  {
    key: 'icamento',
    keywords: [
      'içamento',
      'icamento',
      'guindaste',
      'ponte rolante',
      'carga suspensa',
      'munck',
    ],
    templateKeywords: ['icamento', 'içamento', 'movimentacao de carga'],
    riskHints: ['Queda de carga', 'Esmagamento', 'Colisao com carga suspensa'],
  },
  {
    key: 'maquinas',
    keywords: [
      'maquina',
      'equipamento',
      'prensa',
      'torno',
      'serra',
      'furadeira',
      'esteira',
    ],
    templateKeywords: ['maquinas', 'equipamentos', 'equipamento'],
    riskHints: [
      'Aprisionamento',
      'Partes moveis expostas',
      'Projecao de particulas',
    ],
  },
] as const;

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
    private readonly activitiesService: ActivitiesService,
    private readonly toolsService: ToolsService,
    private readonly machinesService: MachinesService,
    private readonly usersService: UsersService,
    private readonly checklistsService: ChecklistsService,
    private readonly trainingsService: TrainingsService,
    private readonly medicalExamsService: MedicalExamsService,
    private readonly nonConformitiesService: NonConformitiesService,
    private readonly ddsService: DdsService,
    private readonly inspectionsService: InspectionsService,
    private readonly integration: IntegrationResilienceService,
    @InjectQueue('pdf-generation')
    private readonly pdfQueue: Queue,
  ) {
    this.openaiApiKey =
      this.configService.get<string>('OPENAI_API_KEY')?.trim() || null;
    this.openaiModel =
      this.configService.get<string>('OPENAI_MODEL')?.trim() ||
      DEFAULT_OPENAI_MODEL;
    const configuredFallbackModel =
      this.configService.get<string>('OPENAI_FALLBACK_MODEL')?.trim() || '';
    this.openaiFallbackModel =
      configuredFallbackModel ||
      (this.openaiModel !== DEFAULT_OPENAI_FALLBACK_MODEL
        ? DEFAULT_OPENAI_FALLBACK_MODEL
        : null);
    this.openaiReasoningEffort =
      (this.configService
        .get<string>('OPENAI_REASONING_EFFORT')
        ?.trim()
        .toLowerCase() as 'minimal' | 'low' | 'medium' | 'high' | undefined) ||
      DEFAULT_OPENAI_REASONING_EFFORT;

    this.logger.log(
      `✅ SOPHIE AiService initialized (provider=openai model=${this.openaiModel} fallback=${this.openaiFallbackModel || 'none'} reasoning=${this.openaiReasoningEffort})`,
    );
  }

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Tenant nao identificado. Verifique autenticacao.',
      );
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

      const response = await requestOpenAiChatCompletionResponse({
        apiKey: this.openaiApiKey,
        body,
        configService: this.configService,
        integration: this.integration,
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

    throw (
      lastError || new Error(`Falha ao chamar OpenAI em ${params.context}.`)
    );
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
    const { payload } =
      await this.requestOpenAiChatCompletion<OpenAiChatCompletion>({
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
    const raw = this.configService.get<string>(
      'SOPHIE_PHASE2_CHECKLIST_NC_THRESHOLD',
    );
    const parsed = Number.parseInt(
      String(raw ?? PHASE2_DEFAULT_NC_THRESHOLD),
      10,
    );
    if (!Number.isFinite(parsed) || parsed <= 0)
      return PHASE2_DEFAULT_NC_THRESHOLD;
    return parsed;
  }

  private normalizeRiskLevel(
    value: unknown,
  ): 'Baixo' | 'Médio' | 'Alto' | 'Crítico' {
    const normalized = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

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

  private countChecklistNonConformities(items: unknown[]): number {
    if (!Array.isArray(items)) return 0;
    return items.filter((item: any) => {
      const raw = String(item?.status ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      return (
        raw === 'false' ||
        raw === 'nao' ||
        raw === 'nok' ||
        raw.includes('nao conform')
      );
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
      return {
        phase2Enabled: false,
        reasons: ['Fase 2 desativada por configuração.'],
      };
    }

    const threshold = this.getPhase2ChecklistNcThreshold();
    if (params.nonConformCount < threshold) {
      return {
        phase2Enabled: true,
        ncAutoOpened: false,
        reasons: [
          `Não conformidades abaixo do limiar automático (${threshold}).`,
        ],
      };
    }

    const checklistId = String(params.checklist?.id || '');
    const code = `NC-AUTO-CHK-${checklistId.slice(0, 8).toUpperCase()}`;

    try {
      const existing = await this.nonConformitiesService.findAll();
      const alreadyExists = existing.some(
        (nc: any) =>
          String(nc?.codigo_nc || '')
            .trim()
            .toUpperCase() === code,
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
        local_setor_area: String(
          params.checklist?.site?.nome ||
            params.checklist?.maquina ||
            'Área operacional',
        ),
        atividade_envolvida: String(
          params.checklist?.titulo || 'Checklist SST',
        ),
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
        risco_nivel:
          params.nonConformCount >= threshold + 2 ? 'Alto' : 'Moderado',
        causa: ['FALHA_DE_VERIFICACAO_OPERACIONAL'],
        acao_imediata_descricao:
          params.suggestions?.[0] ||
          'Executar plano de ação corretivo imediato.',
        acao_imediata_data: isoDate,
        acao_imediata_responsavel: 'Responsável da área',
        acao_imediata_status: 'Pendente',
        acao_definitiva_descricao:
          params.suggestions?.[1] || 'Revisar processo e reforçar controles.',
        acao_definitiva_prazo: new Date(
          today.getTime() + 7 * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .slice(0, 10),
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
        reasons: [
          'NC automática aberta por criticidade de checklist na Fase 2.',
        ],
      };
    } catch (error) {
      this.logger.error('Falha na abertura automática de NC (Fase 2).', error);
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

  private buildInsightsFallback(
    safetyScore: number,
    note: string,
  ): InsightsResponse {
    return {
      safetyScore,
      summary:
        'SOPHIE indisponivel no momento para sintetizar insights. Confira os modulos de Treinamentos, Exames e Nao Conformidades.',
      timestamp: new Date().toISOString(),
      confidence: 'low',
      notes: [note],
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
          message:
            'Priorize NCs abertas e em andamento com maior criticidade.',
          action: '/dashboard/nonconformities',
        },
      ],
    };
  }

  async getInsights(): Promise<InsightsResponse> {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      this.logger.error(
        '[SOPHIE] Contexto de tenant ausente ao solicitar insights.',
      );
      throw new BadRequestException(
        'Contexto da empresa indisponivel para gerar insights.',
      );
    }

    await this.enforceRateLimit(tenantId);

    let trainings: Awaited<ReturnType<TrainingsService['findExpirySummary']>>;
    let exams: Awaited<ReturnType<MedicalExamsService['findExpirySummary']>>;
    let ncs: Awaited<ReturnType<NonConformitiesService['summarizeByStatus']>>;

    try {
      [trainings, exams, ncs] = await Promise.all([
        this.trainingsService.findExpirySummary(),
        this.medicalExamsService.findExpirySummary(),
        this.nonConformitiesService.summarizeByStatus(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[SOPHIE] Falha ao compor insights do tenant ${tenantId}: ${message}`,
      );
      return this.buildInsightsFallback(
        0,
        'Fallback local aplicado por indisponibilidade temporaria dos dados base de SST.',
      );
    }

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
        summary:
          String(data.summary || '').trim() ||
          'Resumo indisponivel no momento.',
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

      return this.buildInsightsFallback(
        safetyScore,
        'Fallback local aplicado por indisponibilidade temporaria da API de IA.',
      );
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
      .map((risk: any) => ({
        id: risk.id,
        nome: risk.nome,
        categoria: risk.categoria ?? null,
      }))
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
      const { data, inputTokens, outputTokens } =
        await this.callOpenAiJson<AnalyzeAprResponse>({
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
        risks: Array.isArray(data.risks)
          ? data.risks.slice(0, 8).filter(Boolean)
          : [],
        epis: Array.isArray(data.epis)
          ? data.epis.slice(0, 8).filter(Boolean)
          : [],
        explanation:
          String(data.explanation || '').trim() ||
          'Sugestao gerada pela SOPHIE.',
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
        explanation:
          'SOPHIE indisponivel no momento para sugerir riscos e EPIs.',
        confidence: 'low',
        notes: [
          'Fallback local aplicado por indisponibilidade temporaria da API de IA.',
        ],
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

      const {
        data: response,
        inputTokens,
        outputTokens,
      } = await this.callOpenAiJson<AnalyzePtResponse>({
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
        summary:
          String(response.summary || '').trim() || 'Resumo indisponivel.',
        riskLevel: normalizedRiskLevel,
        suggestions: Array.isArray(response.suggestions)
          ? response.suggestions
              .map((s) => String(s).trim())
              .filter(Boolean)
              .slice(0, 12)
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
        notes: [
          'Fallback local aplicado por indisponibilidade temporaria da API de IA.',
        ],
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
      const nonConformCount = this.countChecklistNonConformities(
        checklistSnapshot.itens || [],
      );
      const automation = await this.tryAutoOpenNcFromChecklist({
        checklist: checklist,
        summary: String(data.summary || '').trim(),
        suggestions: Array.isArray(data.suggestions)
          ? data.suggestions
              .map((s) => String(s).trim())
              .filter(Boolean)
              .slice(0, 16)
          : [],
        confidence,
        nonConformCount,
      });

      const response: AnalyzeChecklistResponse = {
        summary: String(data.summary || '').trim() || 'Resumo indisponivel.',
        suggestions: Array.isArray(data.suggestions)
          ? data.suggestions
              .map((s) => String(s).trim())
              .filter(Boolean)
              .slice(0, 16)
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
        suggestions: [
          'Revisar itens nao conformes e abrir plano de acao com prazos e responsaveis.',
        ],
        confidence: 'low',
        notes: [
          'Fallback local aplicado por indisponibilidade temporaria da API de IA.',
        ],
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
      const { data, inputTokens, outputTokens } =
        await this.callOpenAiJson<GenerateDdsResponse>({
          task: 'dds',
          user: `Gere um DDS (Diálogo Diario de Seguranca) pronto para uso.\n\nTema base: ${temaBase || 'definir automaticamente'}\nContexto operacional: ${contexto || 'nao informado'}\n\nFormato JSON:\n{\n  \"tema\": string,\n  \"conteudo\": string,\n  \"explanation\": string,\n  \"confidence\": \"low|medium|high\",\n  \"notes\": string[]\n}\n\nRegras:\n- conteudo em portugues, pratico, com 6 a 10 bullets.\n- incluir: objetivo, perigos, controles (hierarquia), EPIs, NRs relevantes.\n- evite jargoes e mantenha linguagem de campo.\n- Se houver tema base, respeite-o.\n- Retorne APENAS JSON valido, sem markdown, sem comentarios e sem texto fora do JSON.`,
          maxTokens: 1200,
        });
      const confidence = this.normalizeConfidence(data.confidence);
      const notes = this.normalizeStringArray(data.notes, 8);

      const response: GenerateDdsResponse = {
        tema: String(data.tema || '').trim() || 'DDS SST',
        conteudo: String(data.conteudo || '').trim() || '',
        explanation:
          String(data.explanation || '').trim() || 'Gerado pela SOPHIE.',
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
        notes: [
          'Fallback local aplicado por indisponibilidade temporaria da API de IA.',
        ],
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
        titulo:
          String(data.titulo || '').trim() ||
          baseTitle ||
          `Checklist - ${subject}`,
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
          {
            item: 'Procedimento e permissao de trabalho verificados (se aplicavel).',
          },
          { item: 'EPIs adequados disponiveis e em bom estado (NR-06).' },
        ],
        confidence: 'low',
        notes: [
          'Fallback local aplicado por indisponibilidade temporaria da API de IA.',
        ],
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

  private generateDocumentNumber(prefix: 'APR' | 'PT'): string {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `${prefix}-SOPHIE-${stamp}-${suffix}`;
  }

  private normalizeBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (['true', '1', 'sim', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'nao', 'não', 'no'].includes(normalized)) return false;
    return undefined;
  }

  private normalizeAprRiskItems(value: unknown): Array<Record<string, string>> {
    if (!Array.isArray(value)) return [];

    return value
      .map((entry) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        return {
          atividade_processo: String(item.atividade_processo || '').trim(),
          agente_ambiental: String(item.agente_ambiental || '').trim(),
          condicao_perigosa: String(item.condicao_perigosa || '').trim(),
          fontes_circunstancias: String(
            item.fontes_circunstancias || '',
          ).trim(),
          possiveis_lesoes: String(item.possiveis_lesoes || '').trim(),
          probabilidade: String(item.probabilidade || '').trim(),
          severidade: String(item.severidade || '').trim(),
          categoria_risco: String(item.categoria_risco || '').trim(),
          medidas_prevencao: String(item.medidas_prevencao || '').trim(),
        };
      })
      .filter(
        (item) =>
          item.atividade_processo ||
          item.condicao_perigosa ||
          item.agente_ambiental ||
          item.medidas_prevencao,
      )
      .slice(0, 8);
  }

  private normalizeIdSelections(
    value: unknown,
    allowedIds: Set<string>,
    maxItems = 8,
  ): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(
      new Set(
        value
          .map((item) => String(item || '').trim())
          .filter((item) => item && allowedIds.has(item)),
      ),
    ).slice(0, Math.max(1, maxItems));
  }

  private formatSelectionLabel(entry: {
    nome?: string | null;
    funcao?: string | null;
    descricao?: string | null;
  }): string {
    const parts = [
      String(entry.nome || '').trim(),
      String(entry.funcao || '').trim(),
      String(entry.descricao || '').trim(),
    ].filter(Boolean);
    return parts.join(' • ');
  }

  private async loadAssistedDraftContext(companyId: string, siteId: string) {
    const [
      activitiesPage,
      toolsPage,
      machinesPage,
      usersPage,
      checklistTemplates,
    ] = await Promise.all([
      this.activitiesService.findPaginated({ page: 1, limit: 80, companyId }),
      this.toolsService.findPaginated({ page: 1, limit: 80, companyId }),
      this.machinesService.findPaginated({ page: 1, limit: 80, companyId }),
      this.usersService.findPaginated({ page: 1, limit: 80, companyId }),
      this.checklistsService.findAll({ onlyTemplates: true }).catch(() => []),
    ]);

    const participants = (usersPage.data || [])
      .filter(
        (user: any) => !siteId || !user.site_id || user.site_id === siteId,
      )
      .slice(0, 40)
      .map((user: any) => ({
        id: user.id,
        label: this.formatSelectionLabel({
          nome: user.nome,
          funcao: user.funcao,
          descricao: user.site_id ? `site:${user.site_id}` : '',
        }),
      }));

    return {
      activities: (activitiesPage.data || []).map((activity: any) => ({
        id: activity.id,
        label: this.formatSelectionLabel({
          nome: activity.nome,
          descricao: activity.descricao,
        }),
      })),
      tools: (toolsPage.data || []).map((tool: any) => ({
        id: tool.id,
        label: this.formatSelectionLabel({
          nome: tool.nome,
          descricao: tool.descricao,
        }),
      })),
      machines: (machinesPage.data || []).map((machine: any) => ({
        id: machine.id,
        label: this.formatSelectionLabel({
          nome: machine.nome,
          descricao: machine.descricao,
        }),
      })),
      participants,
      checklistTemplates: (checklistTemplates || [])
        .slice(0, 40)
        .map((template: any) => ({
          id: template.id,
          label: this.formatSelectionLabel({
            nome: template.titulo,
            descricao: template.descricao || template.categoria,
          }),
          descricao: String(template.descricao || '').trim(),
          categoria: String(template.categoria || '').trim(),
          periodicidade: String(template.periodicidade || '').trim(),
        })),
    };
  }

  private normalizeSearchText(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private buildAssistedContextText(
    values: Array<string | undefined | null>,
  ): string {
    return values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  private resolveActiveActivityProfiles(contextText: string) {
    const normalized = this.normalizeSearchText(contextText);
    return SOPHIE_ACTIVITY_PROFILES.filter((profile) =>
      profile.keywords.some((keyword) =>
        normalized.includes(this.normalizeSearchText(keyword)),
      ),
    );
  }

  private suggestTemplateChecklists(
    templates: Array<{
      id: string;
      label: string;
      descricao?: string;
      categoria?: string;
      periodicidade?: string;
    }>,
    contextText: string,
    maxItems = 4,
  ): Array<{ id: string; label: string; reason: string; source: 'template' }> {
    if (!templates.length || !contextText.trim()) return [];

    const activeProfiles = this.resolveActiveActivityProfiles(contextText);
    const normalizedContext = this.normalizeSearchText(contextText);

    const ranked = templates
      .map((template) => {
        const templateText = this.normalizeSearchText(
          `${template.label} ${template.descricao || ''} ${template.categoria || ''}`,
        );
        const matchedProfiles = activeProfiles.filter((profile) =>
          profile.templateKeywords?.some((keyword) =>
            templateText.includes(this.normalizeSearchText(keyword)),
          ),
        );
        const lexicalScore =
          matchedProfiles.length * 3 +
          (templateText && normalizedContext
            ? normalizedContext
                .split(/\s+/)
                .filter(
                  (token) => token.length > 4 && templateText.includes(token),
                ).length
            : 0);

        if (lexicalScore <= 0) return null;

        const reason = matchedProfiles.length
          ? `Relacionada a ${matchedProfiles.map((profile) => profile.key).join(', ')} no contexto da atividade.`
          : 'Compatível com o contexto operacional informado.';

        return {
          id: template.id,
          label: template.label,
          reason,
          source: 'template' as const,
          score: lexicalScore,
        };
      })
      .filter(Boolean)
      .sort((left, right) => (right?.score || 0) - (left?.score || 0))
      .slice(0, maxItems);

    return ranked.map((item) => ({
      id: item!.id,
      label: item!.label,
      reason: item!.reason,
      source: 'template',
    }));
  }

  private buildSuggestedRisksFromProfiles(
    riskOptions: Array<{ id: string; nome: string; categoria?: string | null }>,
    selectedRiskIds: string[],
    contextText: string,
    maxItems = 6,
  ): Array<{ id?: string; label: string; category?: string }> {
    const selected = riskOptions
      .filter((risk) => selectedRiskIds.includes(risk.id))
      .map((risk) => ({
        id: risk.id,
        label: risk.nome,
        category: risk.categoria || undefined,
      }));

    const normalizedSelected = new Set(
      selected.map((item) => this.normalizeSearchText(item.label)),
    );
    const profileHints = this.resolveActiveActivityProfiles(contextText)
      .flatMap((profile) => profile.riskHints || [])
      .filter(Boolean);

    const fallback = profileHints
      .map((hint) => {
        const matchedRisk = riskOptions.find((risk) => {
          const normalizedRisk = this.normalizeSearchText(
            `${risk.nome} ${risk.categoria || ''}`,
          );
          return normalizedRisk.includes(this.normalizeSearchText(hint));
        });

        if (matchedRisk) {
          return {
            id: matchedRisk.id,
            label: matchedRisk.nome,
            category: matchedRisk.categoria || undefined,
          };
        }

        return {
          label: hint,
        };
      })
      .filter(
        (item) => !normalizedSelected.has(this.normalizeSearchText(item.label)),
      );

    return Array.from(
      new Map(
        [...selected, ...fallback].map((item) => [
          this.normalizeSearchText(item.label),
          item,
        ]),
      ).values(),
    ).slice(0, maxItems);
  }

  private buildMandatoryPtChecklistSuggestions(params: {
    contextText: string;
    flags: {
      trabalho_altura: boolean;
      espaco_confinado: boolean;
      trabalho_quente: boolean;
      eletricidade: boolean;
      escavacao: boolean;
    };
    templateSuggestions: Array<{
      id: string;
      label: string;
      reason: string;
      source: 'template';
    }>;
  }): Array<{
    id: string;
    label: string;
    reason: string;
    source: 'template' | 'pt-group';
  }> {
    const base: Array<{
      id: string;
      label: string;
      reason: string;
      source: 'pt-group';
    }> = [
      {
        id: 'analise_risco_rapida_checklist',
        label: 'Checklist de análise de risco rápida',
        reason:
          'Obrigatório para validar percepção de risco antes da liberação.',
        source: 'pt-group',
      },
      {
        id: 'recomendacoes_gerais_checklist',
        label: 'Checklist de recomendações gerais',
        reason:
          'Mantém as confirmações mínimas de segurança e interrupção em caso de risco grave.',
        source: 'pt-group',
      },
    ];

    const activeProfiles = this.resolveActiveActivityProfiles(
      params.contextText,
    );

    for (const profile of SOPHIE_ACTIVITY_PROFILES) {
      if (!profile.ptChecklistId) continue;
      const byFlag =
        (profile.key === 'altura' && params.flags.trabalho_altura) ||
        (profile.key === 'eletricidade' && params.flags.eletricidade) ||
        (profile.key === 'quente' && params.flags.trabalho_quente) ||
        (profile.key === 'confinado' && params.flags.espaco_confinado) ||
        (profile.key === 'escavacao' && params.flags.escavacao);
      const byContext = activeProfiles.some((item) => item.key === profile.key);

      if (byFlag || byContext) {
        base.push({
          id: profile.ptChecklistId,
          label: profile.ptChecklistLabel || profile.ptChecklistId,
          reason:
            profile.ptChecklistReason ||
            'Checklist crítico para este tipo de atividade.',
          source: 'pt-group',
        });
      }
    }

    return Array.from(
      new Map(
        [...base, ...params.templateSuggestions].map((item) => [item.id, item]),
      ).values(),
    );
  }

  private collectChecklistEvidenceAttachments(
    checklist: any,
  ): Array<{ url: string; label: string }> {
    const evidence: Array<{ url: string; label: string }> = [];

    if (
      typeof checklist?.foto_equipamento === 'string' &&
      checklist.foto_equipamento.trim()
    ) {
      evidence.push({
        url: checklist.foto_equipamento.trim(),
        label: 'Foto do equipamento do checklist',
      });
    }

    const items = Array.isArray(checklist?.itens) ? checklist.itens : [];
    for (const item of items) {
      const photos = Array.isArray(item?.fotos) ? item.fotos : [];
      for (const photo of photos.slice(0, 1)) {
        const normalized = String(photo || '').trim();
        if (!normalized) continue;
        evidence.push({
          url: normalized,
          label: `Foto do item: ${String(item?.item || 'Checklist').trim() || 'Checklist'}`,
        });
        if (evidence.length >= MAX_IMPORTED_EVIDENCE_ATTACHMENTS) {
          return evidence;
        }
      }
    }

    return evidence.slice(0, MAX_IMPORTED_EVIDENCE_ATTACHMENTS);
  }

  private collectInspectionEvidenceAttachments(
    inspection: any,
  ): Array<{ url: string; label: string }> {
    return (Array.isArray(inspection?.evidencias) ? inspection.evidencias : [])
      .map((item: any) => ({
        url: String(item?.url || '').trim(),
        label:
          String(
            item?.descricao || item?.original_name || 'Evidência da inspeção',
          ).trim() || 'Evidência da inspeção',
      }))
      .filter((item) => item.url)
      .slice(0, MAX_IMPORTED_EVIDENCE_ATTACHMENTS);
  }

  private normalizeActionPlan(
    value: unknown,
    defaults?: Array<Partial<SophieActionPlanItem>>,
  ): SophieActionPlanItem[] {
    const items = Array.isArray(value) ? value : [];
    const normalized = items
      .map((entry, index) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        const fallback = defaults?.[index] || {};
        const priority = String(item.priority || fallback.priority || 'medium')
          .trim()
          .toLowerCase();
        const type = String(item.type || fallback.type || 'corrective')
          .trim()
          .toLowerCase();

        return {
          title: String(item.title || fallback.title || '').trim(),
          owner: String(item.owner || fallback.owner || 'Gestão SST').trim(),
          priority:
            priority === 'critical' || priority === 'high' || priority === 'low'
              ? priority
              : 'medium',
          timeline: String(
            item.timeline || fallback.timeline || 'Curto prazo',
          ).trim(),
          type:
            type === 'immediate' || type === 'preventive' ? type : 'corrective',
        } as SophieActionPlanItem;
      })
      .filter((item) => item.title)
      .slice(0, 5);

    if (normalized.length > 0) {
      return normalized;
    }

    return (defaults || [])
      .map((entry) => ({
        title: String(entry.title || '').trim(),
        owner: String(entry.owner || 'Gestão SST').trim(),
        priority:
          entry.priority === 'critical' ||
          entry.priority === 'high' ||
          entry.priority === 'low'
            ? entry.priority
            : ('medium' as const),
        timeline: String(entry.timeline || 'Curto prazo').trim(),
        type:
          entry.type === 'immediate' || entry.type === 'preventive'
            ? entry.type
            : ('corrective' as const),
      }))
      .filter((item) => item.title)
      .slice(0, 5);
  }

  private buildPtObservationText(params: {
    summary: string;
    riskLevel: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
    suggestedActions: string[];
    mandatoryDocuments?: string[];
  }): string {
    const lines = [
      `Resumo técnico SOPHIE: ${params.summary}`.trim(),
      `Nível de risco sugerido: ${params.riskLevel}.`,
    ];

    if (params.suggestedActions.length > 0) {
      lines.push(
        `Controles prioritários: ${params.suggestedActions
          .slice(0, 4)
          .join('; ')}.`,
      );
    }

    if ((params.mandatoryDocuments || []).length > 0) {
      lines.push(
        `Documentos e validações mandatórias: ${params.mandatoryDocuments
          ?.slice(0, 4)
          .join('; ')}.`,
      );
    }

    return lines.filter(Boolean).join('\n');
  }

  private async buildNonConformitySourceSnapshot(
    params: CreateAssistedNonConformityDto,
  ): Promise<{
    sourceType: 'manual' | 'image' | 'checklist' | 'inspection';
    siteId?: string;
    title?: string;
    description?: string;
    localSetorArea?: string;
    evidenceAttachments: Array<{ url: string; label: string }>;
    promptSections: string[];
    notes: string[];
  }> {
    const sourceType = params.source_type || 'manual';

    const promptSections: string[] = [];
    const notes: string[] = [];
    let siteId = params.site_id;
    let title = params.title;
    let description = params.description;
    let localSetorArea = params.local_setor_area;
    let evidenceAttachments: Array<{ url: string; label: string }> = [];

    if (params.source_context?.trim()) {
      promptSections.push(
        `Contexto adicional da origem: ${params.source_context.trim()}`,
      );
    }

    if (sourceType === 'image') {
      if (params.image_analysis_summary?.trim()) {
        promptSections.push(
          `Síntese da análise da imagem: ${params.image_analysis_summary.trim()}`,
        );
      }
      if (params.image_risks?.length) {
        promptSections.push(
          `Riscos visíveis na imagem: ${params.image_risks.join('; ')}`,
        );
      }
      if (params.image_actions?.length) {
        promptSections.push(
          `Ações imediatas sugeridas para a imagem: ${params.image_actions.join('; ')}`,
        );
      }
      if (params.image_notes?.trim()) {
        promptSections.push(
          `Notas da análise da imagem: ${params.image_notes.trim()}`,
        );
      }
    }

    if (sourceType === 'checklist' && params.source_reference) {
      try {
        const checklist = await this.checklistsService.findOneEntity(
          params.source_reference,
        );
        siteId = siteId || checklist.site_id;
        title = title || checklist.titulo;
        description =
          description ||
          checklist.descricao ||
          `Checklist ${checklist.titulo} com status ${checklist.status}.`;
        localSetorArea =
          localSetorArea ||
          checklist.site?.nome ||
          checklist.maquina ||
          checklist.equipamento ||
          'Área operacional';
        promptSections.push(
          `Origem checklist: ${JSON.stringify({
            id: checklist.id,
            titulo: checklist.titulo,
            descricao: checklist.descricao,
            equipamento: checklist.equipamento,
            maquina: checklist.maquina,
            status: checklist.status,
            site: checklist.site?.nome,
            itens: Array.isArray((checklist as any).itens)
              ? (checklist as any).itens.slice(0, 20)
              : [],
          })}`,
        );
        evidenceAttachments =
          this.collectChecklistEvidenceAttachments(checklist);
        if (evidenceAttachments.length) {
          promptSections.push(
            `Evidencias visuais disponiveis no checklist: ${evidenceAttachments
              .map((item) => item.label)
              .join('; ')}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `[SOPHIE] Não foi possível carregar checklist ${params.source_reference} para NC assistida: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        notes.push('Origem checklist não pôde ser carregada integralmente.');
      }
    }

    if (sourceType === 'inspection' && params.source_reference) {
      try {
        const tenantId = this.getTenantIdOrThrow();
        const inspection = await this.inspectionsService.findOneEntity(
          params.source_reference,
          tenantId,
        );
        siteId = siteId || inspection.site_id;
        title = title || `Achado da inspeção ${inspection.tipo_inspecao}`;
        description =
          description ||
          inspection.conclusao ||
          inspection.descricao_local_atividades ||
          'Achado oriundo de inspeção operacional.';
        localSetorArea =
          localSetorArea ||
          inspection.setor_area ||
          inspection.site?.nome ||
          'Área inspecionada';
        promptSections.push(
          `Origem inspeção: ${JSON.stringify({
            id: inspection.id,
            tipo_inspecao: inspection.tipo_inspecao,
            setor_area: inspection.setor_area,
            objetivo: inspection.objetivo,
            descricao_local_atividades: inspection.descricao_local_atividades,
            conclusao: inspection.conclusao,
            perigos_riscos: inspection.perigos_riscos?.slice(0, 8),
            plano_acao: inspection.plano_acao?.slice(0, 6),
            evidencias: inspection.evidencias?.slice(0, 6),
          })}`,
        );
        evidenceAttachments =
          this.collectInspectionEvidenceAttachments(inspection);
        if (evidenceAttachments.length) {
          promptSections.push(
            `Evidencias disponiveis na inspecao: ${evidenceAttachments
              .map((item) => item.label)
              .join('; ')}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `[SOPHIE] Não foi possível carregar inspeção ${params.source_reference} para NC assistida: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        notes.push('Origem inspeção não pôde ser carregada integralmente.');
      }
    }

    return {
      sourceType,
      siteId,
      title,
      description,
      localSetorArea,
      evidenceAttachments,
      promptSections,
      notes,
    };
  }

  async generateAprDraft(
    params: CreateAssistedAprDto,
  ): Promise<GenerateAprDraftResponse> {
    if (!params.site_id || !params.elaborador_id) {
      throw new BadRequestException(
        'site_id e elaborador_id são obrigatórios para gerar APR assistida.',
      );
    }

    const companyId = params.company_id || this.getTenantIdOrThrow();
    const [risks, epis, draftContext] = await Promise.all([
      this.risksService.findAll(),
      this.episService.findAll(),
      this.loadAssistedDraftContext(companyId, params.site_id),
    ]);

    const riskOptions = risks
      .map((risk: any) => ({
        id: risk.id,
        nome: risk.nome,
        categoria: risk.categoria ?? null,
      }))
      .slice(0, 300);
    const epiOptions = epis
      .map((epi: any) => ({ id: epi.id, nome: epi.nome, ca: epi.ca ?? null }))
      .slice(0, 300);
    const contextText = this.buildAssistedContextText([
      params.title,
      params.description,
      params.activity,
      params.process,
      params.equipment,
      params.machine,
      params.site_name,
      params.company_name,
    ]);
    const templateChecklistSuggestions = this.suggestTemplateChecklists(
      draftContext.checklistTemplates,
      contextText,
      4,
    );

    type GeneratedAprDraft = {
      title?: string;
      description?: string;
      risks?: string[];
      epis?: string[];
      activities?: string[];
      tools?: string[];
      machines?: string[];
      participants?: string[];
      risk_items?: Array<Record<string, unknown>>;
      recommended_actions?: string[];
      summary?: string;
      confidence?: SophieConfidence;
      notes?: string[];
    };

    const generated = await this.generateStructuredJson<GeneratedAprDraft>({
      task: 'apr',
      maxTokens: 1600,
      prompt:
        `Monte um rascunho inicial de APR para SST com foco corporativo e revisão humana.\n\n` +
        `Contexto recebido:\n` +
        `- Empresa: ${params.company_name || params.company_id || 'Empresa ativa'}\n` +
        `- Site/obra: ${params.site_name || params.site_id}\n` +
        `- Título sugerido: ${params.title || 'não informado'}\n` +
        `- Descrição/escopo: ${params.description || 'não informado'}\n` +
        `- Atividade: ${params.activity || 'não informada'}\n` +
        `- Processo: ${params.process || 'não informado'}\n` +
        `- Equipamento: ${params.equipment || 'não informado'}\n` +
        `- Máquina: ${params.machine || 'não informada'}\n\n` +
        `Objetivo:\n` +
        `- propor uma APR inicial consistente, técnica e pronta para revisão\n` +
        `- identificar de 3 a 6 riscos principais\n` +
        `- priorizar hierarquia de controle antes de EPI\n` +
        `- retornar apenas IDs presentes nas listas de riscos e EPIs fornecidas\n\n` +
        `Atividades disponíveis (usar somente IDs válidos quando fizer sentido):\n${JSON.stringify(draftContext.activities)}\n\n` +
        `Ferramentas disponíveis (usar somente IDs válidos quando fizer sentido):\n${JSON.stringify(draftContext.tools)}\n\n` +
        `Máquinas disponíveis (usar somente IDs válidos quando fizer sentido):\n${JSON.stringify(draftContext.machines)}\n\n` +
        `Participantes disponíveis (usar somente IDs válidos quando fizer sentido):\n${JSON.stringify(draftContext.participants)}\n\n` +
        `Riscos disponíveis (usar somente IDs válidos):\n${JSON.stringify(riskOptions)}\n\n` +
        `EPIs disponíveis (usar somente IDs válidos):\n${JSON.stringify(epiOptions)}\n\n` +
        `Checklists/template de apoio disponíveis:\n${JSON.stringify(draftContext.checklistTemplates)}\n\n` +
        `Formato JSON:\n` +
        `{\n` +
        `  "title": string,\n` +
        `  "description": string,\n` +
        `  "activities": string[],\n` +
        `  "risks": string[],\n` +
        `  "epis": string[],\n` +
        `  "tools": string[],\n` +
        `  "machines": string[],\n` +
        `  "participants": string[],\n` +
        `  "risk_items": [{\n` +
        `    "atividade_processo": string,\n` +
        `    "agente_ambiental": string,\n` +
        `    "condicao_perigosa": string,\n` +
        `    "fontes_circunstancias": string,\n` +
        `    "possiveis_lesoes": string,\n` +
        `    "probabilidade": "1"|"2"|"3"|"4"|"5",\n` +
        `    "severidade": "1"|"2"|"3"|"4"|"5",\n` +
        `    "categoria_risco": string,\n` +
        `    "medidas_prevencao": string\n` +
        `  }],\n` +
        `  "recommended_actions": string[],\n` +
        `  "summary": string,\n` +
        `  "confidence": "low|medium|high",\n` +
        `  "notes": string[]\n` +
        `}\n\n` +
        `Regras:\n` +
        `- title e description precisam estar prontos para abrir o formulário.\n` +
        `- risk_items deve ter linguagem técnica, mas objetiva.\n` +
        `- Não inventar medições quantitativas não informadas.\n` +
        `- recommended_actions deve ter de 3 a 6 itens executáveis.\n` +
        `- Retorne somente JSON válido.`,
    });

    const allowedRiskIds = new Set(riskOptions.map((item) => item.id));
    const allowedEpiIds = new Set(epiOptions.map((item) => item.id));
    const allowedActivityIds = new Set(
      draftContext.activities.map((item) => item.id),
    );
    const allowedToolIds = new Set(draftContext.tools.map((item) => item.id));
    const allowedMachineIds = new Set(
      draftContext.machines.map((item) => item.id),
    );
    const allowedParticipantIds = new Set(
      draftContext.participants.map((item) => item.id),
    );
    const riskItems = this.normalizeAprRiskItems(generated.risk_items);
    const suggestedActions =
      this.normalizeStringArray(generated.recommended_actions, 6) ||
      Array.from(
        new Set(
          riskItems
            .map((item) => String(item.medidas_prevencao || '').trim())
            .filter(Boolean),
        ),
      ).slice(0, 6);
    const confidence = this.normalizeConfidence(generated.confidence);
    const notes = this.normalizeStringArray(generated.notes, 10);
    const selectedParticipants = Array.from(
      new Set([
        params.elaborador_id,
        ...this.normalizeIdSelections(
          generated.participants,
          allowedParticipantIds,
          4,
        ),
      ]),
    ).filter((id) => allowedParticipantIds.has(id));
    const selectedActivities = this.normalizeIdSelections(
      generated.activities,
      allowedActivityIds,
      4,
    );
    const selectedTools = this.normalizeIdSelections(
      generated.tools,
      allowedToolIds,
      4,
    );
    const selectedMachines = this.normalizeIdSelections(
      generated.machines,
      allowedMachineIds,
      4,
    );
    const selectedRiskIds = (
      this.normalizeStringArray(generated.risks, 12) || []
    ).filter((id) => allowedRiskIds.has(id));
    const selectedEpiIds = (
      this.normalizeStringArray(generated.epis, 12) || []
    ).filter((id) => allowedEpiIds.has(id));
    const suggestedRisks = this.buildSuggestedRisksFromProfiles(
      riskOptions,
      selectedRiskIds,
      contextText,
      6,
    );

    return {
      draft: {
        step: 1,
        values: {
          numero: this.generateDocumentNumber('APR'),
          titulo: String(
            generated.title ||
              params.title ||
              params.activity ||
              'APR Assistida',
          ).trim(),
          descricao: String(
            generated.description ||
              params.description ||
              params.process ||
              params.activity ||
              '',
          ).trim(),
          status: 'Pendente',
          company_id: params.company_id || this.getTenantIdOrThrow(),
          site_id: params.site_id,
          elaborador_id: params.elaborador_id,
          participants: selectedParticipants.length
            ? selectedParticipants
            : [params.elaborador_id],
          risks: selectedRiskIds,
          epis: selectedEpiIds,
          activities: selectedActivities,
          tools: selectedTools,
          machines: selectedMachines,
          itens_risco: riskItems,
        },
        signatures: {},
      },
      summary:
        String(generated.summary || '').trim() ||
        'APR inicial gerada pela SOPHIE com foco em riscos prioritários e controles.',
      suggestedActions,
      suggestedResources: {
        activities: draftContext.activities.filter((item) =>
          selectedActivities.includes(item.id),
        ),
        participants: draftContext.participants.filter((item) =>
          (selectedParticipants.length
            ? selectedParticipants
            : [params.elaborador_id]
          ).includes(item.id),
        ),
        tools: draftContext.tools.filter((item) =>
          selectedTools.includes(item.id),
        ),
        machines: draftContext.machines.filter((item) =>
          selectedMachines.includes(item.id),
        ),
      },
      suggestedRisks,
      mandatoryChecklists: templateChecklistSuggestions,
      confidence,
      notes,
      message:
        'Rascunho de APR gerado pela SOPHIE. Revise o contexto operacional, complemente participantes e valide a matriz antes de emitir.',
    };
  }

  async generatePtDraft(
    params: CreateAssistedPtDto,
  ): Promise<GeneratePtDraftResponse> {
    if (!params.site_id || !params.responsavel_id) {
      throw new BadRequestException(
        'site_id e responsavel_id são obrigatórios para gerar PT assistida.',
      );
    }

    const companyId = params.company_id || this.getTenantIdOrThrow();
    const draftContext = await this.loadAssistedDraftContext(
      companyId,
      params.site_id,
    );
    const contextText = this.buildAssistedContextText([
      params.title,
      params.description,
      params.site_name,
      params.company_name,
      params.trabalho_altura ? 'trabalho em altura' : '',
      params.espaco_confinado ? 'espaco confinado' : '',
      params.trabalho_quente ? 'trabalho a quente' : '',
      params.eletricidade ? 'eletricidade' : '',
      params.escavacao ? 'escavacao' : '',
    ]);
    const templateChecklistSuggestions = this.suggestTemplateChecklists(
      draftContext.checklistTemplates,
      contextText,
      4,
    );

    type GeneratedPtDraft = {
      title?: string;
      description?: string;
      riskLevel?: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
      summary?: string;
      suggestions?: string[];
      mandatory_documents?: string[];
      participants?: string[];
      tools?: string[];
      machines?: string[];
      flags?: {
        trabalho_altura?: boolean;
        espaco_confinado?: boolean;
        trabalho_quente?: boolean;
        eletricidade?: boolean;
        escavacao?: boolean;
      };
      confidence?: SophieConfidence;
      notes?: string[];
    };

    const generated = await this.generateStructuredJson<GeneratedPtDraft>({
      task: 'pt',
      maxTokens: 1400,
      prompt:
        `Monte um rascunho inicial de Permissão de Trabalho (PT) para SST.\n\n` +
        `Contexto recebido:\n` +
        `- Empresa: ${params.company_name || params.company_id || 'Empresa ativa'}\n` +
        `- Site/obra: ${params.site_name || params.site_id}\n` +
        `- Título sugerido: ${params.title || 'não informado'}\n` +
        `- Descrição/escopo: ${params.description || 'não informado'}\n` +
        `- Flags já informadas: ${JSON.stringify({
          trabalho_altura: params.trabalho_altura,
          espaco_confinado: params.espaco_confinado,
          trabalho_quente: params.trabalho_quente,
          eletricidade: params.eletricidade,
          escavacao: params.escavacao,
        })}\n\n` +
        `Objetivo:\n` +
        `- preparar uma PT inicial pronta para revisão humana\n` +
        `- sugerir criticidade e controles imediatos\n` +
        `- inferir flags críticas quando o contexto apontar necessidade\n` +
        `- indicar documentos/validações mandatórias\n\n` +
        `Participantes disponíveis (usar somente IDs válidos quando fizer sentido):\n${JSON.stringify(draftContext.participants)}\n\n` +
        `Ferramentas disponíveis (usar somente IDs válidos quando fizer sentido):\n${JSON.stringify(draftContext.tools)}\n\n` +
        `Máquinas disponíveis (usar somente IDs válidos quando fizer sentido):\n${JSON.stringify(draftContext.machines)}\n\n` +
        `Checklists/template de apoio disponíveis:\n${JSON.stringify(draftContext.checklistTemplates)}\n\n` +
        `Formato JSON:\n` +
        `{\n` +
        `  "title": string,\n` +
        `  "description": string,\n` +
        `  "riskLevel": "Baixo|Médio|Alto|Crítico",\n` +
        `  "summary": string,\n` +
        `  "suggestions": string[],\n` +
        `  "mandatory_documents": string[],\n` +
        `  "participants": string[],\n` +
        `  "tools": string[],\n` +
        `  "machines": string[],\n` +
        `  "flags": {\n` +
        `    "trabalho_altura": boolean,\n` +
        `    "espaco_confinado": boolean,\n` +
        `    "trabalho_quente": boolean,\n` +
        `    "eletricidade": boolean,\n` +
        `    "escavacao": boolean\n` +
        `  },\n` +
        `  "confidence": "low|medium|high",\n` +
        `  "notes": string[]\n` +
        `}\n\n` +
        `Regras:\n` +
        `- suggestions deve ter de 4 a 8 itens curtos e acionáveis.\n` +
        `- mandatory_documents deve citar permissões, APR, inspeções, bloqueios ou treinamentos quando necessário.\n` +
        `- respeitar flags já informadas pelo usuário.\n` +
        `- priorizar controles de engenharia, administrativos e validações antes de liberar a execução.\n` +
        `- Retorne somente JSON válido.`,
    });

    const resolvedFlags = {
      trabalho_altura:
        params.trabalho_altura ??
        this.normalizeBoolean(generated.flags?.trabalho_altura) ??
        false,
      espaco_confinado:
        params.espaco_confinado ??
        this.normalizeBoolean(generated.flags?.espaco_confinado) ??
        false,
      trabalho_quente:
        params.trabalho_quente ??
        this.normalizeBoolean(generated.flags?.trabalho_quente) ??
        false,
      eletricidade:
        params.eletricidade ??
        this.normalizeBoolean(generated.flags?.eletricidade) ??
        false,
      escavacao:
        params.escavacao ??
        this.normalizeBoolean(generated.flags?.escavacao) ??
        false,
    };
    const suggestedActions =
      this.normalizeStringArray(generated.suggestions, 8) || [];
    const mandatoryDocuments =
      this.normalizeStringArray(generated.mandatory_documents, 6) || [];
    const allowedParticipantIds = new Set(
      draftContext.participants.map((item) => item.id),
    );
    const allowedToolIds = new Set(draftContext.tools.map((item) => item.id));
    const allowedMachineIds = new Set(
      draftContext.machines.map((item) => item.id),
    );
    const selectedParticipants = Array.from(
      new Set([
        params.responsavel_id,
        ...this.normalizeIdSelections(
          generated.participants,
          allowedParticipantIds,
          5,
        ),
      ]),
    ).filter((id) => allowedParticipantIds.has(id));
    const selectedTools = this.normalizeIdSelections(
      generated.tools,
      allowedToolIds,
      4,
    );
    const selectedMachines = this.normalizeIdSelections(
      generated.machines,
      allowedMachineIds,
      4,
    );
    const riskLevel = this.normalizeRiskLevel(generated.riskLevel);
    const confidence = this.normalizeConfidence(generated.confidence);
    const notes = this.normalizeStringArray(generated.notes, 10);
    const mandatoryChecklists = this.buildMandatoryPtChecklistSuggestions({
      contextText,
      flags: resolvedFlags,
      templateSuggestions: templateChecklistSuggestions,
    });
    const suggestedRisks = Array.from(
      new Set(
        this.resolveActiveActivityProfiles(contextText)
          .flatMap((profile) => profile.riskHints || [])
          .filter(Boolean),
      ),
    )
      .slice(0, 6)
      .map((label) => ({ label }));
    const resourceHints = [
      selectedTools.length
        ? `Ferramentas sugeridas: ${draftContext.tools
            .filter((item) => selectedTools.includes(item.id))
            .map((item) => item.label)
            .join('; ')}.`
        : null,
      selectedMachines.length
        ? `Máquinas associadas: ${draftContext.machines
            .filter((item) => selectedMachines.includes(item.id))
            .map((item) => item.label)
            .join('; ')}.`
        : null,
      mandatoryChecklists.length
        ? `Checklists mandatórios/sugeridos: ${mandatoryChecklists
            .map((item) => item.label)
            .join('; ')}.`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      draft: {
        step: 1,
        values: {
          numero: this.generateDocumentNumber('PT'),
          titulo: String(
            generated.title || params.title || 'PT Assistida',
          ).trim(),
          descricao: String(
            generated.description || params.description || '',
          ).trim(),
          status: 'Pendente',
          company_id: companyId,
          site_id: params.site_id,
          responsavel_id: params.responsavel_id,
          executantes: selectedParticipants.length
            ? selectedParticipants
            : [params.responsavel_id],
          ...resolvedFlags,
          analise_risco_rapida_observacoes: this.buildPtObservationText({
            summary:
              String(generated.summary || '').trim() ||
              'PT assistida gerada pela SOPHIE.',
            riskLevel,
            suggestedActions,
            mandatoryDocuments,
          }).concat(resourceHints ? `\n${resourceHints}` : ''),
        },
        signatures: {},
      },
      summary:
        String(generated.summary || '').trim() ||
        'PT inicial gerada pela SOPHIE com criticidade e controles prioritários.',
      riskLevel,
      suggestedActions,
      suggestedResources: {
        participants: draftContext.participants.filter((item) =>
          (selectedParticipants.length
            ? selectedParticipants
            : [params.responsavel_id]
          ).includes(item.id),
        ),
        tools: draftContext.tools.filter((item) =>
          selectedTools.includes(item.id),
        ),
        machines: draftContext.machines.filter((item) =>
          selectedMachines.includes(item.id),
        ),
      },
      suggestedRisks,
      mandatoryChecklists,
      confidence,
      notes,
      message:
        'Rascunho de PT gerado pela SOPHIE. Revise as flags críticas, conclua os checklists mandatórios e valide assinaturas antes da liberação.',
    };
  }

  async createChecklist(
    params: CreateAssistedChecklistDto,
  ): Promise<CreateChecklistAutomationResponse> {
    if (!params.site_id || !params.inspetor_id) {
      throw new BadRequestException(
        'site_id e inspetor_id são obrigatórios para criar checklist pela SOPHIE.',
      );
    }

    const generated = await this.generateChecklist(
      params as GenerateChecklistDto,
    );
    const subject =
      String(params.titulo || '').trim() ||
      String(params.maquina || '').trim() ||
      String(params.equipamento || '').trim() ||
      generated.titulo ||
      'Checklist SST';

    const createDto: CreateChecklistDto = {
      titulo: generated.titulo || subject,
      descricao:
        String(params.descricao || '').trim() ||
        `Checklist assistido pela SOPHIE para ${subject}.`,
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
    const sourceSnapshot = await this.buildNonConformitySourceSnapshot(params);
    const resolvedSiteId = sourceSnapshot.siteId || params.site_id;
    if (!resolvedSiteId) {
      throw new BadRequestException(
        'site_id é obrigatório para criar não conformidade pela SOPHIE.',
      );
    }

    const title =
      String(sourceSnapshot.title || params.title || '').trim() ||
      'Não conformidade SST';
    const description =
      String(sourceSnapshot.description || params.description || '').trim() ||
      'Desvio operacional identificado e pendente de tratamento.';
    const localSetorArea =
      String(
        sourceSnapshot.localSetorArea || params.local_setor_area || '',
      ).trim() || 'Área operacional';
    const responsavelArea =
      String(params.responsavel_area || '').trim() || 'Responsável da área';
    const tipo = String(params.tipo || '').trim() || 'DESVIO_OPERACIONAL';

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
      action_plan?: Array<Record<string, unknown>>;
      confidence?: SophieConfidence;
      notes?: string[];
    };

    const generated =
      await this.generateStructuredJson<GeneratedNonConformityDraft>({
        task: 'generic',
        maxTokens: 1400,
        prompt:
          `Crie um rascunho estruturado de Não Conformidade (NC) para SST em ambiente corporativo.\n\n` +
          `Contexto:\n` +
          `- Título: ${title}\n` +
          `- Descrição: ${description}\n` +
          `- Local/setor/área: ${localSetorArea}\n` +
          `- Tipo sugerido: ${tipo}\n` +
          `- Origem do desvio: ${sourceSnapshot.sourceType}\n` +
          `${
            sourceSnapshot.promptSections.length
              ? `- Dados adicionais da origem:\n${sourceSnapshot.promptSections.map((entry) => `  • ${entry}`).join('\n')}\n`
              : ''
          }\n` +
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
          `  "action_plan": [{"title": string, "owner": string, "priority": "low|medium|high|critical", "timeline": string, "type": "immediate|corrective|preventive"}],\n` +
          `  "confidence": "low|medium|high",\n` +
          `  "notes": string[]\n` +
          `}\n\n` +
          `Regras:\n` +
          `- Não inventar medições numéricas.\n` +
          `- Se o contexto for insuficiente, assumir um desvio operacional plausível e declarar isso em notes.\n` +
          `- descricao, evidencia_observada e condicao_insegura devem ser úteis para cadastro real.\n` +
          `- acao_imediata_descricao e acao_definitiva_descricao devem ser executáveis.\n` +
          `- action_plan deve trazer de 2 a 4 ações, com responsável sugerido e horizonte de prazo.\n` +
          `- Retorne somente JSON válido.`,
      });

    const today = this.getTodayIsoDate();
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const normalizedRiskLevel = this.normalizeRiskLevel(generated.risco_nivel);
    const confidence = this.normalizeConfidence(generated.confidence);
    const notes = [
      ...(this.normalizeStringArray(generated.notes) || []),
      ...sourceSnapshot.notes,
    ];
    const actionPlan = this.normalizeActionPlan(generated.action_plan, [
      {
        title:
          String(generated.acao_imediata_descricao || '').trim() ||
          'Executar contenção imediata do desvio.',
        owner: responsavelArea,
        priority:
          normalizedRiskLevel === 'Crítico'
            ? 'critical'
            : normalizedRiskLevel === 'Alto'
              ? 'high'
              : 'medium',
        timeline: 'Imediato',
        type: 'immediate',
      },
      {
        title:
          String(generated.acao_definitiva_descricao || '').trim() ||
          'Implementar correção definitiva do desvio.',
        owner: 'Gestão SST',
        priority: normalizedRiskLevel === 'Crítico' ? 'critical' : 'high',
        timeline: 'Até 7 dias',
        type: 'corrective',
      },
      {
        title:
          String(generated.acao_preventiva_medidas || '').trim() ||
          'Reforçar monitoramento, orientação e prevenção recorrente.',
        owner: 'Gestão operacional',
        priority: 'medium',
        timeline: 'Até 15 dias',
        type: 'preventive',
      },
    ]);
    const importedEvidence = sourceSnapshot.evidenceAttachments
      .map((item) => item.url)
      .filter(Boolean)
      .slice(0, MAX_IMPORTED_EVIDENCE_ATTACHMENTS);

    const createDto: CreateNonConformityDto = {
      codigo_nc: this.generateNonConformityCode(),
      tipo: String(generated.tipo || tipo).trim() || 'DESVIO_OPERACIONAL',
      data_identificacao: today,
      site_id: resolvedSiteId,
      local_setor_area: localSetorArea,
      atividade_envolvida: title,
      responsavel_area: responsavelArea,
      auditor_responsavel: 'SOPHIE',
      classificacao: this.normalizeStringArray(generated.classificacao) || [
        'SOPHIE',
        'NC_ASSISTIDA',
        sourceSnapshot.sourceType.toUpperCase(),
      ],
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
        String(
          generated.requisito_item || 'Gerenciamento de riscos ocupacionais',
        ).trim() || 'Gerenciamento de riscos ocupacionais',
      risco_perigo:
        String(generated.risco_perigo || 'Desvio operacional').trim() ||
        'Desvio operacional',
      risco_associado:
        String(
          generated.risco_associado || 'Persistência de condição insegura',
        ).trim() || 'Persistência de condição insegura',
      risco_nivel: normalizedRiskLevel,
      causa: this.normalizeStringArray(generated.causa) || [
        'FALHA_DE_CONTROLE_OPERACIONAL',
      ],
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
      acao_definitiva_responsavel: actionPlan[1]?.owner || 'Gestão SST',
      acao_preventiva_medidas:
        String(generated.acao_preventiva_medidas || '').trim() ||
        'Revisar controles, orientar equipe e reforçar monitoramento.',
      status: 'ABERTA',
      anexos: importedEvidence.length ? importedEvidence : undefined,
      verificacao_evidencias: importedEvidence.length
        ? `${importedEvidence.length} evidência(s) importada(s) automaticamente da origem ${sourceSnapshot.sourceType}.`
        : undefined,
      observacoes_gerais: [
        'NC criada pela SOPHIE em modo assistido.',
        `Origem da análise: ${sourceSnapshot.sourceType}.`,
        importedEvidence.length
          ? `Evidências importadas automaticamente: ${importedEvidence.length}.`
          : null,
        confidence ? `Confiança da geração: ${confidence}.` : null,
        ...notes,
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
        sourceType: sourceSnapshot.sourceType,
        actionPlan,
        evidenceCount: importedEvidence.length,
        evidenceAttachments: sourceSnapshot.evidenceAttachments.slice(
          0,
          MAX_IMPORTED_EVIDENCE_ATTACHMENTS,
        ),
        confidence,
        notes: notes.length ? notes : undefined,
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

      interaction.response = data as unknown as any;
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
  async generateJson<T>(
    prompt: string,
    schemaOrMaxTokens: string | number,
  ): Promise<T> {
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
