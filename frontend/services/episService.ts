import api from '@/lib/api';

export interface Epi {
  id: string;
  nome: string;
  ca?: string;
  validade_ca: string | null;
  descricao?: string;
  company_id: string;
  status: boolean;
  created_at: string;
  updated_at: string;
}

export const episService = {
  findAll: async () => {
    const response = await api.get<Epi[]>('/epis');
    return response.data;
  },

  findOne: async (id: string) => {
    const response = await api.get<Epi>(`/epis/${id}`);
    return response.data;
  },

  create: async (data: Partial<Epi>) => {
    const response = await api.post<Epi>('/epis', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Epi>) => {
    const response = await api.patch<Epi>(`/epis/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/epis/${id}`);
  },
};
