import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';

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
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
  }): Promise<PaginatedResponse<Machine>> => {
    const headers = opts?.companyId
      ? { 'x-company-id': opts.companyId }
      : undefined;
    const response = await api.get<PaginatedResponse<Machine>>('/machines', {
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
        machinesService.findPaginated({ page, limit, companyId }),
      limit: 100,
      maxPages: 50,
    });
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
