export type SophieConfidence = 'low' | 'medium' | 'high';

export type SophieTask =
  | 'insights'
  | 'apr'
  | 'pt'
  | 'checklist'
  | 'dds'
  | 'generic'
  | 'image-analysis';

export type InsightCard = {
  type: 'warning' | 'success' | 'info';
  title: string;
  message: string;
  action: string;
};

export type InsightsResponse = {
  safetyScore: number;
  summary: string;
  timestamp: string;
  insights: InsightCard[];
  confidence?: SophieConfidence;
  notes?: string[];
};

export type AnalyzeAprResponse = {
  risks: string[];
  epis: string[];
  explanation: string;
  confidence?: SophieConfidence;
  notes?: string[];
};

export type AnalyzePtResponse = {
  summary: string;
  riskLevel: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
  suggestions: string[];
  confidence?: SophieConfidence;
  notes?: string[];
};

export type AnalyzeChecklistResponse = {
  summary: string;
  suggestions: string[];
  confidence?: SophieConfidence;
  notes?: string[];
};

export type GenerateDdsResponse = {
  tema: string;
  conteudo: string;
  explanation: string;
  confidence?: SophieConfidence;
  notes?: string[];
};

export type GenerateChecklistResponse = {
  id: string;
  titulo: string;
  itens: Array<{ item: string }>;
  confidence?: SophieConfidence;
  notes?: string[];
};