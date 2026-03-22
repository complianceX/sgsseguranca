import api from '@/lib/api';
import type { GovernedPdfAccessResponse } from "@/lib/api/generated/governed-contracts.client";
import { AxiosError } from 'axios';
import { Site } from './sitesService';
import { User } from './usersService';
import { fetchAllPages, PaginatedResponse } from './pagination';
import { enqueueOfflineMutation } from '@/lib/offline-sync';
import { getOfflineCache, isOfflineRequestError, setOfflineCache } from '@/lib/offline-cache';
import type {
  GovernedDocumentVideoAccessResponse,
  GovernedDocumentVideoAttachment,
  GovernedDocumentVideoMutationResponse,
} from "@/lib/videos/documentVideos";

export interface Inspection {
  id: string;
  company_id: string;
  company?: {
    id: string;
    razao_social: string;
  };
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

export type InspectionPdfAccess = GovernedPdfAccessResponse;

export interface InspectionEvidenceAttachResult {
  evidencias: Inspection["evidencias"];
  storageMode: "s3" | "inline-fallback";
  degraded: boolean;
  message: string | null;
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

const sanitizeInspectionEvidenceForOfflineCache = (
  evidence: NonNullable<Inspection['evidencias']>[number],
): NonNullable<Inspection['evidencias']>[number] => {
  if (!evidence.url || !evidence.url.startsWith('data:')) {
    return evidence;
  }

  return {
    descricao: evidence.descricao,
    original_name: evidence.original_name,
  };
};

const sanitizeInspectionForOfflineCache = (inspection: Inspection): Inspection => ({
  ...inspection,
  evidencias: inspection.evidencias?.map(sanitizeInspectionEvidenceForOfflineCache),
});

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
      setOfflineCache(cacheKey, sanitizeInspectionForOfflineCache(response.data));
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
    const response = await api.post<InspectionEvidenceAttachResult>(
      `/inspections/${id}/evidences`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data;
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<{
      fileKey: string;
      folderPath: string;
      originalName: string;
    }>(`/inspections/${id}/file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getPdfAccess: async (id: string) => {
    const response = await api.get<InspectionPdfAccess>(`/inspections/${id}/pdf`);
    return response.data;
  },

  listVideoAttachments: async (id: string) => {
    const response = await api.get<GovernedDocumentVideoAttachment[]>(
      `/inspections/${id}/videos`,
    );
    return response.data;
  },

  uploadVideoAttachment: async (
    id: string,
    file: File,
  ): Promise<GovernedDocumentVideoMutationResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<GovernedDocumentVideoMutationResponse>(
      `/inspections/${id}/videos`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return response.data;
  },

  getVideoAttachmentAccess: async (
    id: string,
    attachmentId: string,
  ): Promise<GovernedDocumentVideoAccessResponse> => {
    const response = await api.get<GovernedDocumentVideoAccessResponse>(
      `/inspections/${id}/videos/${attachmentId}/access`,
    );
    return response.data;
  },

  removeVideoAttachment: async (
    id: string,
    attachmentId: string,
  ): Promise<GovernedDocumentVideoMutationResponse> => {
    const response = await api.delete<GovernedDocumentVideoMutationResponse>(
      `/inspections/${id}/videos/${attachmentId}`,
    );
    return response.data;
  },

  listStoredFiles: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const response = await api.get<
      Array<{
        entityId: string;
        title: string;
        date: string;
        companyId: string;
        fileKey: string;
        folderPath: string;
        originalName: string;
      }>
    >('/inspections/files/list', {
      params: filters,
    });
    return response.data;
  },

  downloadWeeklyBundle: async (filters: {
    company_id?: string;
    year: number;
    week: number;
  }) => {
    const response = await api.get('/inspections/files/weekly-bundle', {
      params: filters,
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  remove: async (id: string) => {
    await api.delete(`/inspections/${id}`);
  },
};
