// TODO: Fase 3 — AiService deve depender desta interface,
//   não dos services concretos
export const ISstContextProvider = Symbol('ISstContextProvider');

export interface RiskSummary {
  id: string;
  nome: string;
  categoria: string;
}

export interface EpiSummary {
  id: string;
  nome: string;
  ca: string;
}

export interface ActivitySummary {
  id: string;
  nome: string;
}

export interface ChecklistTemplateSummary {
  id: string;
  titulo: string;
  status?: string;
}

export interface ISstContextProvider {
  getRisks(
    tenantId: string,
    options?: { take?: number },
  ): Promise<RiskSummary[]>;
  getEpis(tenantId: string, options?: { take?: number }): Promise<EpiSummary[]>;
  getActivities(
    tenantId: string,
    options?: { take?: number },
  ): Promise<ActivitySummary[]>;
  getPendingNonConformities(
    tenantId: string,
    options?: { take?: number },
  ): Promise<{ total: number; items: { id: string; status: string }[] }>;
  getChecklistTemplates(
    tenantId: string,
    options?: { take?: number },
  ): Promise<ChecklistTemplateSummary[]>;
}
