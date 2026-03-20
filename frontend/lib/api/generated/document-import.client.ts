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

export type DocumentImportRequestSchema = NonNullable<
  DocumentImportPostOperation["requestBody"]
>["content"]["multipart/form-data"];

export type DocumentImportEnqueueResponse = JsonContent<
  DocumentImportPostOperation["responses"][202]
>;

export type DocumentImportStatusResponse = JsonContent<
  DocumentImportStatusOperation["responses"][200]
>;

export type DocumentImportJobSnapshot =
  DocumentImportEnqueueResponse["job"];

export type DocumentImportDomainStatus =
  DocumentImportEnqueueResponse["status"];

export type DocumentImportAnalysis = NonNullable<
  DocumentImportStatusResponse["analysis"]
>;

export type DocumentImportValidation = NonNullable<
  DocumentImportStatusResponse["validation"]
>;

export type DocumentValidationStatus =
  DocumentImportValidation["status"];

export type DocumentImportMetadata = NonNullable<
  DocumentImportStatusResponse["metadata"]
>;

export async function enqueueDocumentImport(
  formData: FormData,
  idempotencyKey?: string,
): Promise<DocumentImportEnqueueResponse> {
  const response = await api.post<DocumentImportEnqueueResponse>(
    "/documents/import",
    formData,
    idempotencyKey
      ? {
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
        }
      : undefined,
  );

  return response.data;
}

export async function getDocumentImportStatus(
  documentId: string,
): Promise<DocumentImportStatusResponse> {
  const response = await api.get<DocumentImportStatusResponse>(
    `/documents/import/${documentId}/status`,
  );

  return response.data;
}
