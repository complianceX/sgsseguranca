import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';

export interface MaoDeObraItem {
  funcao: string;
  quantidade: number;
  turno: 'manha' | 'tarde' | 'noite';
  horas: number;
}

export interface EquipamentoItem {
  nome: string;
  quantidade: number;
  horas_trabalhadas: number;
  horas_ociosas: number;
  observacao?: string;
}

export interface MaterialItem {
  descricao: string;
  unidade: string;
  quantidade: number;
  fornecedor?: string;
}

export interface ServicoItem {
  descricao: string;
  percentual_concluido: number;
  observacao?: string;
}

export interface OcorrenciaItem {
  tipo: 'acidente' | 'incidente' | 'visita' | 'paralisacao' | 'outro';
  descricao: string;
  hora?: string;
}

export interface Rdo {
  id: string;
  numero: string;
  data: string;
  status: string;
  company_id: string;
  site_id?: string;
  responsavel_id?: string;
  clima_manha?: string;
  clima_tarde?: string;
  temperatura_min?: number;
  temperatura_max?: number;
  condicao_terreno?: string;
  mao_de_obra?: MaoDeObraItem[];
  equipamentos?: EquipamentoItem[];
  materiais_recebidos?: MaterialItem[];
  servicos_executados?: ServicoItem[];
  ocorrencias?: OcorrenciaItem[];
  houve_acidente: boolean;
  houve_paralisacao: boolean;
  motivo_paralisacao?: string;
  observacoes?: string;
  programa_servicos_amanha?: string;
  assinatura_responsavel?: string;
  assinatura_engenheiro?: string;
  pdf_file_key?: string;
  pdf_folder_path?: string;
  pdf_original_name?: string;
  created_at: string;
  updated_at: string;
  site?: { id: string; nome: string };
  responsavel?: { id: string; nome: string };
  company?: { id: string; razao_social: string };
}

export const RDO_STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
};

export const RDO_STATUS_COLORS: Record<string, string> = {
  rascunho: 'border-[color:var(--ds-color-text-muted)]/30 bg-[color:var(--ds-color-text-muted)]/12 text-[var(--ds-color-text-muted)]',
  enviado: 'border-[color:var(--ds-color-info)]/35 bg-[color:var(--ds-color-info)]/15 text-[var(--ds-color-info)]',
  aprovado: 'border-[color:var(--ds-color-success)]/35 bg-[color:var(--ds-color-success)]/15 text-[var(--ds-color-success)]',
};

export const RDO_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  rascunho: ['enviado'],
  enviado: ['aprovado', 'rascunho'],
  aprovado: [],
};

export const CLIMA_LABEL: Record<string, string> = {
  ensolarado: 'Ensolarado',
  nublado: 'Nublado',
  chuvoso: 'Chuvoso',
  parcialmente_nublado: 'Parcialmente Nublado',
};

export const OCORRENCIA_TIPO_LABEL: Record<string, string> = {
  acidente: 'Acidente',
  incidente: 'Incidente',
  visita: 'Visita',
  paralisacao: 'Paralisação',
  outro: 'Outro',
};

export const rdosService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    site_id?: string;
    status?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<PaginatedResponse<Rdo>> => {
    const response = await api.get<PaginatedResponse<Rdo>>('/rdos', {
      params: {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 20,
        site_id: opts?.site_id,
        status: opts?.status,
        data_inicio: opts?.data_inicio,
        data_fim: opts?.data_fim,
      },
    });
    return response.data;
  },

  findAll: async (): Promise<Rdo[]> => {
    return fetchAllPages({
      fetchPage: (page, limit) => rdosService.findPaginated({ page, limit }),
      limit: 100,
      maxPages: 50,
    });
  },

  findOne: async (id: string): Promise<Rdo> => {
    const response = await api.get<Rdo>(`/rdos/${id}`);
    return response.data;
  },

  create: async (data: Partial<Rdo>): Promise<Rdo> => {
    const response = await api.post<Rdo>('/rdos', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Rdo>): Promise<Rdo> => {
    const response = await api.patch<Rdo>(`/rdos/${id}`, data);
    return response.data;
  },

  updateStatus: async (id: string, status: string): Promise<Rdo> => {
    const response = await api.patch<Rdo>(`/rdos/${id}/status`, { status });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/rdos/${id}`);
  },

  sign: async (
    id: string,
    body: {
      tipo: 'responsavel' | 'engenheiro';
      nome: string;
      cpf: string;
      hash: string;
      timestamp: string;
    },
  ): Promise<Rdo> => {
    const response = await api.patch<Rdo>(`/rdos/${id}/sign`, body);
    return response.data;
  },

  savePdf: async (id: string, filename: string): Promise<Rdo> => {
    const response = await api.post<Rdo>(`/rdos/${id}/save-pdf`, { filename });
    return response.data;
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/rdos/${id}/file`, formData, {
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
      url: string | null;
    }>(`/rdos/${id}/pdf`);
    return response.data;
  },

  sendEmail: async (id: string, to: string[]): Promise<void> => {
    await api.post(`/rdos/${id}/send-email`, { to });
  },

  listFiles: async (opts?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const response = await api.get('/rdos/files/list', { params: opts });
    return response.data;
  },

  downloadWeeklyBundle: async (filters: {
    company_id?: string;
    year: number;
    week: number;
  }) => {
    const response = await api.get('/rdos/files/weekly-bundle', {
      params: filters,
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  exportExcel: async (): Promise<Blob> => {
    const response = await api.get('/rdos/export/excel', { responseType: 'blob' });
    return response.data;
  },
};
