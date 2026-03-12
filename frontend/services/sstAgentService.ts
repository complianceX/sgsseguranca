import {
  sophieService,
  type SophieConversationMessage as ConversationMessage,
  type SophieHistoryItem as SstHistoryItem,
  type SophieResponse as SstChatResponse,
} from './sophieService';

export type {
  ConversationMessage,
  SstHistoryItem,
  SstChatResponse,
};

export type SuggestedAction = NonNullable<SstChatResponse['suggestedActions']>[number];
export type ConfidenceLevel = SstChatResponse['confidence'];
export type AiInteractionStatus = NonNullable<SstChatResponse['status']>;

export const sstAgentService = {
  async chat(question: string, history: ConversationMessage[] = []): Promise<SstChatResponse> {
    return sophieService.chat(question, history);
  },

  async getHistory(limit = 20): Promise<SstHistoryItem[]> {
    return sophieService.getHistory(limit);
  },
};
