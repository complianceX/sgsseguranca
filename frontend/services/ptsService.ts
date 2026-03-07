import api from '@/lib/api';
import { AxiosError } from 'axios';
import { User } from './usersService';
import { fetchAllPages, PaginatedResponse } from './pagination';
import { enqueueOfflineMutation } from '@/lib/offline-sync';
import { getOfflineCache, isOfflineRequestError, setOfflineCache } from '@/lib/offline-cache';

export interface Pt {
  id: string;
  numero: string;
  titulo: string;
  descricao?: string;
  data_hora_inicio: string;
  data_hora_fim: string;
  status: 'Pendente' | 'Aprovada' | 'Cancelada' | 'Encerrada' | 'Expirada';
  company_id: string;
  site_id: string;
  apr_id?: string;
  responsavel_id: string;
  executantes: User[];
  trabalho_altura: boolean;
  espaco_confinado: boolean;
  trabalho_quente: boolean;
  eletricidade: boolean;
  escavacao: boolean;
  probability?: number;
  severity?: number;
  exposure?: number;
  initial_risk?: number;
  residual_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidence_photo?: string;
  evidence_document?: string;
  control_description?: string;
  control_evidence?: boolean;
  trabalho_altura_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;
  trabalho_eletrico_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;
  trabalho_quente_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;
  trabalho_espaco_confinado_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;
  trabalho_escavacao_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;
  recomendacoes_gerais_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Ciente' | 'Não';
    justificativa?: string;
  }>;
  analise_risco_rapida_checklist?: Array<{
    id: string;
    pergunta: string;
    secao: 'basica' | 'adicional';
    resposta?: 'Sim' | 'Não';
  }>;
  analise_risco_rapida_observacoes?: string;
  auditado_por_id?: string;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
  pdf_file_key?: string;
  pdf_folder_path?: string;
  pdf_original_name?: string;
  created_at: string;
  updated_at: string;
  site?: { nome: string };
  responsavel?: { nome: string };
  apr?: { numero: string };
  auditado_por?: { nome: string };
  aprovado_por_id?: string;
  aprovado_em?: string;
  aprovado_motivo?: string;
  reprovado_por_id?: string;
  reprovado_em?: string;
  reprovado_motivo?: string;
}

export interface PtApprovalRules {
  blockCriticalRiskWithoutEvidence: boolean;
  blockWorkerWithoutValidMedicalExam: boolean;
  blockWorkerWithExpiredBlockingTraining: boolean;
  requireAtLeastOneExecutante: boolean;
}

export const ptsService = {
  findPaginated: async (opts?: { page?: number; limit?: number; search?: string; status?: string }) => {
    const params = {
      page: opts?.page ?? 1,
      limit: opts?.limit ?? 20,
      ...(opts?.search ? { search: opts.search } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
    };
    const cacheKey = `pts.paginated.${JSON.stringify(params)}`;

    try {
      const response = await api.get<PaginatedResponse<Pt>>('/pts', { params });
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<PaginatedResponse<Pt>>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findAll: async () => {
    const cacheKey = 'pts.all';
    try {
      const data = await fetchAllPages({
        fetchPage: (page, limit) => ptsService.findPaginated({ page, limit }),
        limit: 100,
        maxPages: 20,
      });
      setOfflineCache(cacheKey, data);
      return data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<Pt[]>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findOne: async (id: string) => {
    const cacheKey = `pts.one.${id}`;
    try {
      const response = await api.get<Pt>(`/pts/${id}`);
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<Pt>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  create: async (data: Omit<Partial<Pt>, 'executantes'> & { executantes?: string[] }) => {
    try {
      const response = await api.post<Pt>('/pts', data);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== 'ERR_NETWORK') {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: '/pts',
        method: 'post',
        data,
        label: 'PT',
      });

      return {
        ...(data as unknown as Partial<Pt>),
        id: queued.id,
        status: ((data as unknown as Partial<Pt>)?.status || 'Pendente') as Pt['status'],
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as Pt & { offlineQueued: true };
    }
  },

  update: async (id: string, data: Omit<Partial<Pt>, 'executantes'> & { executantes?: string[] }) => {
    try {
      const response = await api.patch<Pt>(`/pts/${id}`, data);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== 'ERR_NETWORK') {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: `/pts/${id}`,
        method: 'patch',
        data,
        label: 'PT',
      });

      return {
        ...(data as unknown as Partial<Pt>),
        id,
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as Pt & { offlineQueued: true };
    }
  },

  approve: async (id: string, reason?: string) => {
    const response = await api.post<Pt>(`/pts/${id}/approve`, { reason });
    return response.data;
  },

  reject: async (id: string, reason: string) => {
    const response = await api.post<Pt>(`/pts/${id}/reject`, { reason });
    return response.data;
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/pts/${id}/file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getPdfAccess: async (id: string) => {
    const response = await api.get<{
      entityId: string;
      fileKey: string;
      folderPath: string;
      originalName: string;
      url: string;
    }>(`/pts/${id}/pdf`);
    return response.data;
  },

  listStoredFiles: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const response = await api.get('/pts/files/list', { params: filters });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/pts/${id}`);
  },

  getApprovalRules: async () => {
    const response = await api.get<PtApprovalRules>('/pts/approval-rules');
    return response.data;
  },

  updateApprovalRules: async (payload: Partial<PtApprovalRules>) => {
    const response = await api.patch<PtApprovalRules>(
      '/pts/approval-rules',
      payload,
    );
    return response.data;
  },
};
