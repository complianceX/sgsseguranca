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

export type SophieDraftPayload = {
  step: number;
  values: Record<string, unknown>;
  signatures: Record<string, { data: string; type: string }>;
};

export type SophieSuggestedRisk = {
  id?: string;
  label: string;
  category?: string;
};

export type SophieSuggestedChecklist = {
  id: string;
  label: string;
  reason: string;
  source: 'template' | 'pt-group';
};

export type GenerateAprDraftResponse = {
  draft: SophieDraftPayload;
  summary: string;
  suggestedActions: string[];
  suggestedResources?: {
    activities: Array<{ id: string; label: string }>;
    participants: Array<{ id: string; label: string }>;
    tools: Array<{ id: string; label: string }>;
    machines: Array<{ id: string; label: string }>;
  };
  suggestedRisks?: SophieSuggestedRisk[];
  mandatoryChecklists?: SophieSuggestedChecklist[];
  confidence?: SophieConfidence;
  notes?: string[];
  message: string;
};

export type GeneratePtDraftResponse = {
  draft: SophieDraftPayload;
  summary: string;
  riskLevel: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
  suggestedActions: string[];
  suggestedResources?: {
    participants: Array<{ id: string; label: string }>;
    tools: Array<{ id: string; label: string }>;
    machines: Array<{ id: string; label: string }>;
  };
  suggestedRisks?: SophieSuggestedRisk[];
  mandatoryChecklists?: SophieSuggestedChecklist[];
  confidence?: SophieConfidence;
  notes?: string[];
  message: string;
};

export type SophieActionPlanItem = {
  title: string;
  owner: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timeline: string;
  type: 'immediate' | 'corrective' | 'preventive';
};

export type CreateNonConformityAutomationResponse = {
  nonConformity: unknown;
  generation: {
    title: string;
    riskLevel: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
    sourceType: 'manual' | 'image' | 'checklist' | 'inspection';
    actionPlan: SophieActionPlanItem[];
    evidenceCount?: number;
    evidenceAttachments?: Array<{ url: string; label: string }>;
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
