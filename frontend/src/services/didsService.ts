import api from '@/lib/api';
import type { GovernedPdfAccessResponse } from '@/lib/api/generated/governed-contracts.client';
import type { PaginatedResponse } from './pagination';
import type { User } from './usersService';
import {
  consumeOfflineCache,
  isOfflineRequestError,
  setOfflineCache,
  CACHE_TTL,
} from '@/lib/offline-cache';

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
  company?: { id?: string; razao_social: string; logo_url?: string | null };
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

function normalizeOptionalString(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function sanitizeDidMutationPayload(data: Partial<DidMutationInput>) {
  const rest = { ...data };
  delete rest.company_id;

  return {
    ...rest,
    titulo: normalizeOptionalString(rest.titulo) || '',
    descricao: normalizeOptionalString(rest.descricao),
    turno: normalizeOptionalString(rest.turno),
    frente_trabalho: normalizeOptionalString(rest.frente_trabalho),
    atividade_principal: normalizeOptionalString(rest.atividade_principal) || '',
    atividades_planejadas:
      normalizeOptionalString(rest.atividades_planejadas) || '',
    riscos_operacionais:
      normalizeOptionalString(rest.riscos_operacionais) || '',
    controles_planejados:
      normalizeOptionalString(rest.controles_planejados) || '',
    epi_epc_aplicaveis: normalizeOptionalString(rest.epi_epc_aplicaveis),
    observacoes: normalizeOptionalString(rest.observacoes),
    site_id: normalizeOptionalString(rest.site_id) || '',
    responsavel_id: normalizeOptionalString(rest.responsavel_id) || '',
    participants: Array.isArray(rest.participants)
      ? Array.from(
          new Set(
            rest.participants.filter((participantId) =>
              Boolean(normalizeOptionalString(participantId)),
            ),
          ),
        )
      : [],
  };
}

function resolveCompanyHeader(data: Partial<DidMutationInput>) {
  const companyId = normalizeOptionalString(data.company_id);
  return companyId ? { 'x-company-id': companyId } : undefined;
}

export const didsService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: DidStatus;
  }): Promise<PaginatedResponse<Did>> => {
    const params = {
      page: opts?.page ?? 1,
      limit: opts?.limit ?? 20,
      ...(opts?.search ? { search: opts.search } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
    };
    const cacheKey = `dids.paginated.${JSON.stringify(params)}`;

    try {
      const response = await api.get<PaginatedResponse<Did>>('/dids', {
        params,
      });
      setOfflineCache(cacheKey, response.data, CACHE_TTL.LIST);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = consumeOfflineCache<PaginatedResponse<Did>>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findOne: async (id: string): Promise<Did> => {
    const cacheKey = `dids.one.${id}`;

    try {
      const response = await api.get<Did>(`/dids/${id}`);
      setOfflineCache(cacheKey, response.data, CACHE_TTL.RECORD);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = consumeOfflineCache<Did>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  create: async (data: DidMutationInput): Promise<Did> => {
    const response = await api.post<Did>(
      '/dids',
      sanitizeDidMutationPayload(data),
      { headers: resolveCompanyHeader(data) },
    );
    return response.data;
  },

  update: async (id: string, data: Partial<DidMutationInput>): Promise<Did> => {
    const response = await api.patch<Did>(
      `/dids/${id}`,
      sanitizeDidMutationPayload(data),
      { headers: resolveCompanyHeader(data) },
    );
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
