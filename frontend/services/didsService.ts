import api from '@/lib/api';
import type { GovernedPdfAccessResponse } from '@/lib/api/generated/governed-contracts.client';
import type { PaginatedResponse } from './pagination';
import type { User } from './usersService';

export type DidStatus = 'rascunho' | 'alinhado' | 'executado' | 'arquivado';

export const DID_STATUS_LABEL: Record<DidStatus, string> = {
  rascunho: 'Rascunho',
  alinhado: 'Alinhado',
  executado: 'Executado',
  arquivado: 'Arquivado',
};

export const DID_STATUS_COLORS: Record<DidStatus, string> = {
  rascunho:
    'border-[color:var(--ds-color-warning)]/35 bg-[color:var(--ds-color-warning)]/15 text-[var(--ds-color-warning)]',
  alinhado:
    'border-[color:var(--ds-color-info)]/35 bg-[color:var(--ds-color-info)]/15 text-[var(--ds-color-info)]',
  executado:
    'border-[color:var(--ds-color-success)]/35 bg-[color:var(--ds-color-success)]/15 text-[var(--ds-color-success)]',
  arquivado:
    'border-[color:var(--ds-color-text-muted)]/30 bg-[color:var(--ds-color-text-muted)]/12 text-[var(--ds-color-text-muted)]',
};

export const DID_ALLOWED_TRANSITIONS: Record<DidStatus, DidStatus[]> = {
  rascunho: ['alinhado', 'arquivado'],
  alinhado: ['executado', 'arquivado'],
  executado: ['arquivado'],
  arquivado: [],
};

export interface Did {
  id: string;
  titulo: string;
  descricao?: string | null;
  data: string;
  turno?: string | null;
  frente_trabalho?: string | null;
  atividade_principal: string;
  atividades_planejadas: string;
  riscos_operacionais: string;
  controles_planejados: string;
  epi_epc_aplicaveis?: string | null;
  observacoes?: string | null;
  company_id: string;
  site_id: string;
  responsavel_id: string;
  participants: User[];
  pdf_file_key?: string | null;
  pdf_folder_path?: string | null;
  pdf_original_name?: string | null;
  status: DidStatus;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  site?: { id?: string; nome: string };
  responsavel?: { id?: string; nome: string };
  company?: { id?: string; razao_social: string };
}

export type DidMutationInput = {
  titulo: string;
  descricao?: string;
  data: string;
  turno?: string;
  frente_trabalho?: string;
  atividade_principal: string;
  atividades_planejadas: string;
  riscos_operacionais: string;
  controles_planejados: string;
  epi_epc_aplicaveis?: string;
  observacoes?: string;
  company_id?: string;
  site_id: string;
  responsavel_id: string;
  participants: string[];
};

export interface DidAttachFileResult {
  fileKey: string;
  folderPath: string;
  originalName: string;
  storageMode: 's3';
  degraded: boolean;
  message: string;
}

export interface DidPdfAccess
  extends Omit<GovernedPdfAccessResponse, 'entityId'> {
  didId: string;
  degraded: boolean;
}

export const didsService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: DidStatus;
  }): Promise<PaginatedResponse<Did>> => {
    const response = await api.get<PaginatedResponse<Did>>('/dids', {
      params: {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 20,
        ...(opts?.search ? { search: opts.search } : {}),
        ...(opts?.status ? { status: opts.status } : {}),
      },
    });
    return response.data;
  },

  findOne: async (id: string): Promise<Did> => {
    const response = await api.get<Did>(`/dids/${id}`);
    return response.data;
  },

  create: async (data: DidMutationInput): Promise<Did> => {
    const response = await api.post<Did>('/dids', data);
    return response.data;
  },

  update: async (id: string, data: Partial<DidMutationInput>): Promise<Did> => {
    const response = await api.patch<Did>(`/dids/${id}`, data);
    return response.data;
  },

  updateStatus: async (id: string, status: DidStatus): Promise<Did> => {
    const response = await api.patch<Did>(`/dids/${id}/status`, { status });
    return response.data;
  },

  attachFile: async (id: string, file: File): Promise<DidAttachFileResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<DidAttachFileResult>(
      `/dids/${id}/file`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data;
  },

  getPdfAccess: async (id: string): Promise<DidPdfAccess> => {
    const response = await api.get<GovernedPdfAccessResponse & { degraded: boolean }>(
      `/dids/${id}/pdf`,
    );
    return {
      didId: response.data.entityId,
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
    await api.delete(`/dids/${id}`);
  },
};
