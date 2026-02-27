import api from '@/lib/api';
import { Site } from './sitesService';

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
    const response = await api.post<NonConformity>('/nonconformities', data);
    return response.data;
  },

  update: async (id: string, data: Partial<NonConformity>) => {
    const response = await api.patch<NonConformity>(`/nonconformities/${id}`, data);
    return response.data;
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

  remove: async (id: string) => {
    await api.delete(`/nonconformities/${id}`);
  },
};
