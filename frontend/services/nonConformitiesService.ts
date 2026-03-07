import api from '@/lib/api';
import { AxiosError } from 'axios';
import { Site } from './sitesService';
import { enqueueOfflineMutation } from '@/lib/offline-sync';

export interface NonConformity {
  id: string;
  codigo_nc: string;
  tipo: string;
  data_identificacao: string;
  local_setor_area: string;
  atividade_envolvida: string;
  responsavel_area: string;
  auditor_responsavel: string;
  classificacao?: string[];
  descricao: string;
  evidencia_observada: string;
  condicao_insegura: string;
  ato_inseguro?: string;
  requisito_nr: string;
  requisito_item: string;
  requisito_procedimento?: string;
  requisito_politica?: string;
  risco_perigo: string;
  risco_associado: string;
  risco_consequencias?: string[];
  risco_nivel: string;
  causa?: string[];
  causa_outro?: string;
  acao_imediata_descricao?: string;
  acao_imediata_data?: string;
  acao_imediata_responsavel?: string;
  acao_imediata_status?: string;
  acao_definitiva_descricao?: string;
  acao_definitiva_prazo?: string;
  acao_definitiva_responsavel?: string;
  acao_definitiva_recursos?: string;
  acao_definitiva_data_prevista?: string;
  acao_preventiva_medidas?: string;
  acao_preventiva_treinamento?: string;
  acao_preventiva_revisao_procedimento?: string;
  acao_preventiva_melhoria_processo?: string;
  acao_preventiva_epc_epi?: string;
  verificacao_resultado?: string;
  verificacao_evidencias?: string;
  verificacao_data?: string;
  verificacao_responsavel?: string;
  status: string;
  observacoes_gerais?: string;
  anexos?: string[];
  assinatura_responsavel_area?: string;
  assinatura_tecnico_auditor?: string;
  assinatura_gestao?: string;
  company_id: string;
  pdf_file_key?: string;
  pdf_folder_path?: string;
  pdf_original_name?: string;
  site_id?: string;
  site?: Site;
  created_at: string;
  updated_at: string;
}

export enum NcStatus {
  ABERTA = 'ABERTA',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  AGUARDANDO_VALIDACAO = 'AGUARDANDO_VALIDACAO',
  ENCERRADA = 'ENCERRADA',
}

export const NC_STATUS_LABEL: Record<NcStatus, string> = {
  [NcStatus.ABERTA]: 'Aberta',
  [NcStatus.EM_ANDAMENTO]: 'Em Andamento',
  [NcStatus.AGUARDANDO_VALIDACAO]: 'Aguard. Validação',
  [NcStatus.ENCERRADA]: 'Encerrada',
};

export const NC_STATUS_COLORS: Record<NcStatus, string> = {
  [NcStatus.ABERTA]: 'bg-red-100 text-red-700 border-red-200',
  [NcStatus.EM_ANDAMENTO]: 'bg-amber-100 text-amber-700 border-amber-200',
  [NcStatus.AGUARDANDO_VALIDACAO]: 'bg-blue-100 text-blue-700 border-blue-200',
  [NcStatus.ENCERRADA]: 'bg-green-100 text-green-700 border-green-200',
};

export const NC_ALLOWED_TRANSITIONS: Record<NcStatus, NcStatus[]> = {
  [NcStatus.ABERTA]: [NcStatus.EM_ANDAMENTO],
  [NcStatus.EM_ANDAMENTO]: [NcStatus.AGUARDANDO_VALIDACAO, NcStatus.ABERTA],
  [NcStatus.AGUARDANDO_VALIDACAO]: [NcStatus.ENCERRADA, NcStatus.ABERTA],
  [NcStatus.ENCERRADA]: [NcStatus.ABERTA],
};

export const nonConformitiesService = {
  findAll: async () => {
    const response = await api.get<NonConformity[]>('/nonconformities');
    return response.data;
  },

  findOne: async (id: string) => {
    const response = await api.get<NonConformity>(`/nonconformities/${id}`);
    return response.data;
  },

  create: async (data: Partial<NonConformity>) => {
    try {
      const response = await api.post<NonConformity>('/nonconformities', data);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== 'ERR_NETWORK') {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: '/nonconformities',
        method: 'post',
        data,
        label: 'NC',
      });

      return {
        ...(data as NonConformity),
        id: queued.id,
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as NonConformity & { offlineQueued: true };
    }
  },

  update: async (id: string, data: Partial<NonConformity>) => {
    try {
      const response = await api.patch<NonConformity>(`/nonconformities/${id}`, data);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== 'ERR_NETWORK') {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: `/nonconformities/${id}`,
        method: 'patch',
        data,
        label: 'NC',
      });

      return {
        ...(data as NonConformity),
        id,
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as NonConformity & { offlineQueued: true };
    }
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/nonconformities/${id}/file`, formData, {
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
    }>(`/nonconformities/${id}/pdf`);
    return response.data;
  },

  listStoredFiles: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const response = await api.get('/nonconformities/files/list', { params: filters });
    return response.data;
  },

  updateStatus: async (id: string, status: NcStatus) => {
    const response = await api.patch<NonConformity>(
      `/nonconformities/${id}/status`,
      { status },
    );
    return response.data;
  },

  getMonthlyAnalytics: async (): Promise<{ mes: string; total: number }[]> => {
    const response = await api.get<{ mes: string; total: number }[]>(
      '/nonconformities/analytics/monthly',
    );
    return response.data;
  },

  remove: async (id: string) => {
    await api.delete(`/nonconformities/${id}`);
  },
};
