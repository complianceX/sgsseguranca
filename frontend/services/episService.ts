import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';

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
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<Epi>> => {
    const response = await api.get<PaginatedResponse<Epi>>('/epis', {
      params: {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 20,
        ...(opts?.search ? { search: opts.search } : {}),
      },
    });
    return response.data;
  },

  findAll: async () => {
    return fetchAllPages({
      fetchPage: (page, limit) =>
        episService.findPaginated({
          page,
          limit,
        }),
      limit: 100,
      maxPages: 50,
    });
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
