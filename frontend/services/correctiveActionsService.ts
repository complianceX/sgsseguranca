import api from '@/lib/api';
import { PaginatedResponse } from './pagination';

export type CorrectiveActionStatus =
  | 'open'
  | 'in_progress'
  | 'done'
  | 'overdue'
  | 'cancelled';
export type CorrectiveActionSource = 'manual' | 'nonconformity' | 'audit';
export type CorrectiveActionPriority = 'low' | 'medium' | 'high' | 'critical';

export interface CorrectiveAction {
  id: string;
  title: string;
  description: string;
  source_type: CorrectiveActionSource;
  source_id?: string;
  company_id: string;
  site_id?: string;
  responsible_user_id?: string;
  responsible_name?: string;
  due_date: string;
  status: CorrectiveActionStatus;
  priority: CorrectiveActionPriority;
  sla_days?: number;
  evidence_notes?: string;
  last_reminder_at?: string;
  escalation_level?: number;
  created_at: string;
  updated_at: string;
  site?: { id: string; nome: string };
  responsible_user?: { id: string; nome: string };
}

export const correctiveActionsService = {
  findPaginated: async (params?: {
    page?: number;
    limit?: number;
    status?: CorrectiveActionStatus;
    source_type?: CorrectiveActionSource;
    due?: 'overdue' | 'soon';
  }) => {
    const response = await api.get<PaginatedResponse<CorrectiveAction>>('/corrective-actions', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.source_type ? { source_type: params.source_type } : {}),
        ...(params?.due ? { due: params.due } : {}),
      },
    });
    return response.data;
  },

  findAll: async (params?: {
    status?: CorrectiveActionStatus;
    source_type?: CorrectiveActionSource;
    due?: 'overdue' | 'soon';
  }) => {
    const response = await api.get<CorrectiveAction[]>('/corrective-actions', {
      params,
    });
    return response.data;
  },

  findSummary: async () => {
    const response = await api.get<{
      total: number;
      open: number;
      inProgress: number;
      done: number;
      overdue: number;
    }>('/corrective-actions/summary');
    return response.data;
  },

  getSlaOverview: async () => {
    const response = await api.get<{
      overdue: number;
      dueSoon: number;
      criticalOpen: number;
      highOpen: number;
      avgResolutionDays: string;
    }>('/corrective-actions/sla/overview');
    return response.data;
  },

  getSlaBySite: async () => {
    const response = await api.get<
      Array<{
        site: string;
        total: number;
        overdue: number;
        criticalOpen: number;
      }>
    >('/corrective-actions/sla/by-site');
    return response.data;
  },

  runSlaEscalation: async () => {
    const response = await api.post<{
      overdueActions: number;
      notificationsCreated: number;
    }>('/corrective-actions/sla/escalate');
    return response.data;
  },

  create: async (payload: {
    title: string;
    description: string;
    due_date?: string;
    status?: CorrectiveActionStatus;
    priority?: CorrectiveActionPriority;
    site_id?: string;
    responsible_user_id?: string;
    responsible_name?: string;
    source_type?: CorrectiveActionSource;
    source_id?: string;
  }) => {
    const response = await api.post<CorrectiveAction>('/corrective-actions', payload);
    return response.data;
  },

  createFromNonConformity: async (id: string) => {
    const response = await api.post<CorrectiveAction>(
      `/corrective-actions/from/nonconformity/${id}`,
    );
    return response.data;
  },

  createFromAudit: async (id: string) => {
    const response = await api.post<CorrectiveAction>(
      `/corrective-actions/from/audit/${id}`,
    );
    return response.data;
  },

  update: async (id: string, payload: Partial<CorrectiveAction>) => {
    const response = await api.patch<CorrectiveAction>(
      `/corrective-actions/${id}`,
      payload,
    );
    return response.data;
  },

  updateStatus: async (
    id: string,
    status: CorrectiveActionStatus,
    evidence_notes?: string,
  ) => {
    const response = await api.patch<CorrectiveAction>(
      `/corrective-actions/${id}/status`,
      { status, evidence_notes },
    );
    return response.data;
  },

  remove: async (id: string) => {
    await api.delete(`/corrective-actions/${id}`);
  },
};
