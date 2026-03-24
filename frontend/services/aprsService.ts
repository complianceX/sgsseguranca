import api from "@/lib/api";
import type { GovernedPdfAccessResponse } from "@/lib/api/generated/governed-contracts.client";
import { AxiosResponse } from "axios";
import { AxiosError } from "axios";
import { Activity } from "./activitiesService";
import { Risk } from "./risksService";
import { Epi } from "./episService";
import { Tool } from "./toolsService";
import { Machine } from "./machinesService";
import { User } from "./usersService";

import { Site } from "./sitesService";
import { Company } from "./companiesService";
import { fetchAllPages, PaginatedResponse } from "./pagination";
import { enqueueOfflineMutation } from "@/lib/offline-sync";
import {
  getOfflineCache,
  isOfflineRequestError,
  setOfflineCache,
} from "@/lib/offline-cache";

export interface AprRiskItemInput {
  atividade_processo?: string;
  agente_ambiental?: string;
  condicao_perigosa?: string;
  fonte_circunstancia?: string;
  fontes_circunstancias?: string;
  possiveis_lesoes?: string;
  probabilidade?: number;
  severidade?: number;
  categoria_risco?: string;
  medidas_prevencao?: string;
  responsavel?: string;
  prazo?: string;
  status_acao?: string;
}

export interface AprExcelImportPreview {
  fileName: string;
  sheetName: string;
  importedRows: number;
  ignoredRows: number;
  warnings: string[];
  errors: string[];
  matchedColumns: Record<string, string>;
  draft: {
    numero?: string;
    titulo?: string;
    descricao?: string;
    data_inicio?: string;
    data_fim?: string;
    company_name?: string;
    cnpj?: string;
    site_name?: string;
    unidade_setor?: string;
    local_atividade?: string;
    elaborador_name?: string;
    aprovador_name?: string;
    risk_items: AprRiskItemInput[];
  };
}

export interface Apr {
  id: string;
  numero: string;
  titulo: string;
  descricao?: string;
  data_inicio: string;
  data_fim: string;
  status: "Pendente" | "Aprovada" | "Cancelada" | "Encerrada";
  is_modelo?: boolean;
  is_modelo_padrao?: boolean;
  itens_risco?: Array<Record<string, string>>;
  probability?: number;
  severity?: number;
  exposure?: number;
  initial_risk?: number;
  residual_risk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  evidence_photo?: string;
  evidence_document?: string;
  control_description?: string;
  control_evidence?: boolean;
  company_id: string;
  company?: Company;
  site_id: string;
  site?: Site;
  elaborador_id: string;
  elaborador?: User;
  activities: Activity[];
  risks: Risk[];
  epis: Epi[];
  tools: Tool[];
  machines: Machine[];
  participants: User[];
  auditado_por_id?: string;
  auditado_por?: User;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
  pdf_file_key?: string;
  pdf_folder_path?: string;
  pdf_original_name?: string;
  versao?: number;
  parent_apr_id?: string;
  aprovado_por_id?: string;
  aprovado_por?: User;
  aprovado_em?: string;
  classificacao_resumo?: {
    total: number;
    aceitavel: number;
    atencao: number;
    substancial: number;
    critico: number;
  };
  risk_items?: Array<{
    id: string;
    apr_id: string;
    atividade?: string;
    agente_ambiental?: string;
    condicao_perigosa?: string;
    fonte_circunstancia?: string;
    lesao?: string;
    probabilidade?: number;
    severidade?: number;
    score_risco?: number;
    categoria_risco?: string;
    prioridade?: string;
    medidas_prevencao?: string;
    responsavel?: string;
    prazo?: string;
    status_acao?: string;
    ordem: number;
    created_at: string;
    updated_at: string;
  }>;
  risk_evidences?: Array<{
    id: string;
    apr_id: string;
    apr_risk_item_id: string;
    uploaded_by_id?: string;
    file_key: string;
    original_name?: string;
    mime_type: string;
    file_size_bytes: number;
    hash_sha256: string;
    watermarked_file_key?: string;
    watermarked_hash_sha256?: string;
    watermark_text?: string;
    captured_at?: string;
    uploaded_at: string;
    latitude?: number;
    longitude?: number;
    accuracy_m?: number;
    device_id?: string;
    ip_address?: string;
    exif_datetime?: string;
    integrity_flags?: Record<string, unknown>;
    risk_item_ordem?: number;
    url?: string;
    watermarked_url?: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface CreateAprDto {
  numero: string;
  titulo: string;
  descricao?: string;
  data_inicio: string;
  data_fim: string;
  status?: "Pendente" | "Aprovada" | "Cancelada" | "Encerrada";
  is_modelo?: boolean;
  is_modelo_padrao?: boolean;
  itens_risco?: Array<Record<string, string>>;
  risk_items?: AprRiskItemInput[];
  probability?: number;
  severity?: number;
  exposure?: number;
  residual_risk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  evidence_photo?: string;
  evidence_document?: string;
  control_description?: string;
  control_evidence?: boolean;
  company_id?: string;
  site_id: string;
  elaborador_id: string;
  activities?: string[];
  risks?: string[];
  epis?: string[];
  tools?: string[];
  machines?: string[];
  participants?: string[];
  auditado_por_id?: string;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
}

export type AprPdfAccessResponse = GovernedPdfAccessResponse;
export type AprFinalPdfGenerationResponse = AprPdfAccessResponse & {
  generated: boolean;
};

function sanitizeAprWritePayload(
  data: Partial<CreateAprDto>,
): Partial<CreateAprDto> {
  const {
    company_id,
    status,
    activities,
    risks,
    epis,
    tools,
    machines,
    participants,
    ...rest
  } = data;
  void company_id;
  void status;

  const dedupe = (values?: string[]) =>
    Array.isArray(values)
      ? Array.from(new Set(values.filter(Boolean)))
      : values;

  return {
    ...rest,
    activities: dedupe(activities),
    risks: dedupe(risks),
    epis: dedupe(epis),
    tools: dedupe(tools),
    machines: dedupe(machines),
    participants: dedupe(participants),
  };
}

export const aprsService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    companyId?: string;
    isModeloPadrao?: boolean;
  }) => {
    const params = {
      page: opts?.page ?? 1,
      limit: opts?.limit ?? 20,
      ...(opts?.search ? { search: opts.search } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.companyId ? { company_id: opts.companyId } : {}),
      ...(opts?.isModeloPadrao !== undefined
        ? { is_modelo_padrao: opts.isModeloPadrao }
        : {}),
    };
    const cacheKey = `aprs.paginated.${JSON.stringify(params)}`;

    try {
      const response = await api.get<PaginatedResponse<Apr>>("/aprs", {
        params,
      });
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<PaginatedResponse<Apr>>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findAll: async (companyId?: string) => {
    const cacheKey = "aprs.all";
    try {
      const data = await fetchAllPages({
        fetchPage: (page, limit) =>
          aprsService.findPaginated({ page, limit, companyId }),
        limit: 100,
        maxPages: 20,
      });
      setOfflineCache(cacheKey, data);
      return data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<Apr[]>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findOne: async (id: string) => {
    const cacheKey = `aprs.one.${id}`;
    try {
      const response = await api.get<Apr>(`/aprs/${id}`);
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<Apr>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  create: async (data: CreateAprDto) => {
    const payload = sanitizeAprWritePayload(data) as CreateAprDto;
    const localCompanyId = data.company_id;
    try {
      const response = await api.post<Apr>("/aprs", payload);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== "ERR_NETWORK") {
        throw error;
      }

      const queued = await enqueueOfflineMutation({
        url: "/aprs",
        method: "post",
        data: payload,
        label: "APR",
      });

      return {
        ...(payload as unknown as Partial<Apr>),
        company_id: localCompanyId || "",
        id: queued.id,
        status: "Pendente" as Apr["status"],
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as Apr & { offlineQueued: true };
    }
  },

  update: async (id: string, data: Partial<CreateAprDto>) => {
    const payload = sanitizeAprWritePayload(data);
    const localCompanyId = data.company_id;
    try {
      const response = await api.patch<Apr>(`/aprs/${id}`, payload);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== "ERR_NETWORK") {
        throw error;
      }

      const queued = await enqueueOfflineMutation({
        url: `/aprs/${id}`,
        method: "patch",
        data: payload,
        label: "APR",
      });

      return {
        ...(payload as unknown as Partial<Apr>),
        ...(localCompanyId ? { company_id: localCompanyId } : {}),
        id,
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as Apr & { offlineQueued: true };
    }
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post(`/aprs/${id}/file`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  getPdfAccess: async (id: string) => {
    const response = await api.get<AprPdfAccessResponse>(`/aprs/${id}/pdf`);
    return response.data;
  },

  generateFinalPdf: async (id: string) => {
    const response = await api.post<AprFinalPdfGenerationResponse>(
      `/aprs/${id}/generate-final-pdf`,
    );
    return response.data;
  },

  previewExcelImport: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<AprExcelImportPreview>(
      "/aprs/import/excel/preview",
      formData,
    );
    return response.data;
  },

  listStoredFiles: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const response = await api.get("/aprs/files/list", { params: filters });
    return response.data;
  },

  downloadWeeklyBundle: async (filters: {
    company_id?: string;
    year: number;
    week: number;
  }) => {
    const response = await api.get("/aprs/files/weekly-bundle", {
      params: filters,
      responseType: "blob",
    });
    return response.data as Blob;
  },

  finalize: async (id: string) => {
    const response = await api.post<Apr>(`/aprs/${id}/finalize`);
    return response.data;
  },

  approve: async (id: string, reason?: string) => {
    const response = await api.post<Apr>(`/aprs/${id}/approve`, { reason });
    return response.data;
  },

  reject: async (id: string, reason: string) => {
    const response = await api.post<Apr>(`/aprs/${id}/reject`, { reason });
    return response.data;
  },

  createNewVersion: async (id: string) => {
    const response = await api.post<Apr>(`/aprs/${id}/new-version`);
    return response.data;
  },

  getLogs: async (id: string) => {
    const response = await api.get<
      Array<{
        id: string;
        apr_id: string;
        usuario_id?: string;
        acao: string;
        metadata?: Record<string, unknown>;
        data_hora: string;
      }>
    >(`/aprs/${id}/logs`);
    return response.data;
  },

  getAnalyticsOverview: async () => {
    const response = await api.get<{
      totalAprs: number;
      aprovadas: number;
      pendentes: number;
      riscosCriticos: number;
      mediaScoreRisco: number;
    }>("/aprs/analytics/overview");
    return response.data;
  },

  getControlSuggestions: async (payload: {
    probability?: number;
    severity?: number;
    exposure?: number;
    activity?: string;
    condition?: string;
  }) => {
    const response = await api.post<{
      score: number | null;
      riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
      suggestions: Array<{
        hierarchy:
          | "ELIMINATION"
          | "SUBSTITUTION"
          | "ENGINEERING"
          | "ADMINISTRATIVE"
          | "PPE";
        title: string;
        description: string;
      }>;
    }>("/aprs/risk-controls/suggestions", payload);
    return response.data;
  },

  getVersionHistory: async (id: string) => {
    const response = await api.get<
      Array<{
        id: string;
        numero: string;
        versao: number;
        status: string;
        parent_apr_id?: string;
        aprovado_em?: string;
        updated_at: string;
        classificacao_resumo?: {
          total: number;
          aceitavel: number;
          atencao: number;
          substancial: number;
          critico: number;
        };
      }>
    >(`/aprs/${id}/versions`);
    return response.data;
  },

  compareVersions: async (baseId: string, targetId: string) => {
    const response = await api.get<{
      base: { id: string; numero: string; versao: number };
      target: { id: string; numero: string; versao: number };
      summary: {
        totalBase: number;
        totalTarget: number;
        added: number;
        removed: number;
        changed: number;
      };
      added: Array<Record<string, string>>;
      removed: Array<Record<string, string>>;
      changed: Array<{
        index: number;
        before: Record<string, string>;
        after: Record<string, string>;
        changedFields: string[];
      }>;
    }>(`/aprs/${baseId}/compare/${targetId}`);
    return response.data;
  },

  uploadRiskEvidence: async (
    aprId: string,
    riskItemId: string,
    file: File,
    metadata?: {
      captured_at?: string;
      latitude?: number;
      longitude?: number;
      accuracy_m?: number;
      device_id?: string;
      exif_datetime?: string;
    },
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    if (metadata?.captured_at)
      formData.append("captured_at", metadata.captured_at);
    if (typeof metadata?.latitude === "number")
      formData.append("latitude", String(metadata.latitude));
    if (typeof metadata?.longitude === "number")
      formData.append("longitude", String(metadata.longitude));
    if (typeof metadata?.accuracy_m === "number")
      formData.append("accuracy_m", String(metadata.accuracy_m));
    if (metadata?.device_id) formData.append("device_id", metadata.device_id);
    if (metadata?.exif_datetime)
      formData.append("exif_datetime", metadata.exif_datetime);

    const response = await api.post(
      `/aprs/${aprId}/risk-items/${riskItemId}/evidence`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return response.data;
  },

  listAprEvidences: async (aprId: string) => {
    const response = await api.get<
      Array<{
        id: string;
        apr_id: string;
        apr_risk_item_id: string;
        uploaded_by_id?: string;
        uploaded_by_name?: string;
        file_key: string;
        original_name?: string;
        mime_type: string;
        file_size_bytes: number;
        hash_sha256: string;
        watermarked_file_key?: string;
        watermarked_hash_sha256?: string;
        watermark_text?: string;
        captured_at?: string;
        uploaded_at: string;
        latitude?: number;
        longitude?: number;
        accuracy_m?: number;
        device_id?: string;
        ip_address?: string;
        exif_datetime?: string;
        integrity_flags?: Record<string, unknown>;
        risk_item_ordem?: number;
        url?: string;
        watermarked_url?: string;
      }>
    >(`/aprs/${aprId}/evidence`);
    return response.data;
  },

  verifyEvidenceHash: async (hash: string) => {
    const response = await api.get<{
      verified: boolean;
      matchedIn?: "original" | "watermarked";
      message?: string;
      evidence?: {
        id: string;
        apr_id: string;
        apr_numero?: string | null;
        apr_versao?: number | null;
        risk_item_id: string;
        risk_item_ordem?: number | null;
        uploaded_at: string;
        uploaded_by_id?: string | null;
        uploaded_by_name?: string | null;
        original_hash: string;
        watermarked_hash?: string | null;
        integrity_flags?: Record<string, unknown>;
      };
    }>("/aprs/evidence/verify", { params: { hash } });
    return response.data;
  },

  getEvidenceCustodyReport: async (aprId: string, riskItemId?: string) => {
    const response = await api.get<{
      report_generated_at: string;
      apr: { id: string; numero: string; versao: number; status: string };
      scope: {
        apr_id: string;
        apr_risk_item_id: string | null;
        evidence_count: number;
      };
      chain_digest_sha256: string;
      timeline: Array<{
        evidence_id: string;
        timestamp: string;
        event: "EVIDENCE_STORED";
        actor_id?: string | null;
        actor_name?: string | null;
        risk_item_id: string;
        risk_item_ordem?: number | null;
        original_hash: string;
        watermarked_hash?: string | null;
        file_key: string;
        watermarked_file_key?: string | null;
        integrity_flags?: Record<string, unknown>;
      }>;
    }>(`/aprs/${aprId}/evidence/report`, {
      params: riskItemId ? { riskItemId } : undefined,
    });
    return response.data;
  },

  downloadEvidenceCustodyPdf: async (aprId: string, riskItemId?: string) => {
    const response = await api.get<Blob, AxiosResponse<Blob>>(
      `/aprs/${aprId}/evidence/report/pdf`,
      {
        params: riskItemId ? { riskItemId } : undefined,
        responseType: "blob",
      },
    );
    return response;
  },

  delete: async (id: string) => {
    await api.delete(`/aprs/${id}`);
  },
};
