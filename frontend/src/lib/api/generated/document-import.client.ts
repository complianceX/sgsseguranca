import api from "@/lib/api";
import type { paths } from "./document-import.schema";

type JsonContent<T> = T extends {
  content: { "application/json": infer Body };
}
  ? Body
  : never;

type DocumentImportPostOperation = paths["/documents/import"]["post"];
type DocumentImportStatusOperation =
  paths["/documents/import/{id}/status"]["get"];
type DdsDraftFromImportPreviewOperation =
  paths["/documents/import/{id}/dds-draft"]["get"];
type CreateDdsDraftFromImportOperation =
  paths["/documents/import/{id}/dds-draft"]["post"];

export type DocumentImportRequestSchema = NonNullable<
  DocumentImportPostOperation["requestBody"]
>["content"]["multipart/form-data"];

export type DocumentImportEnqueueResponse = JsonContent<
  DocumentImportPostOperation["responses"][202]
>;

export type DocumentImportStatusResponse = JsonContent<
  DocumentImportStatusOperation["responses"][200]
>;

export type DocumentImportJobSnapshot = DocumentImportEnqueueResponse["job"];

export type DocumentImportDomainStatus =
  DocumentImportEnqueueResponse["status"];

export type DocumentImportAnalysis = NonNullable<
  DocumentImportStatusResponse["analysis"]
>;

export type DocumentImportValidation = NonNullable<
  DocumentImportStatusResponse["validation"]
>;

export type DocumentValidationStatus = DocumentImportValidation["status"];

export type DocumentImportMetadata = NonNullable<
  DocumentImportStatusResponse["metadata"]
>;

export type DdsDraftFromImportPreviewResponse = JsonContent<
  DdsDraftFromImportPreviewOperation["responses"][200]
>;

export type CreateDdsDraftFromImportInput = NonNullable<
  CreateDdsDraftFromImportOperation["requestBody"]
>["content"]["application/json"];

export type CreateDdsDraftFromImportResponse = JsonContent<
  CreateDdsDraftFromImportOperation["responses"][201]
>;

export async function enqueueDocumentImport(
  formData: FormData,
  idempotencyKey?: string,
  onUploadProgress?: (percent: number) => void,
): Promise<DocumentImportEnqueueResponse> {
  const response = await api.post<DocumentImportEnqueueResponse>(
    "/documents/import",
    formData,
    {
      headers: idempotencyKey
        ? { "Idempotency-Key": idempotencyKey }
        : undefined,
      onUploadProgress: onUploadProgress
        ? (event) => {
            const total = event.total ?? 0;
            const percent =
              total > 0 ? Math.round((event.loaded * 90) / total) : 0;
            onUploadProgress(percent);
          }
        : undefined,
    },
  );

  return response.data;
}

export async function getDocumentImportStatus(
  documentId: string,
  signal?: AbortSignal,
): Promise<DocumentImportStatusResponse> {
  const response = await api.get<DocumentImportStatusResponse>(
    `/documents/import/${documentId}/status`,
    signal ? { signal } : undefined,
  );

  return response.data;
}

export async function getDdsDraftFromImportPreview(
  documentId: string,
): Promise<DdsDraftFromImportPreviewResponse> {
  const response = await api.get<DdsDraftFromImportPreviewResponse>(
    `/documents/import/${documentId}/dds-draft`,
  );

  return response.data;
}

export async function createDdsDraftFromImport(
  documentId: string,
  payload: CreateDdsDraftFromImportInput,
): Promise<CreateDdsDraftFromImportResponse> {
  const response = await api.post<CreateDdsDraftFromImportResponse>(
    `/documents/import/${documentId}/dds-draft`,
    payload,
  );

  return response.data;
}
