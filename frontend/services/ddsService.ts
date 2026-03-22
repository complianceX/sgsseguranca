import api from "@/lib/api";
import { User } from "./usersService";
import { fetchAllPages, PaginatedResponse } from "./pagination";
import type {
  GovernedDocumentVideoAccessResponse,
  GovernedDocumentVideoAttachment,
  GovernedDocumentVideoMutationResponse,
} from "@/lib/videos/documentVideos";

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
  publicado: ["auditado", "arquivado"],
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
  participants: User[];
  auditado_por_id?: string;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
  pdf_file_key?: string;
  pdf_folder_path?: string;
  pdf_original_name?: string;
  is_modelo?: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  site?: { nome: string };
  facilitador?: { nome: string };
  auditado_por?: { nome: string };
  company?: { razao_social: string };
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

export interface DdsPdfAccess extends Omit<GovernedPdfAccessResponse, 'entityId'> {
  ddsId: string;
  degraded: boolean;
}

export interface DdsAttachFileResult {
  fileKey: string;
  folderPath: string;
  originalName: string;
  storageMode: "s3" | "reference-only";
  degraded: boolean;
  message: string;
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

  findAll: async () => {
    return fetchAllPages({
      fetchPage: (page, limit) =>
        ddsService.findPaginated({
          page,
          limit,
        }),
      limit: 100,
      maxPages: 50,
    });
  },

  findOne: async (id: string) => {
    const response = await api.get<Dds>(`/dds/${id}`);
    return response.data;
  },

  create: async (
    data: Omit<Partial<Dds>, "participants"> & { participants?: string[] },
  ) => {
    const response = await api.post<Dds>("/dds", data);
    return response.data;
  },

  attachFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<DdsAttachFileResult>(`/dds/${id}/file`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  getPdfAccess: async (id: string) => {
    const response = await api.get<DdsPdfAccess>(`/dds/${id}/pdf`);
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

  getHistoricalPhotoHashes: async (
    limit = 100,
    excludeId?: string,
    companyId?: string,
  ): Promise<HistoricalPhotoHashReference[]> => {
    const response = await api.get<HistoricalPhotoHashReference[]>(
      "/dds/historical-photo-hashes",
      {
        params: {
          limit,
          ...(excludeId ? { exclude_id: excludeId } : {}),
          ...(companyId ? { company_id: companyId } : {}),
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
    const response = await api.get<
      Array<{
        ddsId: string;
        tema: string;
        data: string;
        companyId: string;
        fileKey: string;
        folderPath: string;
        originalName: string;
      }>
    >("/dds/files/list", { params: filters });
    return response.data;
  },

  downloadWeeklyBundle: async (filters: {
    company_id?: string;
    year: number;
    week: number;
  }) => {
    const response = await api.get("/dds/files/weekly-bundle", {
      params: filters,
      responseType: "blob",
    });
    return response.data as Blob;
  },

  update: async (
    id: string,
    data: Omit<Partial<Dds>, "participants"> & { participants?: string[] },
  ) => {
    const response = await api.patch<Dds>(`/dds/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/dds/${id}`);
  },
};
