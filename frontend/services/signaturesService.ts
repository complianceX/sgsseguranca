import api from '@/lib/api';

export interface Signature {
  id?: string;
  user_id?: string;
  document_id: string;
  document_type: string;
  signature_data: string;
  type: string;
  company_id?: string;
  signature_hash?: string;
  timestamp_token?: string;
  timestamp_authority?: string;
  signed_at?: string;
  created_at?: string;
}

export const signaturesService = {
  create: async (data: Signature) => {
    const response = await api.post<Signature>('/signatures', data, {
      timeout: 45000,
    });
    return response.data;
  },

  findByDocument: async (document_id: string, document_type: string) => {
    const response = await api.get<Signature[]>(`/signatures?document_id=${document_id}&document_type=${document_type}`);
    return response.data;
  },

  findByChecklist: async (id: string) => {
    return signaturesService.findByDocument(id, 'CHECKLIST');
  },

  findByTraining: async (id: string) => {
    return signaturesService.findByDocument(id, 'TRAINING');
  },

  deleteByDocument: async (document_id: string, document_type: string) => {
    await api.delete(
      `/signatures/document/${document_id}?document_type=${document_type}`,
    );
  },

  deleteById: async (id: string) => {
    await api.delete(`/signatures/${id}`);
  },

  verifyById: async (id: string) => {
    const response = await api.get<{
      id: string;
      valid: boolean;
      signed_at?: string;
      timestamp_authority?: string;
      signature_hash?: string;
    }>(`/signatures/verify/${id}`);
    return response.data;
  },
};
