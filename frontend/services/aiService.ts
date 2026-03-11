import api from '@/lib/api';
import type { Checklist } from './checklistsService';

export interface AiResponse {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  needsHumanReview: boolean;
  sources: string[];
  warnings: string[];
  toolsUsed: string[];
  timestamp: string;
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

export interface ImageRiskAnalysis {
  summary: string;
  riskLevel: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
  imminentRisks: string[];
  immediateActions: string[];
  ppeRecommendations: string[];
  notes: string;
}

export const aiService = {
  getElevenLabsSignedUrl: async (agentId?: string) => {
    const response = await api.get<{
      mode: 'signed' | 'public' | 'unavailable';
      agentId: string | null;
      signedUrl: string | null;
      reason?: string;
    }>(
      '/ai/sst/voice/signed-url',
      {
        params: agentId ? { agentId } : undefined,
      },
    );
    return response.data;
  },

  chat: async (
    message: string,
    options?: {
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
  ) => {
    const response = await api.post<AiResponse>('/ai/sst/chat', {
      question: message,
      history: options?.conversationHistory || [],
    });
    return response.data;
  },

  getInsights: async () => {
    const response = await api.post('/ai/insights');
    return response.data;
  },

  analyzeApr: async (description: string) => {
    const response = await api.post('/ai/analyze-apr', { description });
    return response.data;
  },

  analyzePt: async (data: AnalyzePtData) => {
    const response = await api.post('/ai/analyze-pt', data);
    return response.data;
  },

  analyzeChecklist: async (id: string) => {
    const response = await api.get(`/ai/analyze-checklist/${id}`);
    return response.data;
  },

  generateChecklist: async (payload: GenerateChecklistPayload, companyId?: string) => {
    const response = await api.post<Checklist>('/ai/generate-checklist', payload, {
      headers: companyId ? { 'x-company-id': companyId } : undefined,
    });
    return response.data;
  },

  generateDds: async () => {
    const response = await api.post('/ai/generate-dds');
    return response.data;
  },

  analyzeImageRisk: async (
    image: File,
    context?: string,
  ): Promise<ImageRiskAnalysis> => {
    const formData = new FormData();
    formData.append('image', image);
    if (context && context.trim()) {
      formData.append('context', context.trim());
    }

    const response = await api.post('/ai/sst/analyze-image-risk', formData);
    return response.data as ImageRiskAnalysis;
  },
};
