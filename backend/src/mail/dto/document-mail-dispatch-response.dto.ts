export type DocumentMailArtifactType =
  | 'governed_final_pdf'
  | 'local_uploaded_pdf';

export type DocumentMailDeliveryMode = 'queued' | 'sent';

export interface DocumentMailDispatchResponseDto {
  success: true;
  message: string;
  deliveryMode: DocumentMailDeliveryMode;
  artifactType: DocumentMailArtifactType;
  isOfficial: boolean;
  fallbackUsed: boolean;
  documentType?: string;
  documentId?: string;
  fileKey?: string;
}
