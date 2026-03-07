import api from '@/lib/api';

export interface DashboardKpisResponse {
  leading: {
    apr_before_task: { total: number; compliant: number; percentage: number };
    completed_inspections: { total: number; completed: number; percentage: number };
    training_compliance: { total: number; compliant: number; percentage: number };
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

export const dashboardService = {
  getKpis: async () => {
    const response = await api.get<DashboardKpisResponse>('/dashboard/kpis');
    return response.data;
  },

  getHeatmap: async () => {
    const response = await api.get<DashboardHeatmapResponse>('/dashboard/heatmap');
    return response.data;
  },

  getTstDay: async () => {
    const response = await api.get<TstDayDashboard>('/dashboard/tst-day');
    return response.data;
  },
};
