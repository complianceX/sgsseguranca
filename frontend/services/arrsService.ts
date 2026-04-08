import api from '@/lib/api';
import type { GovernedPdfAccessResponse } from '@/lib/api/generated/governed-contracts.client';
import type { PaginatedResponse } from './pagination';
import type { User } from './usersService';

export type ArrStatus = 'rascunho' | 'analisada' | 'tratada' | 'arquivada';

export const ARR_STATUS_LABEL: Record<ArrStatus, string> = {
  rascunho: 'Rascunho',
  analisada: 'Analisada',
  tratada: 'Tratada',
  arquivada: 'Arquivada',
};

export const ARR_STATUS_COLORS: Record<ArrStatus, string> = {
  rascunho:
    'border-[color:var(--ds-color-warning)]/35 bg-[color:var(--ds-color-warning)]/15 text-[var(--ds-color-warning)]',
  analisada:
    'border-[color:var(--ds-color-info)]/35 bg-[color:var(--ds-color-info)]/15 text-[var(--ds-color-info)]',
  tratada:
    'border-[color:var(--ds-color-success)]/35 bg-[color:var(--ds-color-success)]/15 text-[var(--ds-color-success)]',
  arquivada:
    'border-[color:var(--ds-color-text-muted)]/30 bg-[color:var(--ds-color-text-muted)]/12 text-[var(--ds-color-text-muted)]',
};

export const ARR_ALLOWED_TRANSITIONS: Record<ArrStatus, ArrStatus[]> = {
  rascunho: ['analisada', 'arquivada'],
  analisada: ['tratada', 'arquivada'],
  tratada: ['arquivada'],
  arquivada: [],
};

export type ArrRiskLevel = 'baixo' | 'medio' | 'alto' | 'critico';
export type ArrProbability = 'baixa' | 'media' | 'alta';
export type ArrSeverity = 'leve' | 'moderada' | 'grave' | 'critica';

export const ARR_RISK_LEVEL_LABEL: Record<ArrRiskLevel, string> = {
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
  critico: 'Crítico',
};

export const ARR_PROBABILITY_LABEL: Record<ArrProbability, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

export const ARR_SEVERITY_LABEL: Record<ArrSeverity, string> = {
  leve: 'Leve',
  moderada: 'Moderada',
  grave: 'Grave',
  critica: 'Crítica',
};

export interface Arr {
  id: string;
  titulo: string;
  descricao?: string | null;
  data: string;
  turno?: string | null;
  frente_trabalho?: string | null;
  atividade_principal: string;
  condicao_observada: string;
  risco_identificado: string;
  nivel_risco: ArrRiskLevel;
  probabilidade: ArrProbability;
  severidade: ArrSeverity;
  controles_imediatos: string;
  acao_recomendada?: string | null;
  epi_epc_aplicaveis?: string | null;
  observacoes?: string | null;
  company_id: string;
  site_id: string;
  responsavel_id: string;
  participants: User[];
  pdf_file_key?: string | null;
  pdf_folder_path?: string | null;
  pdf_original_name?: string | null;
  status: ArrStatus;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  site?: { id?: string; nome: string };
  responsavel?: { id?: string; nome: string };
  company?: { id?: string; razao_social: string };
}

export type ArrMutationInput = {
  titulo: string;
  descricao?: string;
  data: string;
  turno?: string;
  frente_trabalho?: string;
  atividade_principal: string;
  condicao_observada: string;
  risco_identificado: string;
  nivel_risco: ArrRiskLevel;
  probabilidade: ArrProbability;
  severidade: ArrSeverity;
  controles_imediatos: string;
  acao_recomendada?: string;
  epi_epc_aplicaveis?: string;
  observacoes?: string;
  company_id?: string;
  site_id: string;
  responsavel_id: string;
  participants: string[];
};

export interface ArrAttachFileResult {
  fileKey: string;
  folderPath: string;
  originalName: string;
  storageMode: 's3';
  degraded: boolean;
  message: string;
}

export interface ArrPdfAccess
  extends Omit<GovernedPdfAccessResponse, 'entityId'> {
  arrId: string;
  degraded: boolean;
}

export const arrsService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: ArrStatus;
  }): Promise<PaginatedResponse<Arr>> => {
    const response = await api.get<PaginatedResponse<Arr>>('/arrs', {
      params: {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 20,
        ...(opts?.search ? { search: opts.search } : {}),
        ...(opts?.status ? { status: opts.status } : {}),
      },
    });
    return response.data;
  },

  findOne: async (id: string): Promise<Arr> => {
    const response = await api.get<Arr>(`/arrs/${id}`);
    return response.data;
  },

  create: async (data: ArrMutationInput): Promise<Arr> => {
    const response = await api.post<Arr>('/arrs', data);
    return response.data;
  },

  update: async (id: string, data: Partial<ArrMutationInput>): Promise<Arr> => {
    const response = await api.patch<Arr>(`/arrs/${id}`, data);
    return response.data;
  },

  updateStatus: async (id: string, status: ArrStatus): Promise<Arr> => {
    const response = await api.patch<Arr>(`/arrs/${id}/status`, { status });
    return response.data;
  },

  attachFile: async (id: string, file: File): Promise<ArrAttachFileResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<ArrAttachFileResult>(
      `/arrs/${id}/file`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data;
  },

  getPdfAccess: async (id: string): Promise<ArrPdfAccess> => {
    const response = await api.get<GovernedPdfAccessResponse & { degraded: boolean }>(
      `/arrs/${id}/pdf`,
    );
    return {
      arrId: response.data.entityId,
      hasFinalPdf: response.data.hasFinalPdf,
      availability: response.data.availability,
      message: response.data.message,
      fileKey: response.data.fileKey,
      folderPath: response.data.folderPath,
      originalName: response.data.originalName,
      url: response.data.url,
      degraded: response.data.degraded,
    };
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/arrs/${id}`);
  },
};
