import api from '@/lib/api';

export interface Machine {
  id: string;
  nome: string;
  descricao?: string;
  placa?: string;
  horimetro_atual?: number;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export const machinesService = {
  findAll: async () => {
    const response = await api.get<Machine[]>('/machines');
    return response.data;
  },

  findOne: async (id: string) => {
    const response = await api.get<Machine>(`/machines/${id}`);
    return response.data;
  },

  create: async (data: Partial<Machine>) => {
    const response = await api.post<Machine>('/machines', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Machine>) => {
    const response = await api.patch<Machine>(`/machines/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/machines/${id}`);
  },
};
