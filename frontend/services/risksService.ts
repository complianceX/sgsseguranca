import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';
import { omitCompanyId, tenantConfigFromPayload } from './tenantWriteScope';

export interface Risk {
  id: string;
  nome: string;
  categoria: string;
  descricao?: string;
  medidas_controle?: string;
  probability?: number;
  severity?: number;
  exposure?: number;
  initial_risk?: number;
  residual_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  control_hierarchy?:
    | 'ELIMINATION'
    | 'SUBSTITUTION'
    | 'ENGINEERING'
    | 'ADMINISTRATIVE'
    | 'PPE';
  evidence_photo?: string;
  evidence_document?: string;
  control_description?: string;
  control_evidence?: boolean;
  company_id: string;
  status: boolean;
  created_at: string;
  updated_at: string;
}

export const risksService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
  }): Promise<PaginatedResponse<Risk>> => {
    const headers = opts?.companyId
      ? { 'x-company-id': opts.companyId }
      : undefined;
    const response = await api.get<PaginatedResponse<Risk>>('/risks', {
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
        risksService.findPaginated({ page, limit, companyId }),
      limit: 100,
      maxPages: 50,
    });
  },

  findOne: async (id: string) => {
    const response = await api.get<Risk>(`/risks/${id}`);
    return response.data;
  },

  create: async (data: Partial<Risk>) => {
    const payload = omitCompanyId(data);
    const config = tenantConfigFromPayload(data);
    const response = config
      ? await api.post<Risk>('/risks', payload, config)
      : await api.post<Risk>('/risks', payload);
    return response.data;
  },

  update: async (id: string, data: Partial<Risk>) => {
    const payload = omitCompanyId(data);
    const config = tenantConfigFromPayload(data);
    const response = config
      ? await api.patch<Risk>(`/risks/${id}`, payload, config)
      : await api.patch<Risk>(`/risks/${id}`, payload);
    return response.data;
  },

  delete: async (id: string, companyId?: string) => {
    await api.delete(`/risks/${id}`, {
      ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
    });
  },
};
