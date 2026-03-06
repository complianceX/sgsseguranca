import api from '@/lib/api';

export const mailService = {
  async sendStoredDocument(documentId: string, documentType: string, email: string) {
    const response = await api.post('/mail/send-stored-document', {
      documentId,
      documentType,
      email,
    });
    return response.data as unknown;
  },
};
