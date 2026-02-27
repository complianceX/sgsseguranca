import api from '@/lib/api';

export type CatStatus = 'aberta' | 'investigacao' | 'fechada';
export type CatTipo = 'tipico' | 'trajeto' | 'doenca_ocupacional' | 'outros';
export type CatGravidade = 'leve' | 'moderada' | 'grave' | 'fatal';
export type CatAttachmentCategory =
  | 'abertura'
  | 'investigacao'
  | 'fechamento'
  | 'geral';

export interface CatAttachment {
  id: string;
  file_name: string;
  file_key: string;
  file_type: string;
  category: CatAttachmentCategory;
  uploaded_by_id?: string;
  uploaded_at: string;
}

export interface CatRecord {
  id: string;
  numero: string;
  company_id: string;
  site_id?: string;
  contract_id?: string;
  worker_id?: string;
  data_ocorrencia: string;
  tipo: CatTipo;
  gravidade: CatGravidade;
  descricao: string;
  local_ocorrencia?: string;
  pessoas_envolvidas?: string[];
  acao_imediata?: string;
  investigacao_detalhes?: string;
  causa_raiz?: string;
  plano_acao_fechamento?: string;
  licoes_aprendidas?: string;
  status: CatStatus;
  opened_by_id?: string;
  investigated_by_id?: string;
  closed_by_id?: string;
  opened_at?: string;
  investigated_at?: string;
  closed_at?: string;
  attachments?: CatAttachment[];
  created_at: string;
  updated_at: string;
  worker?: { id: string; nome: string };
  site?: { id: string; nome: string };
}

export const catsService = {
  findAll: async (params?: {
    status?: CatStatus;
    worker_id?: string;
    site_id?: string;
  }) => {
    const response = await api.get<CatRecord[]>('/cats', { params });
    return response.data;
  },

  findOne: async (id: string) => {
    const response = await api.get<CatRecord>(`/cats/${id}`);
    return response.data;
  },

  getSummary: async () => {
    const response = await api.get<{
      total: number;
      aberta: number;
      investigacao: number;
      fechada: number;
      bySeverity: Record<string, number>;
    }>('/cats/summary');
    return response.data;
  },

  create: async (payload: Partial<CatRecord>) => {
    const response = await api.post<CatRecord>('/cats', payload);
    return response.data;
  },

  update: async (id: string, payload: Partial<CatRecord>) => {
    const response = await api.patch<CatRecord>(`/cats/${id}`, payload);
    return response.data;
  },

  startInvestigation: async (
    id: string,
    payload: {
      investigacao_detalhes: string;
      causa_raiz?: string;
      acao_imediata?: string;
    },
  ) => {
    const response = await api.post<CatRecord>(`/cats/${id}/investigation`, payload);
    return response.data;
  },

  close: async (
    id: string,
    payload: {
      plano_acao_fechamento: string;
      licoes_aprendidas?: string;
      causa_raiz?: string;
    },
  ) => {
    const response = await api.post<CatRecord>(`/cats/${id}/close`, payload);
    return response.data;
  },

  uploadAttachment: async (
    id: string,
    file: File,
    category: CatAttachmentCategory = 'geral',
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<CatAttachment>(`/cats/${id}/file`, formData, {
      params: { category },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  removeAttachment: async (id: string, attachmentId: string) => {
    await api.delete(`/cats/${id}/attachments/${attachmentId}`);
  },

  getAttachmentAccess: async (id: string, attachmentId: string) => {
    const response = await api.get<{
      attachmentId: string;
      fileName: string;
      fileType: string;
      url: string;
    }>(`/cats/${id}/attachments/${attachmentId}/access`);
    return response.data;
  },
};
