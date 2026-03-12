import api from '@/lib/api';
import { Site } from './sitesService';
import { User } from './usersService';
import { fetchAllPages, PaginatedResponse } from './pagination';

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
    const response = await api.get<PaginatedResponse<Inspection>>('/inspections', {
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
        inspectionsService.findPaginated({
          page,
          limit,
        }),
      limit: 100,
      maxPages: 50,
    });
  },

  findOne: async (id: string) => {
    const response = await api.get<Inspection>(`/inspections/${id}`);
    return response.data;
  },

  create: async (data: CreateInspectionDto) => {
    const response = await api.post<Inspection>('/inspections', data);
    return response.data;
  },

  update: async (id: string, data: UpdateInspectionDto) => {
    const response = await api.patch<Inspection>(`/inspections/${id}`, data);
    return response.data;
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
