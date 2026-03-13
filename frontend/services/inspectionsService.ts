import api from '@/lib/api';
import { AxiosError } from 'axios';
import { Site } from './sitesService';
import { User } from './usersService';
import { fetchAllPages, PaginatedResponse } from './pagination';
import { enqueueOfflineMutation } from '@/lib/offline-sync';
import { getOfflineCache, isOfflineRequestError, setOfflineCache } from '@/lib/offline-cache';

export interface Inspection {
  id: string;
  company_id: string;
  site_id: string;
  site?: Site;
  setor_area: string;
  tipo_inspecao: string;
  data_inspecao: string;
  horario: string;
  responsavel_id: string;
  responsavel?: User;
  objetivo?: string;
  descricao_local_atividades?: string;
  metodologia?: string[];
  perigos_riscos?: {
    grupo_risco: string;
    perigo_fator_risco: string;
    fonte_circunstancia: string;
    trabalhadores_expostos: string;
    tipo_exposicao: string;
    medidas_existentes: string;
    severidade: string;
    probabilidade: string;
    nivel_risco: string;
    classificacao_risco: string;
    acoes_necessarias: string;
    prazo: string;
    responsavel: string;
  }[];
  plano_acao?: {
    acao: string;
    responsavel: string;
    prazo: string;
    status: string;
  }[];
  evidencias?: {
    descricao: string;
    url?: string;
    original_name?: string;
  }[];
  conclusao?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateInspectionDto {
  site_id: string;
  setor_area: string;
  tipo_inspecao: string;
  data_inspecao: string;
  horario: string;
  responsavel_id: string;
  objetivo?: string;
  descricao_local_atividades?: string;
  metodologia?: string[];
  perigos_riscos?: {
    grupo_risco: string;
    perigo_fator_risco: string;
    fonte_circunstancia: string;
    trabalhadores_expostos: string;
    tipo_exposicao: string;
    medidas_existentes: string;
    severidade: string;
    probabilidade: string;
    nivel_risco: string;
    classificacao_risco: string;
    acoes_necessarias: string;
    prazo: string;
    responsavel: string;
  }[];
  plano_acao?: {
    acao: string;
    responsavel: string;
    prazo: string;
    status: string;
  }[];
  evidencias?: {
    descricao: string;
    url?: string;
    original_name?: string;
  }[];
  conclusao?: string;
}

export type UpdateInspectionDto = Partial<CreateInspectionDto>;

export const inspectionsService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<Inspection>> => {
    const params = {
      page: opts?.page ?? 1,
      limit: opts?.limit ?? 20,
      ...(opts?.search ? { search: opts.search } : {}),
    };
    const cacheKey = `inspections.paginated.${JSON.stringify(params)}`;

    try {
      const response = await api.get<PaginatedResponse<Inspection>>('/inspections', {
        params,
      });
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<PaginatedResponse<Inspection>>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findAll: async () => {
    return fetchAllPages({
      fetchPage: (page, limit) =>
        inspectionsService.findPaginated({
          page,
          limit,
        }),
      limit: 100,
      maxPages: 50,
    });
  },

  findOne: async (id: string) => {
    const cacheKey = `inspections.one.${id}`;
    try {
      const response = await api.get<Inspection>(`/inspections/${id}`);
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<Inspection>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  create: async (data: CreateInspectionDto) => {
    try {
      const response = await api.post<Inspection>('/inspections', data);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== 'ERR_NETWORK') {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: '/inspections',
        method: 'post',
        data,
        label: 'Inspecao',
      });

      return {
        ...(data as unknown as Partial<Inspection>),
        id: queued.id,
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as Inspection & { offlineQueued: true };
    }
  },

  update: async (id: string, data: UpdateInspectionDto) => {
    try {
      const response = await api.patch<Inspection>(`/inspections/${id}`, data);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== 'ERR_NETWORK') {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: `/inspections/${id}`,
        method: 'patch',
        data,
        label: 'Inspecao',
      });

      return {
        ...(data as unknown as Partial<Inspection>),
        id,
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as Inspection & { offlineQueued: true };
    }
  },

  attachEvidence: async (id: string, file: File, descricao?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (descricao) formData.append('descricao', descricao);
    const response = await api.post<{ evidencias: Inspection['evidencias'] }>(
      `/inspections/${id}/evidences`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data;
  },

  remove: async (id: string) => {
    await api.delete(`/inspections/${id}`);
  },
};
