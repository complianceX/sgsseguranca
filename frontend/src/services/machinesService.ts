import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';
import { omitCompanyId, tenantConfigFromPayload } from './tenantWriteScope';

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
    const payload = omitCompanyId(data);
    const config = tenantConfigFromPayload(data);
    const response = config
      ? await api.post<Machine>('/machines', payload, config)
      : await api.post<Machine>('/machines', payload);
    return response.data;
  },

  update: async (id: string, data: Partial<Machine>) => {
    const payload = omitCompanyId(data);
    const config = tenantConfigFromPayload(data);
    const response = config
      ? await api.patch<Machine>(`/machines/${id}`, payload, config)
      : await api.patch<Machine>(`/machines/${id}`, payload);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/machines/${id}`);
  },
};
