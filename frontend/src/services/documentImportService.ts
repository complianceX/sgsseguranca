import {
  createDdsDraftFromImport,
  enqueueDocumentImport,
  getDdsDraftFromImportPreview,
  getDocumentImportStatus,
  type CreateDdsDraftFromImportInput,
  type CreateDdsDraftFromImportResponse,
  type DdsDraftFromImportPreviewResponse,
  type DocumentImportAnalysis,
  type DocumentImportDomainStatus,
  type DocumentImportEnqueueResponse,
  type DocumentImportJobSnapshot,
  type DocumentImportMetadata,
  type DocumentImportRequestSchema,
  type DocumentImportStatusResponse,
  type DocumentImportValidation,
  type DocumentValidationStatus,
} from "@/lib/api/generated/document-import.client";

export type {
  DocumentImportAnalysis,
  DocumentImportDomainStatus,
  DocumentImportEnqueueResponse,
  DocumentImportJobSnapshot,
  DocumentImportMetadata,
  DocumentImportStatusResponse,
  DocumentImportValidation,
  DocumentValidationStatus,
  CreateDdsDraftFromImportInput,
  CreateDdsDraftFromImportResponse,
  DdsDraftFromImportPreviewResponse,
};

export type ImportDocumentInput = Omit<DocumentImportRequestSchema, "file"> & {
  file: File;
  onUploadProgress?: (percent: number) => void;
};

export const documentImportService = {
  importDocument: async ({
    file,
    empresaId,
    tipoDocumento,
    idempotencyKey,
    onUploadProgress,
  }: ImportDocumentInput) => {
    const formData = new FormData();
    formData.append("file", file);

    if (empresaId) {
      formData.append("empresaId", empresaId);
    }

    if (tipoDocumento) {
      formData.append("tipoDocumento", tipoDocumento);
    }

    if (idempotencyKey) {
      formData.append("idempotencyKey", idempotencyKey);
    }

    return enqueueDocumentImport(formData, idempotencyKey, onUploadProgress);
  },

  getImportStatus: async (documentId: string, signal?: AbortSignal) => {
    return getDocumentImportStatus(documentId, signal);
  },

  getDdsDraftPreview: async (
    documentId: string,
  ): Promise<DdsDraftFromImportPreviewResponse> => {
    return getDdsDraftFromImportPreview(documentId);
  },

  createDdsDraftFromImport: async (
    documentId: string,
    payload: CreateDdsDraftFromImportInput,
  ): Promise<CreateDdsDraftFromImportResponse> => {
    return createDdsDraftFromImport(documentId, payload);
  },
};
