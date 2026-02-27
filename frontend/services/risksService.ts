import api from '@/lib/api';

export interface Risk {
  id: string;
  nome: string;
  categoria: string;
  descricao?: string;
  medidas_controle?: string;
  company_id: string;
  status: boolean;
  created_at: string;
  updated_at: string;
}

export const risksService = {
  findAll: async () => {
    const response = await api.get<Risk[]>('/risks');
    return response.data;
  },

  findOne: async (id: string) => {
    const response = await api.get<Risk>(`/risks/${id}`);
    return response.data;
  },

  create: async (data: Partial<Risk>) => {
    const response = await api.post<Risk>('/risks', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Risk>) => {
    const response = await api.patch<Risk>(`/risks/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/risks/${id}`);
  },
};
