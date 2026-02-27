import api from '@/lib/api';

export interface Company {
  id: string;
  razao_social: string;
  cnpj: string;
  endereco: string;
  responsavel: string;
  logo_url?: string | null;
  status: boolean;
  created_at: string;
  updated_at: string;
}

export const companiesService = {
  findAll: async () => {
    try {
      const response = await api.get<Company[]>('/companies');
      if (response.data.length > 0) {
        return response.data;
      }
    } catch (error) {
      if (typeof window === 'undefined') {
        throw error;
      }
    }
    try {
      const meResponse = await api.get<{ user?: { company_id?: string } }>(
        '/auth/me',
      );
      const companyId = meResponse.data?.user?.company_id;
      if (companyId) {
        const companyResponse = await api.get<Company>(`/companies/${companyId}`);
        return [companyResponse.data];
      }
    } catch {
      return [];
    }
    return [];
  },

  findOne: async (id: string) => {
    const response = await api.get<Company>(`/companies/${id}`);
    return response.data;
  },

  create: async (data: Partial<Company>) => {
    const response = await api.post<Company>('/companies', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Company>) => {
    const response = await api.patch<Company>(`/companies/${id}`, data, {
      timeout: 45000,
    });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/companies/${id}`);
  },
};
