import api from "@/lib/api";
import { User } from "./usersService";
import {
  CursorPaginatedResponse,
  PaginatedResponse,
  fetchAllPages,
} from "./pagination";
import type {
  GovernedDocumentVideoAccessResponse,
  GovernedDocumentVideoAttachment,
  GovernedDocumentVideoMutationResponse,
} from "@/lib/videos/documentVideos";
import type { Signature } from "@/services/signaturesService";

export type DdsStatus = "rascunho" | "publicado" | "auditado" | "arquivado";

export const DDS_STATUS_LABEL: Record<DdsStatus, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  auditado: "Auditado",
  arquivado: "Arquivado",
};

export const DDS_STATUS_COLORS: Record<DdsStatus, string> = {
  rascunho:
    "border-[color:var(--ds-color-warning)]/35 bg-[color:var(--ds-color-warning)]/15 text-[var(--ds-color-warning)]",
  publicado:
    "border-[color:var(--ds-color-info)]/35 bg-[color:var(--ds-color-info)]/15 text-[var(--ds-color-info)]",
  auditado:
    "border-[color:var(--ds-color-success)]/35 bg-[color:var(--ds-color-success)]/15 text-[var(--ds-color-success)]",
  arquivado:
    "border-[color:var(--ds-color-text-muted)]/30 bg-[color:var(--ds-color-text-muted)]/12 text-[var(--ds-color-text-muted)]",
};

export const DDS_ALLOWED_TRANSITIONS: Record<DdsStatus, DdsStatus[]> = {
  rascunho: ["publicado", "arquivado"],
  publicado: ["arquivado"],
  auditado: ["arquivado"],
  arquivado: [],
};

export interface Dds {
  id: string;
  tema: string;
  conteudo?: string;
  data: string;
  status: DdsStatus;
  company_id: string;
  site_id: string;
  facilitador_id: string;
  participants?: User[];
  participant_count?: number;
  auditado_por_id?: string;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
  photo_reuse_justification?: string | null;
  pdf_file_key?: string;
  pdf_folder_path?: string;
  pdf_original_name?: string;
  document_code?: string | null;
  final_pdf_hash_sha256?: string | null;
  pdf_generated_at?: string | null;
  emitted_by_user_id?: string | null;
  emitted_ip?: string | null;
  emitted_user_agent?: string | null;
  validation_token?: string | null;
  is_modelo?: boolean;
  version?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  site?: { nome: string };
  facilitador?: { nome: string };
  auditado_por?: { nome: string };
  emitted_by?: { nome: string };
  company?: { razao_social: string; logo_url?: string | null };
  approval_flow?: DdsApprovalFlow | null;
}

export interface DdsParticipantSignatureInput {
  user_id: string;
  signature_data: string;
  type: string;
  pin?: string;
}

export interface DdsTeamPhotoInput {
  imageData: string;
  capturedAt: string;
  hash: string;
  metadata: {
    userAgent: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  };
}

export interface HistoricalPhotoHashReference {
  ddsId: string;
  tema: string;
  data: string;
  hashes: string[];
}

import type { GovernedPdfAccessResponse } from "@/lib/api/generated/governed-contracts.client";

export interface DdsPdfAccess extends Omit<
  GovernedPdfAccessResponse,
  "entityId"
> {
  ddsId: string;
  degraded: boolean;
}

export interface DdsAttachFileResult {
  fileKey: string;
  folderPath: string;
  originalName: string;
  storageMode: "s3";
  degraded: boolean;
  message: string;
}

export interface DdsValidationContext {
  documentCode: string;
  token: string | null;
}

export interface DdsPerson {
  id: string;
  nome: string;
  funcao?: string | null;
  company_id: string;
  site_id?: string | null;
  status: boolean;
}

export type DdsApprovalAction =
  | "pending"
  | "approved"
  | "rejected"
  | "canceled"
  | "reopened";

export interface DdsApprovalStep {
  level_order: number;
  title: string;
  approver_role: string;
  status: DdsApprovalAction;
  pending_record_id: string | null;
  decided_by_user_id: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  event_hash: string | null;
  actor_signature_id: string | null;
  actor_signature_hash: string | null;
  actor_signature_signed_at: string | null;
  actor_signature_timestamp_authority: string | null;
}

export interface DdsApprovalRecord {
  id: string;
  company_id: string;
  dds_id: string;
  cycle: number;
  level_order: number;
  title: string;
  approver_role: string;
  action: DdsApprovalAction;
  actor_user_id: string | null;
  decision_reason: string | null;
  decided_ip: string | null;
  decided_user_agent?: string | null;
  event_at: string;
  previous_event_hash: string | null;
  event_hash: string;
  actor_signature_id?: string | null;
  actor_signature_hash?: string | null;
  actor_signature_signed_at?: string | null;
  actor_signature_timestamp_authority?: string | null;
  actor?: { nome: string };
}

export interface DdsApprovalFlow {
  ddsId: string;
  companyId: string;
  activeCycle: number | null;
  status: "not_started" | "pending" | "approved" | "rejected" | "canceled";
  currentStep: DdsApprovalStep | null;
  steps: DdsApprovalStep[];
  events: DdsApprovalRecord[];
}

export interface DdsObservabilityOverview {
  generatedAt: string;
  tenantScope: "tenant" | "global";
  portfolio: {
    total: number;
    drafts: number;
    published: number;
    audited: number;
    archived: number;
    templates: number;
    governedPdfs: number;
    pendingGovernance: number;
  };
  approvals: {
    notStarted: number;
    pending: number;
    approved: number;
    approvedLast7d: number;
    rejectedLast7d: number;
    reopenedLast7d: number;
  };
  publicValidation: {
    totalLast7d: number;
    successLast7d: number;
    suspiciousLast7d: number;
    blockedLast7d: number;
    uniqueIpsLast7d: number;
    topReasons: Array<{ reason: string; total: number }>;
    topDocuments: Array<{
      documentRef: string;
      total: number;
      suspicious: number;
      blocked: number;
      lastSeenAt: string | null;
    }>;
    recentEvents: Array<{
      occurredAt: string | null;
      outcome: string;
      documentRef: string;
      suspicious: boolean;
      blocked: boolean;
      ip: string | null;
      reasons: string[];
    }>;
  };
}

export interface DdsObservabilityAlertPreviewItem {
  code:
    | "dds_public_suspicious_spike"
    | "dds_public_blocked_spike"
    | "dds_governance_backlog"
    | "dds_approval_backlog";
  severity: "warning" | "critical";
  title: string;
  message: string;
  metric: number;
  threshold: number;
}

export interface DdsObservabilityAlertsPreview {
  generatedAt: string;
  tenantScope: "tenant" | "global";
  automationEnabled: boolean;
  recipients: {
    notificationUsers: number;
    emailRecipients: string[];
  };
  alerts: DdsObservabilityAlertPreviewItem[];
  investigationQueue: Array<{
    documentRef: string;
    suspicious: number;
    blocked: number;
    lastSeenAt: string | null;
  }>;
}

export interface DdsObservabilityAlertsDispatchResult {
  generatedAt: string;
  tenantScope: "tenant" | "global";
  dispatched: boolean;
  notificationsCreated: number;
  emailSent: boolean;
  webhookSent: boolean;
  alerts: DdsObservabilityAlertPreviewItem[];
}

type DdsMutationInput = Omit<Partial<Dds>, "participants"> & {
  participants?: string[];
  confirm_signature_reset?: boolean;
};

function omitClientTenantScope<T extends { company_id?: unknown }>(
  data: T,
): Omit<T, "company_id"> {
  const payload: Partial<T> = { ...data };
  delete payload.company_id;
  return payload as Omit<T, "company_id">;
}

export const ddsService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    kind?: "all" | "model" | "regular";
  }): Promise<PaginatedResponse<Dds>> => {
    const response = await api.get<PaginatedResponse<Dds>>("/dds", {
      params: {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 20,
        ...(opts?.search ? { search: opts.search } : {}),
        ...(opts?.kind && opts.kind !== "all" ? { kind: opts.kind } : {}),
      },
    });
    return response.data;
  },

  findByCursor: async (opts?: {
    cursor?: string;
    limit?: number;
    search?: string;
    kind?: "all" | "model" | "regular";
  }): Promise<CursorPaginatedResponse<Dds>> => {
    const response = await api.get<CursorPaginatedResponse<Dds>>("/dds", {
      params: {
        cursor: opts?.cursor,
        limit: opts?.limit ?? 20,
        ...(opts?.search ? { search: opts.search } : {}),
        ...(opts?.kind && opts.kind !== "all" ? { kind: opts.kind } : {}),
      },
    });
    return response.data;
  },

  findAll: async () => {
    return fetchAllPages({
      fetchPage: (page, limit) => ddsService.findPaginated({ page, limit }),
      limit: 100,
      maxPages: 50,
      cacheKey: "GET:/dds?page=*&limit=100",
    });
  },

  listPeople: async (opts?: {
    page?: number;
    limit?: number;
    companyId?: string;
    siteId?: string;
  }): Promise<PaginatedResponse<DdsPerson>> => {
    const response = await api.get<PaginatedResponse<DdsPerson>>(
      "/dds/people",
      {
        params: {
          page: opts?.page ?? 1,
          limit: opts?.limit ?? 20,
          ...(opts?.siteId ? { site_id: opts.siteId } : {}),
        },
        headers: opts?.companyId ? { "x-company-id": opts.companyId } : {},
      },
    );
    return response.data;
  },

  listAllPeople: async (opts?: {
    companyId?: string;
    siteId?: string;
  }): Promise<DdsPerson[]> => {
    return fetchAllPages({
      fetchPage: (page, limit) =>
        ddsService.listPeople({
          page,
          limit,
          companyId: opts?.companyId,
          siteId: opts?.siteId,
        }),
      limit: 100,
      maxPages: 50,
      batchSize: 3,
      cacheKey: `GET:/dds/people?page=*&limit=100&company_id=${opts?.companyId || "all"}&site_id=${opts?.siteId || "all"}`,
    });
  },

  findOne: async (id: string) => {
    const response = await api.get<Dds>(`/dds/${id}`);
    return response.data;
  },

  create: async (data: DdsMutationInput) => {
    const response = await api.post<Dds>("/dds", omitClientTenantScope(data));
    return response.data;
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<DdsAttachFileResult>(
      `/dds/${id}/file`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return response.data;
  },

  getPdfAccess: async (id: string) => {
    const response = await api.get<DdsPdfAccess>(`/dds/${id}/pdf`);
    return response.data;
  },

  getValidationContext: async (id: string) => {
    const response = await api.get<DdsValidationContext>(
      `/dds/${id}/validation-context`,
    );
    return response.data;
  },

  getApprovalFlow: async (id: string) => {
    const response = await api.get<DdsApprovalFlow>(`/dds/${id}/approvals`);
    return response.data;
  },

  getObservabilityOverview: async () => {
    const response = await api.get<DdsObservabilityOverview>(
      "/dds/observability/overview",
    );
    return response.data;
  },

  getObservabilityAlertsPreview: async () => {
    const response = await api.get<DdsObservabilityAlertsPreview>(
      "/dds/observability/alerts",
    );
    return response.data;
  },

  dispatchObservabilityAlerts: async () => {
    const response = await api.post<DdsObservabilityAlertsDispatchResult>(
      "/dds/observability/alerts/dispatch",
    );
    return response.data;
  },

  initializeApprovalFlow: async (
    id: string,
    payload?: {
      steps?: Array<{ title: string; approver_role: string }>;
    },
  ) => {
    const response = await api.post<DdsApprovalFlow>(
      `/dds/${id}/approvals/initialize`,
      payload || {},
    );
    return response.data;
  },

  approveApprovalStep: async (
    id: string,
    approvalId: string,
    payload: { reason?: string; pin: string },
  ) => {
    const response = await api.post<DdsApprovalFlow>(
      `/dds/${id}/approvals/${approvalId}/approve`,
      payload,
    );
    return response.data;
  },

  rejectApprovalStep: async (
    id: string,
    approvalId: string,
    payload: { reason: string; pin: string },
  ) => {
    const response = await api.post<DdsApprovalFlow>(
      `/dds/${id}/approvals/${approvalId}/reject`,
      payload,
    );
    return response.data;
  },

  reopenApprovalFlow: async (
    id: string,
    payload: { reason: string; pin: string },
  ) => {
    const response = await api.post<DdsApprovalFlow>(
      `/dds/${id}/approvals/reopen`,
      payload,
    );
    return response.data;
  },

  listVideoAttachments: async (id: string) => {
    const response = await api.get<GovernedDocumentVideoAttachment[]>(
      `/dds/${id}/videos`,
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
      `/dds/${id}/videos`,
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
      `/dds/${id}/videos/${attachmentId}/access`,
    );
    return response.data;
  },

  removeVideoAttachment: async (
    id: string,
    attachmentId: string,
  ): Promise<GovernedDocumentVideoMutationResponse> => {
    const response = await api.delete<GovernedDocumentVideoMutationResponse>(
      `/dds/${id}/videos/${attachmentId}`,
    );
    return response.data;
  },

  updateStatus: async (id: string, status: DdsStatus): Promise<Dds> => {
    const response = await api.patch<Dds>(`/dds/${id}/status`, { status });
    return response.data;
  },

  replaceSignatures: async (
    id: string,
    payload: {
      participant_signatures: DdsParticipantSignatureInput[];
      team_photos?: DdsTeamPhotoInput[];
      photo_reuse_justification?: string;
    },
  ) => {
    const response = await api.put<{
      participantSignatures: number;
      teamPhotos: number;
      duplicatePhotoWarnings: string[];
    }>(`/dds/${id}/signatures`, payload);
    return response.data;
  },

  listSignatures: async (id: string): Promise<Signature[]> => {
    const response = await api.get<Signature[]>(`/dds/${id}/signatures`);
    return response.data;
  },

  getHistoricalPhotoHashes: async (
    limit = 100,
    excludeId?: string,
  ): Promise<HistoricalPhotoHashReference[]> => {
    const response = await api.get<HistoricalPhotoHashReference[]>(
      "/dds/historical-photo-hashes",
      {
        params: {
          limit,
          ...(excludeId ? { exclude_id: excludeId } : {}),
        },
      },
    );
    return response.data;
  },

  listStoredFiles: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const scopedFilters = filters ? omitClientTenantScope(filters) : undefined;
    const response = await api.get<
      Array<{
        ddsId: string;
        tema: string;
        data: string;
        companyId: string;
        siteId: string | null;
        siteName: string | null;
        fileKey: string;
        folderPath: string;
        originalName: string;
      }>
    >("/dds/files/list", { params: scopedFilters });
    return response.data;
  },

  downloadWeeklyBundle: async (filters: {
    company_id?: string;
    year: number;
    week: number;
  }) => {
    const scopedFilters = omitClientTenantScope(filters);
    const response = await api.get("/dds/files/weekly-bundle", {
      params: scopedFilters,
      responseType: "blob",
    });
    return response.data as Blob;
  },

  update: async (id: string, data: DdsMutationInput) => {
    const response = await api.patch<Dds>(
      `/dds/${id}`,
      omitClientTenantScope(data),
    );
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/dds/${id}`);
  },

  operationalizeTemplate: async (
    id: string,
    data?: {
      data?: string;
      facilitador_id?: string;
      site_id?: string;
    },
  ): Promise<Dds> => {
    const response = await api.post<Dds>(`/dds/${id}/operationalize`, data || {});
    return response.data;
  },
};
