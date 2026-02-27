import api from '@/lib/api';
import { Site } from './sitesService';
import { User } from './usersService';

export interface Audit {
  id: string;
  titulo: string;
  data_auditoria: string;
  tipo_auditoria: string;
  company_id: string;
  site_id: string;
  site?: Site;
  auditor_id: string;
  auditor?: User;
  representantes_empresa?: string;
  objetivo?: string;
  escopo?: string;
  referencias?: string[];
  metodologia?: string;
  caracterizacao?: {
    cnae?: string;
    grau_risco?: string;
    num_trabalhadores?: number;
    turnos?: string;
    atividades_principais?: string;
  };
  documentos_avaliados?: string[];
  resultados_conformidades?: string[];
  resultados_nao_conformidades?: {
    descricao: string;
    requisito: string;
    evidencia: string;
    classificacao: 'Leve' | 'Moderada' | 'Grave' | 'Crítica';
  }[];
  resultados_observacoes?: string[];
  resultados_oportunidades?: string[];
  avaliacao_riscos?: {
    perigo: string;
    classificacao: string;
    impactos: string;
    medidas_controle: string;
  }[];
  plano_acao?: {
    item: string;
    acao: string;
    responsavel: string;
    prazo: string;
    status: string;
  }[];
  conclusao?: string;
  pdf_file_key?: string;
  pdf_folder_path?: string;
  pdf_original_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAuditDto {
  titulo: string;
  data_auditoria: string;
  tipo_auditoria: string;
  site_id: string;
  auditor_id: string;
  representantes_empresa?: string;
  objetivo?: string;
  escopo?: string;
  referencias?: string[];
  metodologia?: string;
  caracterizacao?: {
    cnae?: string;
    grau_risco?: string;
    num_trabalhadores?: number;
    turnos?: string;
    atividades_principais?: string;
  };
  documentos_avaliados?: string[];
  resultados_conformidades?: string[];
  resultados_nao_conformidades?: {
    descricao: string;
    requisito: string;
    evidencia: string;
    classificacao: 'Leve' | 'Moderada' | 'Grave' | 'Crítica';
  }[];
  resultados_observacoes?: string[];
  resultados_oportunidades?: string[];
  avaliacao_riscos?: {
    perigo: string;
    classificacao: string;
    impactos: string;
    medidas_controle: string;
  }[];
  plano_acao?: {
    item: string;
    acao: string;
    responsavel: string;
    prazo: string;
    status: string;
  }[];
  conclusao?: string;
}

export const auditsService = {
  findAll: async () => {
    const response = await api.get<Audit[]>('/audits');
    return response.data;
  },

  findOne: async (id: string) => {
    const response = await api.get<Audit>(`/audits/${id}`);
    return response.data;
  },

  create: async (data: CreateAuditDto) => {
    const response = await api.post<Audit>('/audits', data);
    return response.data;
  },

  update: async (id: string, data: Partial<CreateAuditDto>) => {
    const response = await api.patch<Audit>(`/audits/${id}`, data);
    return response.data;
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/audits/${id}/file`, formData, {
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
    }>(`/audits/${id}/pdf`);
    return response.data;
  },

  listStoredFiles: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const response = await api.get('/audits/files/list', { params: filters });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/audits/${id}`);
  },
};
