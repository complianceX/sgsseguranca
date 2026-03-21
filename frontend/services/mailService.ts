import api from '@/lib/api';
import type {
  DocumentMailDispatchResponse as GeneratedMailDispatchResponse,
  DocumentMailArtifactType as GeneratedMailArtifactType,
  DocumentMailDeliveryMode as GeneratedMailDeliveryMode,
} from '@/lib/api/generated/governed-contracts.client';

export type DocumentMailArtifactType = GeneratedMailArtifactType;
export type DocumentMailDeliveryMode = GeneratedMailDeliveryMode;
export type DocumentMailDispatchResponse = GeneratedMailDispatchResponse;

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
