import api from '@/lib/api';

export type ConsentType =
  | 'privacy'
  | 'terms'
  | 'cookies'
  | 'ai_processing'
  | 'marketing';

export interface ConsentStatusEntry {
  type: ConsentType;
  active: boolean;
  needsReacceptance: boolean;
  acceptedVersionLabel: string | null;
  currentVersionLabel: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  migratedFromLegacy: boolean;
}

export interface ConsentStatusResponse {
  consents: ConsentStatusEntry[];
}

export const consentsService = {
  getStatus: async (): Promise<ConsentStatusResponse> => {
    const { data } = await api.get<ConsentStatusResponse>('/users/me/consents');
    return data;
  },

  accept: async (type: ConsentType, versionLabel?: string): Promise<void> => {
    await api.post('/users/me/consents', { type, versionLabel });
  },

  revoke: async (type: ConsentType): Promise<void> => {
    await api.delete(`/users/me/consents/${type}`);
  },
};
