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
};
