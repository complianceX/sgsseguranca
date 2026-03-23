import api from "@/lib/api";
import { AxiosError } from "axios";

export interface DashboardSummaryResponse {
  counts: {
    users: number;
    companies: number;
    sites: number;
    checklists: number;
    aprs: number;
    pts: number;
  };
  expiringEpis: Array<{
    id: string;
    nome: string;
    ca: string | null;
    validade_ca: string | null;
  }>;
  expiringTrainings: Array<{
    id: string;
    nome: string;
    data_vencimento: string;
    user: { nome: string } | null;
  }>;
  pendingApprovals: {
    aprs: number;
    pts: number;
    checklists: number;
    nonconformities: number;
  };
  actionPlanItems: Array<{
    id: string;
    source: string;
    title: string;
    action: string;
    responsavel: string | null;
    prazo: string | null;
    status: string | null;
    href: string;
  }>;
  riskSummary: {
    alto: number;
    medio: number;
    baixo: number;
  };
  evidenceSummary: {
    total: number;
    inspections: number;
    nonconformities: number;
    audits: number;
  };
  modelCounts: {
    aprs: number;
    dds: number;
    checklists: number;
  };
  recentActivities: Array<{
    id: string;
    title: string;
    description: string;
    date: string;
    href: string;
    color: string;
  }>;
  siteCompliance: Array<{
    id: string;
    nome: string;
    total: number;
    conformes: number;
    taxa: number;
  }>;
  recentReports: Array<{
    id: string;
    titulo: string;
    mes: number;
    ano: number;
    created_at: string;
  }>;
}

export interface DashboardKpisResponse {
  leading: {
    apr_before_task: { total: number; compliant: number; percentage: number };
    completed_inspections: {
      total: number;
      completed: number;
      percentage: number;
    };
    training_compliance: {
      total: number;
      compliant: number;
      percentage: number;
    };
  };
  lagging: {
    recurring_nc: number;
    incidents: number;
    blocked_pt: number;
  };
  trends: {
    risk: Array<{ month: string; risk_score: number }>;
    nc: Array<{ month: string; count: number }>;
  };
  alerts: Array<{
    id: string;
    type: string;
    message: string;
    created_at: string;
    read: boolean;
  }>;
}

export type DashboardHeatmapResponse = Array<{
  site_id: string;
  site_name: string;
  risk_score: number;
  nc_count?: number;
  apr_count?: number;
  training_compliance?: number;
}>;

export interface TstDayDashboard {
  summary: {
    pendingPtApprovals: number;
    criticalNonConformities: number;
    overdueInspections: number;
    expiringDocuments: number;
  };
  pendingPtApprovals: Array<{
    id: string;
    numero: string;
    titulo: string;
    status: string;
    site: string | null;
    responsavel: string | null;
    residual_risk: string | null;
  }>;
  criticalNonConformities: Array<{
    id: string;
    codigo_nc: string;
    status: string;
    risco_nivel: string;
    local_setor_area: string;
    site: string | null;
  }>;
  overdueInspections: Array<{
    id: string;
    setor_area: string;
    data_inspecao: string;
    responsavel: string | null;
    site: string | null;
  }>;
  expiringDocuments: {
    medicalExams: Array<{
      id: string;
      workerName: string | null;
      tipo_exame: string;
      data_vencimento: string | null;
      resultado: string;
    }>;
    trainings: Array<{
      id: string;
      workerName: string | null;
      nome: string;
      data_vencimento: string;
      bloqueia_operacao_quando_vencido: boolean;
    }>;
  };
}

export interface DashboardPendingQueueResponse {
  degraded?: boolean;
  failedSources?: string[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    documents: number;
    health: number;
    actions: number;
  };
  items: Array<{
    id: string;
    sourceId: string;
    module: string;
    category: "documents" | "health" | "actions";
    title: string;
    description: string;
    priority: "critical" | "high" | "medium";
    status: string;
    responsible: string | null;
    siteId: string | null;
    site: string | null;
    dueDate: string | null;
    href: string;
  }>;
}

export type DocumentPendencyCriticality =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type DocumentPendencyType =
  | "missing_final_pdf"
  | "missing_required_signature"
  | "degraded_document_availability"
  | "failed_import"
  | "unavailable_governed_video"
  | "unavailable_governed_attachment";

export type DocumentPendencyActionKey =
  | "open_document"
  | "open_final_pdf"
  | "open_public_validation"
  | "retry_import"
  | "open_replacement_document"
  | "open_governed_video"
  | "open_governed_attachment";

export interface DashboardDocumentPendencyAllowedAction {
  key: DocumentPendencyActionKey;
  label: string;
  kind: "route" | "resolve" | "mutation";
  enabled: boolean;
  href?: string | null;
  reason?: string | null;
}

export interface DashboardDocumentPendencyItem {
  id: string;
  type: DocumentPendencyType;
  typeLabel: string;
  module: string;
  moduleLabel: string;
  companyId: string;
  companyName: string | null;
  siteId: string | null;
  siteName: string | null;
  documentId: string | null;
  documentCode: string | null;
  title: string | null;
  status: string | null;
  documentStatus: string | null;
  signatureStatus: string | null;
  availabilityStatus: string | null;
  criticality: DocumentPendencyCriticality;
  priority: DocumentPendencyCriticality;
  relevantDate: string | null;
  message: string;
  action: {
    label: string;
    href: string;
  } | null;
  allowedActions: DashboardDocumentPendencyAllowedAction[];
  suggestedRoute: string | null;
  suggestedRouteParams: Record<string, string | number | boolean | null> | null;
  publicValidationUrl: string | null;
  retryAllowed: boolean;
  replacementDocumentId: string | null;
  replacementRoute: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface DashboardDocumentPendencyResolvedActionResponse {
  actionKey: DocumentPendencyActionKey;
  url: string | null;
  availability: string | null;
  message: string | null;
  fileName: string | null;
  fileType: string | null;
}

export interface DashboardDocumentPendenciesResponse {
  degraded: boolean;
  failedSources: string[];
  summary: {
    total: number;
    byCriticality: Record<DocumentPendencyCriticality, number>;
    byType: Array<{
      type: DocumentPendencyType;
      label: string;
      total: number;
    }>;
    byModule: Array<{
      module: string;
      label: string;
      total: number;
    }>;
  };
  filtersApplied: {
    companyId?: string;
    siteId?: string;
    module?: string;
    criticality?: DocumentPendencyCriticality;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    lastPage: number;
  };
  items: DashboardDocumentPendencyItem[];
}

export const dashboardService = {
  getSummary: async () => {
    const response =
      await api.get<DashboardSummaryResponse>("/dashboard/summary");
    return response.data;
  },

  getKpis: async () => {
    const response = await api.get<DashboardKpisResponse>("/dashboard/kpis");
    return response.data;
  },

  getHeatmap: async () => {
    const response =
      await api.get<DashboardHeatmapResponse>("/dashboard/heatmap");
    return response.data;
  },

  getTstDay: async () => {
    const response = await api.get<TstDayDashboard>("/dashboard/tst-day");
    return response.data;
  },

  getPendingQueue: async () => {
    try {
      const response = await api.get<DashboardPendingQueueResponse>(
        "/dashboard/pending-queue",
      );
      return response.data;
    } catch (error) {
      const status = (error as AxiosError).response?.status;
      if (status && [429, 500, 502, 503, 504].includes(status)) {
        return {
          degraded: true,
          failedSources: ["pending-queue"],
          summary: {
            total: 0,
            critical: 0,
            high: 0,
            medium: 0,
            documents: 0,
            health: 0,
            actions: 0,
          },
          items: [],
        } satisfies DashboardPendingQueueResponse;
      }
      throw error;
    }
  },

  getDocumentPendencies: async (filters?: {
    companyId?: string;
    siteId?: string;
    module?: string;
    priority?: DocumentPendencyCriticality;
    criticality?: DocumentPendencyCriticality;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get<DashboardDocumentPendenciesResponse>(
      "/dashboard/document-pendencies",
      {
        params: {
          ...(filters?.companyId ? { companyId: filters.companyId } : {}),
          ...(filters?.siteId ? { siteId: filters.siteId } : {}),
          ...(filters?.module ? { module: filters.module } : {}),
          ...(filters?.priority ? { priority: filters.priority } : {}),
          ...(filters?.criticality ? { criticality: filters.criticality } : {}),
          ...(filters?.status ? { status: filters.status } : {}),
          ...(filters?.dateFrom ? { dateFrom: filters.dateFrom } : {}),
          ...(filters?.dateTo ? { dateTo: filters.dateTo } : {}),
          ...(filters?.page ? { page: filters.page } : {}),
          ...(filters?.limit ? { limit: filters.limit } : {}),
        },
      },
    );
    return response.data;
  },

  resolveDocumentPendencyAction: async (payload: {
    actionKey: "open_final_pdf" | "open_governed_video" | "open_governed_attachment";
    module: string;
    documentId: string;
    attachmentId?: string;
    attachmentIndex?: number;
  }) => {
    const response = await api.post<DashboardDocumentPendencyResolvedActionResponse>(
      "/dashboard/document-pendencies/actions/resolve",
      payload,
    );
    return response.data;
  },

  retryDocumentPendencyImport: async (documentId: string) => {
    const response = await api.post(`/dashboard/document-pendencies/imports/${documentId}/retry`);
    return response.data;
  },
};
