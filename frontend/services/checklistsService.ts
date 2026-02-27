import api from '@/lib/api';

export interface ChecklistItem {
  id?: string;
  item: string; // The question/label
  status: boolean | 'ok' | 'nok' | 'na' | 'sim' | 'nao';
  tipo_resposta?: 'sim_nao' | 'conforme' | 'texto' | 'foto' | 'sim_nao_na';
  obrigatorio?: boolean;
  peso?: number;
  resposta?: unknown;
  observacao?: string;
  fotos?: string[];
}

export interface Checklist {
  id: string;
  titulo: string;
  descricao?: string;
  equipamento?: string;
  maquina?: string;
  foto_equipamento?: string;
  data: string;
  status: 'Conforme' | 'Não Conforme' | 'Pendente';
  company_id: string;
  site_id: string;
  inspetor_id: string;
  itens: ChecklistItem[];
  is_modelo?: boolean;
  ativo?: boolean;
  categoria?: string;
  periodicidade?: string;
  nivel_risco_padrao?: string;
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
  inspetor?: { nome: string };
  auditado_por?: { nome: string };
  company?: { razao_social: string };
}

export const checklistsService = {
  findAll: async (options?: { onlyTemplates?: boolean; excludeTemplates?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.onlyTemplates) {
      params.set('onlyTemplates', 'true');
    }
    if (options?.excludeTemplates) {
      params.set('excludeTemplates', 'true');
    }
    const query = params.toString();
    const response = await api.get<Checklist[]>(`/checklists${query ? `?${query}` : ''}`);
    return response.data;
  },

  findTemplates: async () => {
    const response = await api.get<Checklist[]>('/checklists?onlyTemplates=true');
    return response.data;
  },

  findOne: async (id: string) => {
    const response = await api.get<Checklist>(`/checklists/${id}`);
    return response.data;
  },

  create: async (data: Partial<Checklist>, companyId?: string) => {
    const response = await api.post<Checklist>('/checklists', data, {
      headers: companyId ? { 'x-company-id': companyId } : undefined,
    });
    return response.data;
  },

  update: async (id: string, data: Partial<Checklist>, companyId?: string) => {
    const response = await api.patch<Checklist>(`/checklists/${id}`, data, {
      headers: companyId ? { 'x-company-id': companyId } : undefined,
    });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/checklists/${id}`);
  },

  sendEmail: async (id: string, to: string) => {
    await api.post(`/checklists/${id}/send-email`, { to });
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/checklists/${id}/file`, formData, {
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
    }>(`/checklists/${id}/pdf`);
    return response.data;
  },

  listStoredFiles: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const response = await api.get('/checklists/files/list', { params: filters });
    return response.data;
  },

  // Novos métodos para fluxo de templates
  getTemplates: async (): Promise<Checklist[]> => {
    const response = await api.get<Checklist[]>('/checklists?onlyTemplates=true');
    return response.data;
  },

  getFilled: async (): Promise<Checklist[]> => {
    const response = await api.get<Checklist[]>('/checklists?excludeTemplates=true');
    return response.data;
  },

  fillFromTemplate: async (templateId: string, data: Partial<Checklist>): Promise<Checklist> => {
    const response = await api.post<Checklist>(`/checklists/fill-from-template/${templateId}`, data);
    return response.data;
  },

  savePdf: async (id: string): Promise<{ fileKey: string; folderPath: string; fileUrl: string }> => {
    const response = await api.post<{ fileKey: string; folderPath: string; fileUrl: string }>(`/checklists/${id}/save-pdf`);
    return response.data;
  },
};
