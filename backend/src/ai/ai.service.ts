import {
  Injectable,
  Logger,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Scope,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { getSophieSystemPrompt } from './sophie.prompt-resolver';
import {
  AnalyzeAprResponse,
  AnalyzeChecklistResponse,
  AnalyzePtResponse,
  GenerateChecklistResponse,
  GenerateDdsResponse,
  InsightCard,
  InsightsResponse,
  SophieConfidence,
  SophieTask,
} from './sophie.types';
import type { CreateNonConformityDto } from '../nonconformities/dto/create-nonconformity.dto';

const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const MAX_JSON_TOKENS = 1600;
const PHASE2_DEFAULT_NC_THRESHOLD = 3;

@Injectable({ scope: Scope.REQUEST })
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openaiApiKey: string | null;
  private readonly openaiModel: string;

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
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim() || null;
    this.openaiModel =
      this.configService.get<string>('OPENAI_MODEL')?.trim() || DEFAULT_OPENAI_MODEL;

    this.logger.log(`✅ SOPHIE AiService initialized (model=${this.openaiModel})`);
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.openaiModel,
        temperature: 0.2,
        max_tokens: params.maxTokens ?? MAX_JSON_TOKENS,
        messages: [
          {
            role: 'system',
            content:
              `${systemPrompt}\n\n` +
              'Responda SOMENTE em JSON valido, sem markdown, sem comentarios e sem texto fora do objeto JSON.',
          },
          { role: 'user', content: params.user },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as OpenAiChatCompletion;
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

  async generateDds(): Promise<GenerateDdsResponse> {
    const tenantId = this.getTenantIdOrThrow();
    await this.enforceRateLimit(tenantId);

    const startTime = Date.now();
    const interaction = this.interactionRepo.create({
      tenant_id: tenantId,
      user_id: this.getCurrentUserId(),
      question: 'GENERATE_DDS',
      model: this.openaiModel,
      provider: 'openai',
      status: AiInteractionStatus.SUCCESS,
    });

    try {
      const { data, inputTokens, outputTokens } = await this.callOpenAiJson<GenerateDdsResponse>({
        task: 'dds',
        user: `Gere um DDS (Diálogo Diario de Seguranca) pronto para uso.\n\nFormato JSON:\n{\n  \"tema\": string,\n  \"conteudo\": string,\n  \"explanation\": string,\n  \"confidence\": \"low|medium|high\",\n  \"notes\": string[]\n}\n\nRegras:\n- conteudo em portugues, pratico, com 6 a 10 bullets.\n- incluir: objetivo, perigos, controles (hierarquia), EPIs, NRs relevantes.\n- evite jargoes e mantenha linguagem de campo.\n- Retorne APENAS JSON valido, sem markdown, sem comentarios e sem texto fora do JSON.`,
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
        tema: 'Seguranca no Trabalho',
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
