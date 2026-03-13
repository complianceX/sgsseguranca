export type SophieConfidence = 'low' | 'medium' | 'high';

export type SophieRiskBand = 'low' | 'moderate' | 'high' | 'critical';

export type SophieAutomationDecision = {
  phase: 'phase2';
  riskBand: SophieRiskBand;
  requiresHumanApproval: boolean;
  recommendedFlow: 'auto' | 'review_required';
  reasons: string[];
};

export type SophieAutomationOutcome = {
  phase2Enabled: boolean;
  ncAutoOpened?: boolean;
  ncId?: string;
  ncCode?: string;
  reasons?: string[];
};

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
  automation?: SophieAutomationDecision;
};

export type AnalyzeChecklistResponse = {
  summary: string;
  suggestions: string[];
  confidence?: SophieConfidence;
  notes?: string[];
  automation?: SophieAutomationOutcome;
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

export type CreateChecklistAutomationResponse = {
  checklist: unknown;
  generation: GenerateChecklistResponse;
  persisted: true;
  message: string;
};

export type CreateDdsAutomationResponse = {
  dds: unknown;
  generation: GenerateDdsResponse;
  persisted: true;
  message: string;
};

export type CreateNonConformityAutomationResponse = {
  nonConformity: unknown;
  generation: {
    title: string;
    riskLevel: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
    confidence?: SophieConfidence;
    notes?: string[];
  };
  persisted: true;
  message: string;
};

export type QueueMonthlyReportAutomationResponse = {
  reportType: 'monthly';
  year: number;
  month: number;
  jobId: string | number | undefined;
  statusUrl: string;
  queued: boolean;
  message: string;
};
