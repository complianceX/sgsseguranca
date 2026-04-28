import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';

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
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
  }): Promise<PaginatedResponse<Tool>> => {
    const headers = opts?.companyId
      ? { 'x-company-id': opts.companyId }
      : undefined;
    const response = await api.get<PaginatedResponse<Tool>>('/tools', {
      params: {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 20,
        ...(opts?.search ? { search: opts.search } : {}),
      },
      ...(headers ? { headers } : {}),
    });
    return response.data;
  },

  findAll: async (companyId?: string) => {
    return fetchAllPages({
      fetchPage: (page, limit) =>
        toolsService.findPaginated({ page, limit, companyId }),
      limit: 100,
      maxPages: 50,
    });
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
