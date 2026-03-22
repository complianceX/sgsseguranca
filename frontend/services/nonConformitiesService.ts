import api from "@/lib/api";
import type { GovernedPdfAccessResponse, GovernedPdfAccessAvailability } from "@/lib/api/generated/governed-contracts.client";
import type {
  GovernedDocumentVideoAccessResponse,
  GovernedDocumentVideoAttachment,
  GovernedDocumentVideoMutationResponse,
} from "@/lib/videos/documentVideos";
import { AxiosError } from "axios";
import { Site } from "./sitesService";
import { enqueueOfflineMutation } from "@/lib/offline-sync";
import {
  getOfflineCache,
  isOfflineRequestError,
  setOfflineCache,
} from "@/lib/offline-cache";
import { fetchAllPages, PaginatedResponse } from "./pagination";

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

export type NonConformityPdfAccessAvailability = GovernedPdfAccessAvailability;
export type NonConformityPdfAccessResponse = GovernedPdfAccessResponse;

export interface NonConformityAnalyticsOverview {
  totalNonConformities: number;
  abertas: number;
  emAndamento: number;
  aguardandoValidacao: number;
  encerradas: number;
}

export type NonConformityAttachmentAccessAvailability =
  | "ready"
  | "registered_without_signed_url";

export interface GovernedNonConformityAttachmentReference {
  v: 1;
  kind: "governed-storage";
  fileKey: string;
  originalName: string;
  mimeType: string;
  uploadedAt: string;
  sizeBytes?: number | null;
}

export interface NonConformityAttachmentAccessResponse {
  entityId: string;
  index: number;
  hasGovernedAttachment: true;
  availability: NonConformityAttachmentAccessAvailability;
  fileKey: string;
  originalName: string;
  mimeType: string;
  url: string | null;
  degraded: boolean;
  message: string | null;
}

export interface NonConformityAttachmentAttachResponse {
  entityId: string;
  attachments: string[];
  attachmentCount: number;
  storageMode: "governed-storage";
  degraded: false;
  message: string;
  attachment: {
    index: number;
    fileKey: string;
    originalName: string;
    mimeType: string;
  };
}

export enum NcStatus {
  ABERTA = "ABERTA",
  EM_ANDAMENTO = "EM_ANDAMENTO",
  AGUARDANDO_VALIDACAO = "AGUARDANDO_VALIDACAO",
  ENCERRADA = "ENCERRADA",
}

export const NC_STATUS_LABEL: Record<NcStatus, string> = {
  [NcStatus.ABERTA]: "Aberta",
  [NcStatus.EM_ANDAMENTO]: "Em Andamento",
  [NcStatus.AGUARDANDO_VALIDACAO]: "Aguard. Validação",
  [NcStatus.ENCERRADA]: "Encerrada",
};

export const NC_STATUS_COLORS: Record<NcStatus, string> = {
  [NcStatus.ABERTA]: "bg-red-100 text-red-700 border-red-200",
  [NcStatus.EM_ANDAMENTO]: "bg-amber-100 text-amber-700 border-amber-200",
  [NcStatus.AGUARDANDO_VALIDACAO]: "bg-blue-100 text-blue-700 border-blue-200",
  [NcStatus.ENCERRADA]: "bg-green-100 text-green-700 border-green-200",
};

export const NC_ALLOWED_TRANSITIONS: Record<NcStatus, NcStatus[]> = {
  [NcStatus.ABERTA]: [NcStatus.EM_ANDAMENTO],
  [NcStatus.EM_ANDAMENTO]: [NcStatus.AGUARDANDO_VALIDACAO, NcStatus.ABERTA],
  [NcStatus.AGUARDANDO_VALIDACAO]: [NcStatus.ENCERRADA, NcStatus.ABERTA],
  [NcStatus.ENCERRADA]: [NcStatus.ABERTA],
};

const GOVERNED_ATTACHMENT_REF_PREFIX = "gst:nc-attachment:";

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4 || 4)) % 4),
    "=",
  );
  return atob(padded);
}

export function parseGovernedNcAttachmentReference(
  value?: string | null,
): GovernedNonConformityAttachmentReference | null {
  const normalized = String(value || "").trim();
  if (!normalized.startsWith(GOVERNED_ATTACHMENT_REF_PREFIX)) {
    return null;
  }

  const encodedPayload = normalized.slice(GOVERNED_ATTACHMENT_REF_PREFIX.length);
  if (!encodedPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      decodeBase64Url(encodedPayload),
    ) as Partial<GovernedNonConformityAttachmentReference>;
    if (
      parsed?.v !== 1 ||
      parsed.kind !== "governed-storage" ||
      typeof parsed.fileKey !== "string" ||
      typeof parsed.originalName !== "string" ||
      typeof parsed.mimeType !== "string" ||
      typeof parsed.uploadedAt !== "string"
    ) {
      return null;
    }

    return parsed as GovernedNonConformityAttachmentReference;
  } catch {
    return null;
  }
}

export function isGovernedNcAttachmentReference(
  value?: string | null,
): boolean {
  return Boolean(parseGovernedNcAttachmentReference(value));
}

export function normalizeNcStatus(value?: string | null): NcStatus {
  const normalized =
    value
      ?.trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase() || "";

  switch (normalized) {
    case NcStatus.ABERTA:
    case "ABERTA":
      return NcStatus.ABERTA;
    case NcStatus.EM_ANDAMENTO:
    case "EM_TRATAMENTO":
      return NcStatus.EM_ANDAMENTO;
    case NcStatus.AGUARDANDO_VALIDACAO:
      return NcStatus.AGUARDANDO_VALIDACAO;
    case NcStatus.ENCERRADA:
    case "FINALIZADA":
    case "CONCLUIDA":
      return NcStatus.ENCERRADA;
    default:
      return NcStatus.ABERTA;
  }
}

function normalizeNonConformity(item: NonConformity): NonConformity {
  return {
    ...item,
    status: normalizeNcStatus(item.status),
  };
}

export const nonConformitiesService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<NonConformity>> => {
    const response = await api.get<PaginatedResponse<NonConformity>>(
      "/nonconformities",
      {
        params: {
          page: opts?.page ?? 1,
          limit: opts?.limit ?? 20,
          ...(opts?.search ? { search: opts.search } : {}),
        },
      },
    );
    return {
      ...response.data,
      data: response.data.data.map(normalizeNonConformity),
    };
  },

  findAll: async () => {
    const cacheKey = "nonconformities.all";
    try {
      const all = await fetchAllPages({
        fetchPage: (page, limit) =>
          nonConformitiesService.findPaginated({
            page,
            limit,
          }),
        limit: 100,
        maxPages: 50,
      });
      setOfflineCache(cacheKey, all);
      return all;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<NonConformity[]>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findOne: async (id: string) => {
    const cacheKey = `nonconformities.one.${id}`;
    try {
      const response = await api.get<NonConformity>(`/nonconformities/${id}`);
      const normalized = normalizeNonConformity(response.data);
      setOfflineCache(cacheKey, normalized);
      return normalized;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<NonConformity>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  create: async (data: Partial<NonConformity>) => {
    try {
      const response = await api.post<NonConformity>("/nonconformities", data);
      return normalizeNonConformity(response.data);
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== "ERR_NETWORK") {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: "/nonconformities",
        method: "post",
        data,
        label: "NC",
      });

      return {
        ...(data as NonConformity),
        id: queued.id,
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as NonConformity & { offlineQueued: true };
    }
  },

  update: async (id: string, data: Partial<NonConformity>) => {
    try {
      const response = await api.patch<NonConformity>(
        `/nonconformities/${id}`,
        data,
      );
      return normalizeNonConformity(response.data);
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== "ERR_NETWORK") {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: `/nonconformities/${id}`,
        method: "patch",
        data,
        label: "NC",
      });

      return {
        ...(data as NonConformity),
        id,
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as NonConformity & { offlineQueued: true };
    }
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post(`/nonconformities/${id}/file`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  getPdfAccess: async (id: string) => {
    const response = await api.get<NonConformityPdfAccessResponse>(
      `/nonconformities/${id}/pdf`,
    );
    return response.data;
  },

  attachAttachment: async (
    id: string,
    file: File,
  ): Promise<NonConformityAttachmentAttachResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<NonConformityAttachmentAttachResponse>(
      `/nonconformities/${id}/attachments`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return response.data;
  },

  getAttachmentAccess: async (
    id: string,
    index: number,
  ): Promise<NonConformityAttachmentAccessResponse> => {
    const response = await api.get<NonConformityAttachmentAccessResponse>(
      `/nonconformities/${id}/attachments/${index}/access`,
    );
    return response.data;
  },

  listVideoAttachments: async (id: string) => {
    const response = await api.get<GovernedDocumentVideoAttachment[]>(
      `/nonconformities/${id}/videos`,
    );
    return response.data;
  },

  uploadVideoAttachment: async (
    id: string,
    file: File,
  ): Promise<GovernedDocumentVideoMutationResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<GovernedDocumentVideoMutationResponse>(
      `/nonconformities/${id}/videos`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return response.data;
  },

  getVideoAttachmentAccess: async (
    id: string,
    attachmentId: string,
  ): Promise<GovernedDocumentVideoAccessResponse> => {
    const response = await api.get<GovernedDocumentVideoAccessResponse>(
      `/nonconformities/${id}/videos/${attachmentId}/access`,
    );
    return response.data;
  },

  removeVideoAttachment: async (
    id: string,
    attachmentId: string,
  ): Promise<GovernedDocumentVideoMutationResponse> => {
    const response = await api.delete<GovernedDocumentVideoMutationResponse>(
      `/nonconformities/${id}/videos/${attachmentId}`,
    );
    return response.data;
  },

  listStoredFiles: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const response = await api.get("/nonconformities/files/list", {
      params: filters,
    });
    return response.data;
  },

  downloadWeeklyBundle: async (filters: {
    company_id?: string;
    year: number;
    week: number;
  }) => {
    const response = await api.get("/nonconformities/files/weekly-bundle", {
      params: filters,
      responseType: "blob",
    });
    return response.data as Blob;
  },

  updateStatus: async (id: string, status: NcStatus) => {
    const response = await api.patch<NonConformity>(
      `/nonconformities/${id}/status`,
      { status },
    );
    return normalizeNonConformity(response.data);
  },

  getMonthlyAnalytics: async (): Promise<{ mes: string; total: number }[]> => {
    const response = await api.get<{ mes: string; total: number }[]>(
      "/nonconformities/analytics/monthly",
    );
    return response.data;
  },

  getAnalyticsOverview: async (): Promise<NonConformityAnalyticsOverview> => {
    const response = await api.get<NonConformityAnalyticsOverview>(
      "/nonconformities/analytics/overview",
    );
    return response.data;
  },

  remove: async (id: string) => {
    await api.delete(`/nonconformities/${id}`);
  },
};
