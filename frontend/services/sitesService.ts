import api from '@/lib/api';

export interface Site {
  id: string;
  nome: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export const sitesService = {
  findAll: async (companyId?: string) => {
    const response = await api.get<Site[]>('/sites', companyId
      ? { params: { company_id: companyId } }
      : undefined);
    return response.data;
  },

  findOne: async (id: string) => {
    const response = await api.get<Site>(`/sites/${id}`);
    return response.data;
  },

  create: async (data: Partial<Site>) => {
    const response = await api.post<Site>('/sites', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Site>) => {
    const response = await api.patch<Site>(`/sites/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/sites/${id}`);
  },
};
