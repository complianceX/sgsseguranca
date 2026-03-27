import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';
import { authService } from './authService';

export interface Company {
  id: string;
  razao_social: string;
  cnpj: string;
  endereco: string;
  responsavel: string;
  email_contato?: string | null;
  logo_url?: string | null;
  status: boolean;
  created_at: string;
  updated_at: string;
}

export const companiesService = {
  findPaginated: async (opts?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<Company>> => {
    const response = await api.get<PaginatedResponse<Company>>('/companies', {
      params: {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 20,
        ...(opts?.search ? { search: opts.search } : {}),
      },
    });
    return response.data;
  },

  findAll: async () => {
    try {
      return fetchAllPages({
        fetchPage: (page, limit) =>
          companiesService.findPaginated({
            page,
            limit,
          }),
        limit: 100,
        maxPages: 20,
      });
    } catch (error) {
      if (typeof window === 'undefined') {
        throw error;
      }
    }
    try {
      const meResponse = await authService.getCurrentSession();
      const companyId = meResponse.user?.company_id;
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
