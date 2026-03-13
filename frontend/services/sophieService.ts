import api from '@/lib/api';
import type { Checklist } from './checklistsService';
import { isAiEnabled } from '@/lib/featureFlags';

const AI_STATUS_TIMEOUT_MS = 20000;
const AI_DEFAULT_TIMEOUT_MS = 45000;
const AI_CHAT_TIMEOUT_MS = 90000;
const AI_IMAGE_TIMEOUT_MS = 120000;

function assertAiEnabled() {
  if (!isAiEnabled()) {
    throw new Error('IA desativada neste ambiente (FEATURE_AI_ENABLED=false).');
  }
}

export interface SophieResponse {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  needsHumanReview: boolean;
  humanReviewReason?: string;
  humanReviewReasons?: string[];
  sources: string[];
  warnings: string[];
  toolsUsed: string[];
  suggestedActions?: Array<{
    label: string;
    href?: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  interactionId?: string;
  status?: 'success' | 'error' | 'needs_review' | 'rate_limited';
  timestamp: string;
}

export interface SophieConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SophieHistoryItem {
  id: string;
  question: string;
  response: Omit<SophieResponse, 'interactionId' | 'status' | 'timestamp'> | null;
  status: 'success' | 'error' | 'needs_review' | 'rate_limited';
  confidence: 'high' | 'medium' | 'low' | null;
  needs_human_review: boolean | null;
  model: string | null;
  latency_ms: number | null;
  tools_called: string[] | null;
  created_at: string;
}

export interface AnalyzePtData {
  titulo: string;
  descricao: string;
  trabalho_altura: boolean;
  espaco_confinado: boolean;
  trabalho_quente: boolean;
  eletricidade: boolean;
}

export interface GenerateChecklistPayload {
  titulo?: string;
  descricao?: string;
  equipamento?: string;
  maquina?: string;
  data?: string;
  site_id: string;
  inspetor_id: string;
  is_modelo?: boolean;
}

export interface CreateAssistedChecklistPayload
  extends GenerateChecklistPayload {
  categoria?: string;
  periodicidade?: string;
  nivel_risco_padrao?: string;
}

export interface CreateAssistedAprPayload {
  title?: string;
  description?: string;
  activity?: string;
  process?: string;
  equipment?: string;
  machine?: string;
  site_id: string;
  company_id?: string;
  elaborador_id: string;
  site_name?: string;
  company_name?: string;
}

export interface CreateAssistedPtPayload {
  title?: string;
  description?: string;
  site_id: string;
  company_id?: string;
  responsavel_id: string;
  site_name?: string;
  company_name?: string;
  trabalho_altura?: boolean;
  espaco_confinado?: boolean;
  trabalho_quente?: boolean;
  eletricidade?: boolean;
  escavacao?: boolean;
}

export interface GenerateDdsPayload {
  tema?: string;
  contexto?: string;
}

export interface CreateAssistedDdsPayload extends GenerateDdsPayload {
  data?: string;
  is_modelo?: boolean;
  site_id: string;
  facilitador_id: string;
  participants?: string[];
}

export interface GenerateMonthlyReportPayload {
  mes?: number;
  ano?: number;
}

export interface CreateChecklistAutomationResponse {
  checklist: {
    id: string;
    titulo?: string;
  };
  generation: {
    titulo: string;
    confidence?: 'high' | 'medium' | 'low';
  };
  persisted: true;
  message: string;
}

export interface CreateDdsAutomationResponse {
  dds: {
    id: string;
    tema?: string;
  };
  generation: {
    tema: string;
    confidence?: 'high' | 'medium' | 'low';
  };
  persisted: true;
  message: string;
}

export interface CreateNonConformityPayload {
  title?: string;
  description?: string;
  site_id?: string;
  local_setor_area?: string;
  responsavel_area?: string;
  tipo?: string;
  source_type?: 'manual' | 'image' | 'checklist' | 'inspection';
  source_reference?: string;
  source_context?: string;
  image_analysis_summary?: string;
  image_risks?: string[];
  image_actions?: string[];
  image_notes?: string;
}

export interface SophieDraftResponse {
  draft: {
    step: number;
    values: Record<string, unknown>;
    signatures: Record<string, { data: string; type: string }>;
  };
  summary: string;
  suggestedActions: string[];
  suggestedResources?: {
    activities?: Array<{ id: string; label: string }>;
    participants?: Array<{ id: string; label: string }>;
    tools?: Array<{ id: string; label: string }>;
    machines?: Array<{ id: string; label: string }>;
  };
  suggestedRisks?: Array<{ id?: string; label: string; category?: string }>;
  mandatoryChecklists?: Array<{
    id: string;
    label: string;
    reason: string;
    source: 'template' | 'pt-group';
  }>;
  confidence?: 'high' | 'medium' | 'low';
  notes?: string[];
  message: string;
}

export interface GeneratePtDraftAutomationResponse extends SophieDraftResponse {
  riskLevel: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
  suggestedResources?: {
    participants: Array<{ id: string; label: string }>;
    tools: Array<{ id: string; label: string }>;
    machines: Array<{ id: string; label: string }>;
  };
}

export interface SophieActionPlanItem {
  title: string;
  owner: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timeline: string;
  type: 'immediate' | 'corrective' | 'preventive';
}

export interface CreateNonConformityAutomationResponse {
  nonConformity: {
    id: string;
    codigo_nc?: string;
    tipo?: string;
  };
  generation: {
    title: string;
    riskLevel: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
    sourceType: 'manual' | 'image' | 'checklist' | 'inspection';
    actionPlan: SophieActionPlanItem[];
    evidenceCount?: number;
    evidenceAttachments?: Array<{ url: string; label: string }>;
    confidence?: 'high' | 'medium' | 'low';
    notes?: string[];
  };
  persisted: true;
  message: string;
}

export interface QueueMonthlyReportAutomationResponse {
  reportType: 'monthly';
  year: number;
  month: number;
  jobId: string | number | undefined;
  statusUrl: string;
  queued: boolean;
  message: string;
}

export interface ImageRiskAnalysis {
  summary: string;
  riskLevel: 'Baixo' | 'Medio' | 'Alto' | 'Critico' | 'Médio' | 'Crítico';
  imminentRisks: string[];
  immediateActions: string[];
  ppeRecommendations: string[];
  notes: string;
}

export const sophieService = {
  async getStatus() {
    assertAiEnabled();
    const { data } = await api.get('/ai/status', {
      timeout: AI_STATUS_TIMEOUT_MS,
    });
    return data;
  },

  async chat(
    question: string,
    history: SophieConversationMessage[] = [],
  ): Promise<SophieResponse> {
    assertAiEnabled();
    const { data } = await api.post<SophieResponse>('/ai/sst/chat', {
      question,
      history,
    }, {
      timeout: AI_CHAT_TIMEOUT_MS,
    });
    return data;
  },

  async getHistory(limit = 20): Promise<SophieHistoryItem[]> {
    assertAiEnabled();
    const { data } = await api.get<SophieHistoryItem[]>(`/ai/sst/history?limit=${limit}`, {
      timeout: AI_DEFAULT_TIMEOUT_MS,
    });
    return data;
  },

  async getInsights() {
    assertAiEnabled();
    const { data } = await api.post('/ai/insights', undefined, {
      timeout: AI_DEFAULT_TIMEOUT_MS,
    });
    return data;
  },

  async analyzeApr(description: string) {
    assertAiEnabled();
    const { data } = await api.post('/ai/analyze-apr', { description }, {
      timeout: AI_DEFAULT_TIMEOUT_MS,
    });
    return data;
  },

  async analyzePt(payload: AnalyzePtData) {
    assertAiEnabled();
    const { data } = await api.post('/ai/analyze-pt', payload, {
      timeout: AI_DEFAULT_TIMEOUT_MS,
    });
    return data;
  },

  async analyzeChecklist(id: string) {
    assertAiEnabled();
    const { data } = await api.get(`/ai/analyze-checklist/${id}`, {
      timeout: AI_DEFAULT_TIMEOUT_MS,
    });
    return data;
  },

  async generateChecklist(payload: GenerateChecklistPayload, companyId?: string) {
    assertAiEnabled();
    const { data } = await api.post<Checklist>('/ai/generate-checklist', payload, {
      timeout: AI_DEFAULT_TIMEOUT_MS,
      headers: companyId ? { 'x-company-id': companyId } : undefined,
    });
    return data;
  },

  async generateDds() {
    assertAiEnabled();
    const { data } = await api.post('/ai/generate-dds', undefined, {
      timeout: AI_DEFAULT_TIMEOUT_MS,
    });
    return data;
  },

  async createChecklist(
    payload: CreateAssistedChecklistPayload,
    companyId?: string,
  ) {
    assertAiEnabled();
    const { data } = await api.post<CreateChecklistAutomationResponse>('/ai/create-checklist', payload, {
      timeout: AI_DEFAULT_TIMEOUT_MS,
      headers: companyId ? { 'x-company-id': companyId } : undefined,
    });
    return data;
  },

  async generateAprDraft(
    payload: CreateAssistedAprPayload,
    companyId?: string,
  ) {
    assertAiEnabled();
    const { data } = await api.post<SophieDraftResponse>('/ai/generate-apr-draft', payload, {
      timeout: AI_DEFAULT_TIMEOUT_MS,
      headers: companyId ? { 'x-company-id': companyId } : undefined,
    });
    return data;
  },

  async generatePtDraft(
    payload: CreateAssistedPtPayload,
    companyId?: string,
  ) {
    assertAiEnabled();
    const { data } = await api.post<GeneratePtDraftAutomationResponse>('/ai/generate-pt-draft', payload, {
      timeout: AI_DEFAULT_TIMEOUT_MS,
      headers: companyId ? { 'x-company-id': companyId } : undefined,
    });
    return data;
  },

  async createDds(
    payload: CreateAssistedDdsPayload,
    companyId?: string,
  ) {
    assertAiEnabled();
    const { data } = await api.post<CreateDdsAutomationResponse>('/ai/create-dds', payload, {
      timeout: AI_DEFAULT_TIMEOUT_MS,
      headers: companyId ? { 'x-company-id': companyId } : undefined,
    });
    return data;
  },

  async createNonConformity(
    payload: CreateNonConformityPayload,
    companyId?: string,
  ) {
    assertAiEnabled();
    const { data } = await api.post<CreateNonConformityAutomationResponse>(
      '/ai/create-nonconformity',
      payload,
      {
        timeout: AI_DEFAULT_TIMEOUT_MS,
        headers: companyId ? { 'x-company-id': companyId } : undefined,
      },
    );
    return data;
  },

  async queueMonthlyReport(
    payload: GenerateMonthlyReportPayload,
    companyId?: string,
  ) {
    assertAiEnabled();
    const { data } = await api.post<QueueMonthlyReportAutomationResponse>('/ai/generate-monthly-report', payload, {
      timeout: AI_DEFAULT_TIMEOUT_MS,
      headers: companyId ? { 'x-company-id': companyId } : undefined,
    });
    return data;
  },

  async analyzeImageRisk(image: File, context?: string): Promise<ImageRiskAnalysis> {
    assertAiEnabled();
    const formData = new FormData();
    formData.append('image', image);
    if (context?.trim()) {
      formData.append('context', context.trim());
    }
    const { data } = await api.post<ImageRiskAnalysis>('/ai/sst/analyze-image-risk', formData, {
      timeout: AI_IMAGE_TIMEOUT_MS,
    });
    return data;
  },
};
