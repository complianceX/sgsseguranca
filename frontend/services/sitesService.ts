import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';

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
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
  }): Promise<PaginatedResponse<Site>> => {
    const response = await api.get<PaginatedResponse<Site>>('/sites', {
      params: {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 20,
        ...(opts?.search ? { search: opts.search } : {}),
        ...(opts?.companyId ? { company_id: opts.companyId } : {}),
      },
    });
    return response.data;
  },

  findAll: async (companyId?: string) => {
    return fetchAllPages({
      fetchPage: (page, limit) =>
        sitesService.findPaginated({
          page,
          limit,
          companyId,
        }),
      limit: 100,
      maxPages: 50,
    });
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
