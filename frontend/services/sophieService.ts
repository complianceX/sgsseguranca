import api from '@/lib/api';
import type { Checklist } from './checklistsService';
import { isAiEnabled } from '@/lib/featureFlags';

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
  site_id: string;
  local_setor_area?: string;
  responsavel_area?: string;
  tipo?: string;
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
    const { data } = await api.get('/ai/status');
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
    });
    return data;
  },

  async getHistory(limit = 20): Promise<SophieHistoryItem[]> {
    assertAiEnabled();
    const { data } = await api.get<SophieHistoryItem[]>(`/ai/sst/history?limit=${limit}`);
    return data;
  },

  async getInsights() {
    assertAiEnabled();
    const { data } = await api.post('/ai/insights');
    return data;
  },

  async analyzeApr(description: string) {
    assertAiEnabled();
    const { data } = await api.post('/ai/analyze-apr', { description });
    return data;
  },

  async analyzePt(payload: AnalyzePtData) {
    assertAiEnabled();
    const { data } = await api.post('/ai/analyze-pt', payload);
    return data;
  },

  async analyzeChecklist(id: string) {
    assertAiEnabled();
    const { data } = await api.get(`/ai/analyze-checklist/${id}`);
    return data;
  },

  async generateChecklist(payload: GenerateChecklistPayload, companyId?: string) {
    assertAiEnabled();
    const { data } = await api.post<Checklist>('/ai/generate-checklist', payload, {
      headers: companyId ? { 'x-company-id': companyId } : undefined,
    });
    return data;
  },

  async generateDds() {
    assertAiEnabled();
    const { data } = await api.post('/ai/generate-dds');
    return data;
  },

  async createChecklist(
    payload: CreateAssistedChecklistPayload,
    companyId?: string,
  ) {
    assertAiEnabled();
    const { data } = await api.post<CreateChecklistAutomationResponse>('/ai/create-checklist', payload, {
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
    const { data } = await api.post<ImageRiskAnalysis>('/ai/sst/analyze-image-risk', formData);
    return data;
  },
};
