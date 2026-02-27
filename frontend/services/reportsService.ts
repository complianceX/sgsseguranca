import api from '@/lib/api';

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
  };
  analise_gandra: string;
  created_at: string;
}

export const reportsService = {
  findAll: async (): Promise<Report[]> => {
    const response = await api.get('/reports');
    return response.data;
  },

  findOne: async (id: string): Promise<Report> => {
    const response = await api.get(`/reports/${id}`);
    return response.data;
  },

  generate: async (mes: number, ano: number): Promise<Report> => {
    const response = await api.post('/reports/generate', { mes, ano });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/reports/${id}`);
  },
};
