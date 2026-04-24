import api from '@/lib/api';

export type PrivacyRequestType =
  | 'confirmation'
  | 'access'
  | 'correction'
  | 'anonymization'
  | 'deletion'
  | 'portability'
  | 'sharing_info'
  | 'consent_revocation'
  | 'automated_decision_review';

export type PrivacyRequestStatus =
  | 'open'
  | 'in_review'
  | 'waiting_controller'
  | 'fulfilled'
  | 'rejected'
  | 'cancelled';

export interface PrivacyRequest {
  id: string;
  company_id: string;
  requester_user_id: string;
  type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  description: string | null;
  response_summary: string | null;
  handled_by_user_id: string | null;
  due_at: string;
  fulfilled_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PrivacyRequestEventType =
  | 'created'
  | 'status_changed'
  | 'response_updated';

export interface PrivacyRequestEvent {
  id: string;
  privacy_request_id: string;
  company_id: string;
  actor_user_id: string | null;
  event_type: PrivacyRequestEventType;
  from_status: PrivacyRequestStatus | null;
  to_status: PrivacyRequestStatus | null;
  notes: string | null;
  created_at: string;
}

export interface CreatePrivacyRequestInput {
  type: PrivacyRequestType;
  description?: string;
}

export interface UpdatePrivacyRequestInput {
  status: PrivacyRequestStatus;
  response_summary?: string;
}

export const privacyRequestTypeLabels: Record<PrivacyRequestType, string> = {
  confirmation: 'Confirmação de tratamento',
  access: 'Acesso aos dados',
  correction: 'Correção de dados',
  anonymization: 'Anonimização ou bloqueio',
  deletion: 'Eliminação quando cabível',
  portability: 'Portabilidade',
  sharing_info: 'Informação sobre compartilhamento',
  consent_revocation: 'Revogação de consentimento',
  automated_decision_review: 'Revisão de decisão automatizada',
};

export const privacyRequestStatusLabels: Record<PrivacyRequestStatus, string> = {
  open: 'Aberta',
  in_review: 'Em análise',
  waiting_controller: 'Aguardando controlador',
  fulfilled: 'Atendida',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
};

export const privacyRequestEventTypeLabels: Record<
  PrivacyRequestEventType,
  string
> = {
  created: 'Criação',
  status_changed: 'Mudança de status',
  response_updated: 'Resposta atualizada',
};

export const privacyRequestsService = {
  create: async (
    input: CreatePrivacyRequestInput,
  ): Promise<PrivacyRequest> => {
    const { data } = await api.post<PrivacyRequest>('/privacy-requests', {
      type: input.type,
      description: input.description?.trim() || undefined,
    });
    return data;
  },

  listMine: async (): Promise<PrivacyRequest[]> => {
    const { data } = await api.get<PrivacyRequest[]>('/privacy-requests/me');
    return data;
  },

  listTenant: async (): Promise<PrivacyRequest[]> => {
    const { data } = await api.get<PrivacyRequest[]>('/privacy-requests');
    return data;
  },

  updateStatus: async (
    id: string,
    input: UpdatePrivacyRequestInput,
  ): Promise<PrivacyRequest> => {
    const { data } = await api.patch<PrivacyRequest>(`/privacy-requests/${id}`, {
      status: input.status,
      response_summary: input.response_summary?.trim() || undefined,
    });
    return data;
  },

  listEvents: async (id: string): Promise<PrivacyRequestEvent[]> => {
    const { data } = await api.get<PrivacyRequestEvent[]>(
      `/privacy-requests/${id}/events`,
    );
    return data;
  },
};
