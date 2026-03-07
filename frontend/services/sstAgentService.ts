import api from '@/lib/api';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SuggestedAction {
  label: string;
  href?: string;
  priority: 'high' | 'medium' | 'low';
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type AiInteractionStatus = 'success' | 'error' | 'needs_review' | 'rate_limited';

export interface SstChatResponse {
  answer: string;
  confidence: ConfidenceLevel;
  needsHumanReview: boolean;
  humanReviewReason?: string;
  humanReviewReasons?: string[];
  sources: string[];
  suggestedActions: SuggestedAction[];
  warnings: string[];
  toolsUsed: string[];
  interactionId: string;
  status: AiInteractionStatus;
  timestamp: string;
}

export interface SstHistoryItem {
  id: string;
  question: string;
  response: Omit<SstChatResponse, 'interactionId' | 'status' | 'timestamp'> | null;
  status: AiInteractionStatus;
  confidence: ConfidenceLevel | null;
  needs_human_review: boolean | null;
  model: string | null;
  latency_ms: number | null;
  tools_called: string[] | null;
  created_at: string;
}

export const sstAgentService = {
  async chat(question: string, history: ConversationMessage[] = []): Promise<SstChatResponse> {
    const { data } = await api.post<SstChatResponse>('/ai/sst/chat', { question, history });
    return data;
  },

  async getHistory(limit = 20): Promise<SstHistoryItem[]> {
    const { data } = await api.get<SstHistoryItem[]>(`/ai/sst/history?limit=${limit}`);
    return data;
  },
};
