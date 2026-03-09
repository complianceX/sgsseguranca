import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';

export type EpiAssignmentStatus = 'entregue' | 'devolvido' | 'substituido';

export interface EpiSignatureStamp {
  signer_user_id?: string;
  signer_name?: string;
  signature_data: string;
  signature_type: string;
  signature_hash: string;
  timestamp_token: string;
  timestamp_issued_at: string;
  timestamp_authority: string;
}

export interface EpiAssignment {
  id: string;
  company_id: string;
  epi_id: string;
  user_id: string;
  site_id?: string;
  contract_id?: string;
  ca?: string;
  validade_ca?: string;
  quantidade: number;
  status: EpiAssignmentStatus;
  entregue_em: string;
  devolvido_em?: string;
  motivo_devolucao?: string;
  observacoes?: string;
  assinatura_entrega: EpiSignatureStamp;
  assinatura_devolucao?: EpiSignatureStamp;
  created_by_id?: string;
  updated_by_id?: string;
  created_at: string;
  updated_at: string;
  epi?: { id: string; nome: string };
  user?: { id: string; nome: string };
}

export interface EpiSignatureInput {
  signature_data: string;
  signature_type: string;
  signer_name?: string;
}

export const epiAssignmentsService = {
  findPaginated: async (params?: {
    page?: number;
    limit?: number;
    status?: EpiAssignmentStatus;
    user_id?: string;
    epi_id?: string;
  }) => {
    const response = await api.get<PaginatedResponse<EpiAssignment>>(
      '/epi-assignments',
      {
        params: {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          ...(params?.status ? { status: params.status } : {}),
          ...(params?.user_id ? { user_id: params.user_id } : {}),
          ...(params?.epi_id ? { epi_id: params.epi_id } : {}),
        },
      },
    );
    return response.data;
  },

  findAll: async (params?: {
    status?: EpiAssignmentStatus;
    user_id?: string;
    epi_id?: string;
  }) => {
    return fetchAllPages({
      fetchPage: (page, limit) =>
        epiAssignmentsService.findPaginated({
          page,
          limit,
          status: params?.status,
          user_id: params?.user_id,
          epi_id: params?.epi_id,
        }),
      limit: 100,
      maxPages: 50,
    });
  },

  findOne: async (id: string) => {
    const response = await api.get<EpiAssignment>(`/epi-assignments/${id}`);
    return response.data;
  },

  getSummary: async () => {
    const response = await api.get<{
      total: number;
      entregue: number;
      devolvido: number;
      substituido: number;
      caExpirado: number;
    }>('/epi-assignments/summary');
    return response.data;
  },

  create: async (payload: {
    epi_id: string;
    user_id: string;
    site_id?: string;
    contract_id?: string;
    quantidade?: number;
    observacoes?: string;
    assinatura_entrega: EpiSignatureInput;
  }) => {
    const response = await api.post<EpiAssignment>('/epi-assignments', payload);
    return response.data;
  },

  update: async (id: string, payload: Partial<EpiAssignment>) => {
    const response = await api.patch<EpiAssignment>(`/epi-assignments/${id}`, payload);
    return response.data;
  },

  returnAssignment: async (
    id: string,
    payload: {
      assinatura_devolucao: EpiSignatureInput;
      motivo_devolucao?: string;
      observacoes?: string;
    },
  ) => {
    const response = await api.post<EpiAssignment>(
      `/epi-assignments/${id}/return`,
      payload,
    );
    return response.data;
  },

  replaceAssignment: async (
    id: string,
    payload: {
      motivo_substituicao: string;
      observacoes?: string;
    },
  ) => {
    const response = await api.post<EpiAssignment>(
      `/epi-assignments/${id}/replace`,
      payload,
    );
    return response.data;
  },
};
