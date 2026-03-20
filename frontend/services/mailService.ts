import api from '@/lib/api';

export type DocumentMailArtifactType =
  | 'governed_final_pdf'
  | 'local_uploaded_pdf';

export type DocumentMailDeliveryMode = 'queued' | 'sent';

export interface DocumentMailDispatchResponse {
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

export const mailService = {
  async sendStoredDocument(
    documentId: string,
    documentType: string,
    email: string,
  ): Promise<DocumentMailDispatchResponse> {
    const response = await api.post('/mail/send-stored-document', {
      documentId,
      documentType,
      email,
    });
    return response.data as DocumentMailDispatchResponse;
  },

  async sendUploadedDocument(
    file: Blob,
    filename: string,
    email: string,
    docName: string,
    subject?: string,
  ): Promise<DocumentMailDispatchResponse> {
    const formData = new FormData();
    formData.append('file', file, filename);
    formData.append('email', email);
    formData.append('docName', docName);
    if (subject?.trim()) {
      formData.append('subject', subject.trim());
    }

    const response = await api.post('/mail/send-uploaded-document', formData);
    return response.data as DocumentMailDispatchResponse;
  },
};
