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
  created_at: string;
  updated_at: string;
  site?: { id: string; nome: string };
  responsavel?: { id: string; nome: string };
}

export const RDO_STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
};

export const RDO_STATUS_COLORS: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-700 border-gray-200',
  enviado: 'bg-blue-100 text-blue-700 border-blue-200',
  aprovado: 'bg-green-100 text-green-700 border-green-200',
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

  sendEmail: async (id: string, to: string[]): Promise<void> => {
    await api.post(`/rdos/${id}/send-email`, { to });
  },

  listFiles: async (opts?: { year?: string; week?: string }): Promise<Rdo[]> => {
    const response = await api.get<Rdo[]>('/rdos/files/list', { params: opts });
    return response.data;
  },

  exportExcel: async (): Promise<Blob> => {
    const response = await api.get('/rdos/export/excel', { responseType: 'blob' });
    return response.data;
  },
};
