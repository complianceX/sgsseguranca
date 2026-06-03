export interface GovernedDocumentVideoAttachment {
  id: string;
  company_id: string;
  module: string;
  document_type: string;
  document_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  file_hash: string;
  storage_key: string;
  uploaded_by_id?: string | null;
  uploaded_at: string;
  duration_seconds?: number | null;
  processing_status: "ready";
  availability: "stored" | "registered_without_signed_url" | "removed";
  created_at: string;
  updated_at: string;
  removed_at?: string | null;
  removed_by_id?: string | null;
}

export type GovernedDocumentVideoAccessAvailability =
  | "ready"
  | "registered_without_signed_url";

export interface GovernedDocumentVideoAccessResponse {
  entityId: string;
  attachmentId: string;
  availability: GovernedDocumentVideoAccessAvailability;
  url: string | null;
  message: string | null;
  video: GovernedDocumentVideoAttachment;
}

export interface GovernedDocumentVideoMutationResponse {
  entityId: string;
  attachments: GovernedDocumentVideoAttachment[];
  attachmentCount: number;
  storageMode: "governed-storage";
  degraded: false;
  message: string;
  attachment: GovernedDocumentVideoAttachment;
}

export const GOVERNED_VIDEO_ACCEPT =
  ".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime";

export function formatVideoBytes(sizeBytes?: number | null) {
  const size = Number(sizeBytes || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatVideoDuration(durationSeconds?: number | null) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    return "Duração pendente";
  }

  const totalSeconds = Math.round(duration);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
