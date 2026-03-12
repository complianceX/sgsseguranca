import {
  sophieService,
  type SophieResponse as AiResponse,
  type AnalyzePtData,
  type GenerateChecklistPayload,
  type ImageRiskAnalysis,
  type SophieConversationMessage,
} from './sophieService';

export type { AiResponse, AnalyzePtData, GenerateChecklistPayload, ImageRiskAnalysis };

export const aiService = {
  chat: async (
    message: string,
    options?: {
      conversationHistory?: SophieConversationMessage[];
    },
  ) =>
    sophieService.chat(message, options?.conversationHistory || []),

  getInsights: sophieService.getInsights,
  analyzeApr: sophieService.analyzeApr,
  analyzePt: sophieService.analyzePt,
  analyzeChecklist: sophieService.analyzeChecklist,
  generateChecklist: sophieService.generateChecklist,
  generateDds: sophieService.generateDds,
  analyzeImageRisk: sophieService.analyzeImageRisk,
};
