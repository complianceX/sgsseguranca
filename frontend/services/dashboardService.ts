import api from '@/lib/api';

export type DashboardKpisResponse = {
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
};

export type DashboardHeatmapResponse = Array<{
  site_id: string;
  site_name: string;
  risk_score: number;
  nc_count?: number;
  training_compliance?: number;
  apr_count?: number;
}>;

export const dashboardService = {
  getKpis: async () => {
    const response = await api.get<DashboardKpisResponse>('/dashboard/kpis');
    return response.data;
  },
  getHeatmap: async () => {
    const response = await api.get<DashboardHeatmapResponse>('/dashboard/heatmap');
    return response.data;
  },
};
