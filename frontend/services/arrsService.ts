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
  document_code?: string | null;
  final_pdf_hash_sha256?: string | null;
  pdf_generated_at?: string | null;
  emitted_by_user_id?: string | null;
  status: ArrStatus;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  site?: { id?: string; nome: string };
  responsavel?: { id?: string; nome: string };
  emitted_by?: { id?: string; nome: string };
  company?: { id?: string; razao_social: string; logo_url?: string | null };
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

function normalizeOptionalString(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function sanitizeArrMutationPayload(data: Partial<ArrMutationInput>) {
  const payload: Partial<ArrMutationInput> = {};

  if ('titulo' in data) payload.titulo = normalizeOptionalString(data.titulo) || '';
  if ('descricao' in data) payload.descricao = normalizeOptionalString(data.descricao);
  if ('data' in data) payload.data = normalizeOptionalString(data.data) || '';
  if ('turno' in data) payload.turno = normalizeOptionalString(data.turno);
  if ('frente_trabalho' in data) {
    payload.frente_trabalho = normalizeOptionalString(data.frente_trabalho);
  }
  if ('atividade_principal' in data) {
    payload.atividade_principal =
      normalizeOptionalString(data.atividade_principal) || '';
  }
  if ('condicao_observada' in data) {
    payload.condicao_observada =
      normalizeOptionalString(data.condicao_observada) || '';
  }
  if ('risco_identificado' in data) {
    payload.risco_identificado =
      normalizeOptionalString(data.risco_identificado) || '';
  }
  if ('nivel_risco' in data) payload.nivel_risco = data.nivel_risco;
  if ('probabilidade' in data) payload.probabilidade = data.probabilidade;
  if ('severidade' in data) payload.severidade = data.severidade;
  if ('controles_imediatos' in data) {
    payload.controles_imediatos =
      normalizeOptionalString(data.controles_imediatos) || '';
  }
  if ('acao_recomendada' in data) {
    payload.acao_recomendada = normalizeOptionalString(data.acao_recomendada);
  }
  if ('epi_epc_aplicaveis' in data) {
    payload.epi_epc_aplicaveis = normalizeOptionalString(data.epi_epc_aplicaveis);
  }
  if ('observacoes' in data) {
    payload.observacoes = normalizeOptionalString(data.observacoes);
  }
  if ('company_id' in data) payload.company_id = normalizeOptionalString(data.company_id);
  if ('site_id' in data) payload.site_id = normalizeOptionalString(data.site_id) || '';
  if ('responsavel_id' in data) {
    payload.responsavel_id = normalizeOptionalString(data.responsavel_id) || '';
  }
  if ('participants' in data) {
    payload.participants = Array.isArray(data.participants)
      ? Array.from(
          new Set(
            data.participants
              .map((participantId) => normalizeOptionalString(participantId))
              .filter((participantId): participantId is string =>
                Boolean(participantId),
              ),
          ),
        )
      : [];
  }

  return payload;
}

export const arrsService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: ArrStatus;
  }): Promise<PaginatedResponse<Arr>> => {
    const params = {
      page: opts?.page ?? 1,
      limit: opts?.limit ?? 20,
      ...(opts?.search ? { search: opts.search } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
    };
    const cacheKey = `arrs.paginated.${JSON.stringify(params)}`;

    try {
      const response = await api.get<PaginatedResponse<Arr>>('/arrs', {
        params,
      });
      setOfflineCache(cacheKey, response.data, CACHE_TTL.LIST);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = consumeOfflineCache<PaginatedResponse<Arr>>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findOne: async (id: string): Promise<Arr> => {
    const cacheKey = `arrs.one.${id}`;

    try {
      const response = await api.get<Arr>(`/arrs/${id}`);
      setOfflineCache(cacheKey, response.data, CACHE_TTL.RECORD);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = consumeOfflineCache<Arr>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  create: async (data: ArrMutationInput): Promise<Arr> => {
    const response = await api.post<Arr>('/arrs', sanitizeArrMutationPayload(data));
    return response.data;
  },

  update: async (id: string, data: Partial<ArrMutationInput>): Promise<Arr> => {
    const response = await api.patch<Arr>(
      `/arrs/${id}`,
      sanitizeArrMutationPayload(data),
    );
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
