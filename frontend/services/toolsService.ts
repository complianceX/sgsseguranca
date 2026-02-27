import api from '@/lib/api';

export interface Tool {
  id: string;
  nome: string;
  descricao?: string;
  numero_serie?: string;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export const toolsService = {
  findAll: async () => {
    const response = await api.get<Tool[]>('/tools');
    return response.data;
  },

  findOne: async (id: string) => {
    const response = await api.get<Tool>(`/tools/${id}`);
    return response.data;
  },

  create: async (data: Partial<Tool>) => {
    const response = await api.post<Tool>('/tools', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Tool>) => {
    const response = await api.patch<Tool>(`/tools/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/tools/${id}`);
  },
};
