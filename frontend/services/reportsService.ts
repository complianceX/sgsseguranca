import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';

export interface Report {
  id: string;
  titulo: string;
  mes: number;
  ano: number;
  estatisticas: {
    aprs_count: number;
    pts_count: number;
    dds_count: number;
    checklists_count: number;
    trainings_count: number;
    epis_expired_count?: number;
  };
  analise_gandra: string;
  created_at: string;
}

export interface ReportGenerationJob {
  jobId: string;
  statusUrl: string;
}

export interface ReportJobStatus {
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | string;
  result: { url?: string } | null;
}

export interface ReportQueueStats {
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}

export interface ReportQueueJob {
  id: string;
  name: string;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | string;
  createdAt: string | null;
  finishedAt: string | null;
  failedReason: string | null;
  attemptsMade: number;
  reportType: string | null;
  month: number | null;
  year: number | null;
  companyId: string | null;
  result: { url?: string } | null;
}

export const reportsService = {
  findPaginated: async (opts?: { page?: number; limit?: number }): Promise<PaginatedResponse<Report>> => {
    const response = await api.get<PaginatedResponse<Report>>('/reports', {
      params: {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 12,
      },
    });
    return response.data;
  },

  findAll: async (): Promise<Report[]> => {
    return fetchAllPages({
      fetchPage: (page, limit) => reportsService.findPaginated({ page, limit }),
      limit: 50,
      maxPages: 20,
    });
  },

  findOne: async (id: string): Promise<Report> => {
    const response = await api.get(`/reports/${id}`);
    return response.data;
  },

  generate: async (mes: number, ano: number): Promise<ReportGenerationJob> => {
    const response = await api.post<ReportGenerationJob>('/reports/generate', { mes, ano });
    return response.data;
  },

  getStatus: async (jobId: string): Promise<ReportJobStatus> => {
    const response = await api.get<ReportJobStatus>(`/reports/status/${jobId}`);
    return response.data;
  },

  getQueueStats: async (): Promise<ReportQueueStats> => {
    const response = await api.get<ReportQueueStats>('/reports/queue/stats');
    return response.data;
  },

  getJobs: async (limit = 12): Promise<{ items: ReportQueueJob[] }> => {
    const response = await api.get<{ items: ReportQueueJob[] }>('/reports/jobs', {
      params: { limit },
    });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/reports/${id}`);
  },
};
