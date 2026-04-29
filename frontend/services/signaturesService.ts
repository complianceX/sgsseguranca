import api from '@/lib/api';

export interface Signature {
  integrity_payload?: {
    verification_mode?: string;
    legal_assurance?: string;
    proof_scope?: string;
    canonical_payload_hash?: string;
    signature_evidence_hash?: string;
    document_binding?: {
      binding_hash?: string;
    };
  };
  id?: string;
  user_id?: string;
  user?: {
    nome?: string;
  };
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
  pin?: string;
}

export const signaturesService = {
  create: async (data: Signature) => {
    // Para type='hmac', o SignatureModal passa o PIN como signature_data.
    // Remapeia para o campo correto antes de enviar ao backend.
    const tenantSafeData = { ...data };
    delete tenantSafeData.company_id;
    let payload = { ...tenantSafeData };
    if (data.type === 'hmac') {
      payload = {
        ...tenantSafeData,
        pin: data.pin ?? data.signature_data, // PIN vindo como signature_data
        signature_data: 'HMAC_PENDING', // backend substitui pelo HMAC real
      };
    }
    const response = await api.post<Signature>('/signatures', payload, {
      timeout: 45000,
    });
    return response.data;
  },

  getSignaturePinStatus: async (): Promise<{ has_pin: boolean }> => {
    const response = await api.get<{ has_pin: boolean }>(
      '/auth/signature-pin/status',
    );
    return response.data;
  },

  setSignaturePin: async (
    pin: string,
    current_password?: string,
  ): Promise<void> => {
    await api.post('/auth/signature-pin', { pin, current_password });
  },

  findByDocument: async (document_id: string, document_type: string) => {
    const response = await api.get<Signature[]>('/signatures', {
      params: { document_id, document_type },
    });
    return response.data;
  },

  findByChecklist: async (id: string) => {
    return signaturesService.findByDocument(id, 'CHECKLIST');
  },

  findByTraining: async (id: string) => {
    return signaturesService.findByDocument(id, 'TRAINING');
  },

  deleteByDocument: async (document_id: string, document_type: string) => {
    await api.delete(`/signatures/document/${encodeURIComponent(document_id)}`, {
      params: { document_type },
    });
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
      verification_mode: string;
      legal_assurance: string;
      proof_scope?: string | null;
      document_binding_hash?: string | null;
      signature_evidence_hash?: string | null;
    }>(`/signatures/verify/${id}`);
    return response.data;
  },
};
