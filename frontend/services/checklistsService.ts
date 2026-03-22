import api from "@/lib/api";
import type { GovernedPdfAccessResponse } from "@/lib/api/generated/governed-contracts.client";
import { AxiosError } from "axios";
import { fetchAllPages, PaginatedResponse } from "./pagination";
import { DocumentMailDispatchResponse } from "./mailService";
import { enqueueOfflineMutation } from "@/lib/offline-sync";
import {
  getOfflineCache,
  isOfflineRequestError,
  setOfflineCache,
} from "@/lib/offline-cache";
import type {
  GovernedDocumentVideoAccessResponse,
  GovernedDocumentVideoAttachment,
  GovernedDocumentVideoMutationResponse,
} from "@/lib/videos/documentVideos";

export interface ChecklistItem {
  id?: string;
  item: string; // The question/label
  status:
    | boolean
    | "ok"
    | "nok"
    | "na"
    | "sim"
    | "nao"
    | "Pendente"
    | "Conforme"
    | "Não Conforme";
  tipo_resposta?: "sim_nao" | "conforme" | "texto" | "foto" | "sim_nao_na";
  obrigatorio?: boolean;
  peso?: number;
  resposta?: unknown;
  observacao?: string;
  fotos?: string[];
}

export interface Checklist {
  id: string;
  titulo: string;
  descricao?: string;
  equipamento?: string;
  maquina?: string;
  foto_equipamento?: string;
  data: string;
  status: "Conforme" | "Não Conforme" | "Pendente";
  company_id: string;
  site_id: string;
  inspetor_id: string;
  itens: ChecklistItem[];
  is_modelo?: boolean;
  ativo?: boolean;
  categoria?: string;
  periodicidade?: string;
  nivel_risco_padrao?: string;
  auditado_por_id?: string;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
  pdf_file_key?: string;
  pdf_folder_path?: string;
  pdf_original_name?: string;
  created_at: string;
  updated_at: string;
  site?: { nome: string };
  inspetor?: { nome: string };
  auditado_por?: { nome: string };
  company?: { razao_social: string };
}

export type ChecklistPdfAccess = GovernedPdfAccessResponse;

export interface ChecklistSavePdfResult extends ChecklistPdfAccess {
  fileUrl?: string | null;
}

export interface ChecklistPhotoAccess {
  entityId: string;
  scope: "equipment" | "item";
  itemIndex: number | null;
  photoIndex: number | null;
  hasGovernedPhoto: true;
  availability: "ready" | "registered_without_signed_url";
  fileKey: string;
  originalName: string;
  mimeType: string;
  url: string | null;
  degraded: boolean;
  message: string | null;
}

export interface ChecklistPhotoAttachResult {
  entityId: string;
  scope: "equipment" | "item";
  itemIndex: number | null;
  photoIndex: number | null;
  storageMode: "governed-storage";
  degraded: false;
  message: string;
  photoReference: string;
  photo: {
    fileKey: string;
    originalName: string;
    mimeType: string;
  };
  signaturesReset: boolean;
}

export const CHECKLIST_GOVERNED_PHOTO_REF_PREFIX = "gst:checklist-photo:";

export const checklistsService = {
  findPaginated: async (params?: {
    onlyTemplates?: boolean;
    excludeTemplates?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const query = {
      onlyTemplates: params?.onlyTemplates ? "true" : undefined,
      excludeTemplates: params?.excludeTemplates ? "true" : undefined,
      page: params?.page ?? 1,
      limit: params?.limit ?? 20,
    };
    const cacheKey = `checklists.paginated.${JSON.stringify(query)}`;

    try {
      const response = await api.get<PaginatedResponse<Checklist>>(
        "/checklists",
        {
          params: query,
        },
      );
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<PaginatedResponse<Checklist>>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findAll: async (options?: {
    onlyTemplates?: boolean;
    excludeTemplates?: boolean;
  }) => {
    const cacheKey = `checklists.all.${JSON.stringify(options || {})}`;
    try {
      const data = await fetchAllPages({
        fetchPage: (page, limit) =>
          checklistsService.findPaginated({
            ...options,
            page,
            limit,
          }),
        limit: 100,
        maxPages: 50,
      });
      setOfflineCache(cacheKey, data);
      return data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<Checklist[]>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findTemplates: async () => {
    return checklistsService.findAll({ onlyTemplates: true });
  },

  findOne: async (id: string) => {
    const cacheKey = `checklists.one.${id}`;
    try {
      const response = await api.get<Checklist>(`/checklists/${id}`);
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<Checklist>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  create: async (data: Partial<Checklist>, companyId?: string) => {
    try {
      const response = await api.post<Checklist>("/checklists", data, {
        headers: companyId ? { "x-company-id": companyId } : undefined,
      });
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== "ERR_NETWORK") {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: "/checklists",
        method: "post",
        data,
        headers: companyId ? { "x-company-id": companyId } : undefined,
        label: "Checklist",
      });

      return {
        ...(data as Checklist),
        id: queued.id,
        status: ((data as Checklist)?.status ||
          "Pendente") as Checklist["status"],
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as Checklist & { offlineQueued: true };
    }
  },

  update: async (id: string, data: Partial<Checklist>, companyId?: string) => {
    try {
      const response = await api.patch<Checklist>(`/checklists/${id}`, data, {
        headers: companyId ? { "x-company-id": companyId } : undefined,
      });
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== "ERR_NETWORK") {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: `/checklists/${id}`,
        method: "patch",
        data,
        headers: companyId ? { "x-company-id": companyId } : undefined,
        label: "Checklist",
      });

      return {
        ...(data as Checklist),
        id,
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as Checklist & { offlineQueued: true };
    }
  },

  delete: async (id: string) => {
    await api.delete(`/checklists/${id}`);
  },

  sendEmail: async (
    id: string,
    to: string,
  ): Promise<DocumentMailDispatchResponse> => {
    const response = await api.post<DocumentMailDispatchResponse>(
      `/checklists/${id}/send-email`,
      { to },
    );
    return response.data;
  },

  getPdfAccess: async (id: string) => {
    const response = await api.get<ChecklistPdfAccess>(`/checklists/${id}/pdf`);
    return response.data;
  },

  listStoredFiles: async (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => {
    const response = await api.get("/checklists/files/list", {
      params: filters,
    });
    return response.data;
  },

  downloadWeeklyBundle: async (filters: {
    company_id?: string;
    year: number;
    week: number;
  }) => {
    const response = await api.get("/checklists/files/weekly-bundle", {
      params: filters,
      responseType: "blob",
    });
    return response.data as Blob;
  },

  // Novos métodos para fluxo de templates
  getTemplates: async (): Promise<Checklist[]> => {
    return checklistsService.findAll({ onlyTemplates: true });
  },

  getFilled: async (): Promise<Checklist[]> => {
    return checklistsService.findAll({ excludeTemplates: true });
  },

  fillFromTemplate: async (
    templateId: string,
    data: Partial<Checklist>,
    companyId?: string,
  ): Promise<Checklist> => {
    try {
      const response = await api.post<Checklist>(
        `/checklists/fill-from-template/${templateId}`,
        data,
        {
          headers: companyId ? { "x-company-id": companyId } : undefined,
        },
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== "ERR_NETWORK") {
        throw error;
      }

      const queued = enqueueOfflineMutation({
        url: `/checklists/fill-from-template/${templateId}`,
        method: "post",
        data,
        headers: companyId ? { "x-company-id": companyId } : undefined,
        label: "Checklist",
      });

      return {
        ...(data as Checklist),
        id: queued.id,
        status: ((data as Checklist)?.status ||
          "Pendente") as Checklist["status"],
        created_at: queued.createdAt,
        updated_at: queued.createdAt,
        offlineQueued: true,
      } as Checklist & { offlineQueued: true };
    }
  },

  savePdf: async (id: string): Promise<ChecklistSavePdfResult> => {
    const response = await api.post<ChecklistSavePdfResult>(
      `/checklists/${id}/save-pdf`,
    );
    return response.data;
  },

  attachEquipmentPhoto: async (
    id: string,
    file: File,
  ): Promise<ChecklistPhotoAttachResult> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<ChecklistPhotoAttachResult>(
      `/checklists/${id}/equipment-photo`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data;
  },

  attachItemPhoto: async (
    id: string,
    itemIndex: number,
    file: File,
  ): Promise<ChecklistPhotoAttachResult> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<ChecklistPhotoAttachResult>(
      `/checklists/${id}/items/${itemIndex}/photos`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data;
  },

  getEquipmentPhotoAccess: async (
    id: string,
  ): Promise<ChecklistPhotoAccess> => {
    const response = await api.get<ChecklistPhotoAccess>(
      `/checklists/${id}/equipment-photo/access`,
    );
    return response.data;
  },

  getItemPhotoAccess: async (
    id: string,
    itemIndex: number,
    photoIndex: number,
  ): Promise<ChecklistPhotoAccess> => {
    const response = await api.get<ChecklistPhotoAccess>(
      `/checklists/${id}/items/${itemIndex}/photos/${photoIndex}/access`,
    );
    return response.data;
  },

  listVideoAttachments: async (id: string) => {
    const response = await api.get<GovernedDocumentVideoAttachment[]>(
      `/checklists/${id}/videos`,
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
      `/checklists/${id}/videos`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data;
  },

  getVideoAttachmentAccess: async (
    id: string,
    attachmentId: string,
  ): Promise<GovernedDocumentVideoAccessResponse> => {
    const response = await api.get<GovernedDocumentVideoAccessResponse>(
      `/checklists/${id}/videos/${attachmentId}/access`,
    );
    return response.data;
  },

  removeVideoAttachment: async (
    id: string,
    attachmentId: string,
  ): Promise<GovernedDocumentVideoMutationResponse> => {
    const response = await api.delete<GovernedDocumentVideoMutationResponse>(
      `/checklists/${id}/videos/${attachmentId}`,
    );
    return response.data;
  },

  bootstrapActivityTemplates: async () => {
    const response = await api.post<{
      created: number;
      skipped: number;
      templates: Checklist[];
    }>("/checklists/templates/bootstrap");
    return response.data;
  },

  importFromWord: async (file: File): Promise<Checklist> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<Checklist>(
      "/checklists/import-word",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return response.data;
  },
};
