import api from '@/lib/api';
import { CursorPaginatedResponse, PaginatedResponse } from './pagination';

export interface Training {
  id: string;
  nome: string;
  nr_codigo?: string;
  carga_horaria?: number;
  obrigatorio_para_funcao?: boolean;
  bloqueia_operacao_quando_vencido?: boolean;
  data_conclusao: string;
  data_vencimento: string;
  certificado_url?: string;
  user_id: string;
  company_id: string;
  auditado_por_id?: string;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
  user?: {
    nome: string;
  };
  auditado_por?: {
    nome: string;
  };
}

export interface TrainingExpirySummary {
  total: number;
  expired: number;
  expiringSoon: number;
  valid: number;
}

export interface TrainingBlockingUser {
  userId: string;
  userName: string;
  trainings: Array<{
    id: string;
    nome: string;
    nr_codigo?: string;
    data_vencimento: string;
  }>;
}

export const trainingsService = {
  findPaginated: async (opts?: { page?: number; limit?: number }): Promise<PaginatedResponse<Training>> => {
    const response = await api.get<PaginatedResponse<Training>>('/trainings', {
      params: { page: opts?.page ?? 1, limit: opts?.limit ?? 20 },
    });
    return response.data;
  },

  findByCursor: async (opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<CursorPaginatedResponse<Training>> => {
    const response = await api.get<CursorPaginatedResponse<Training>>(
      '/trainings',
      {
        params: {
          cursor: opts?.cursor,
          limit: opts?.limit ?? 20,
        },
      },
    );
    return response.data;
  },

  findAll: async (): Promise<Training[]> => {
    const response = await api.get<Training[]>('/trainings/export/all');
    return response.data;
  },

  findOne: async (id: string): Promise<Training> => {
    const response = await api.get(`/trainings/${id}`);
    return response.data;
  },

  findByUserId: async (userId: string): Promise<Training[]> => {
    const response = await api.get(`/trainings/user/${userId}`);
    return response.data;
  },

  getExpirySummary: async (): Promise<TrainingExpirySummary> => {
    const response = await api.get('/trainings/expiry/summary');
    return response.data;
  },

  findExpiring: async (days: number = 7): Promise<Training[]> => {
    const response = await api.get('/trainings/expiry/expiring', {
      params: { days },
    });
    return response.data;
  },

  notifyExpiry: async (days: number = 7): Promise<{
    trainings: number;
    notificationsCreated: number;
  }> => {
    const response = await api.post('/trainings/expiry/notify', null, {
      params: { days },
    });
    return response.data;
  },

  getBlockingUsers: async (): Promise<TrainingBlockingUser[]> => {
    const response = await api.get('/trainings/compliance/blocking-users');
    return response.data;
  },

  getComplianceByUser: async (userId: string): Promise<{
    total: number;
    expired: number;
    expiringSoon: number;
    blocked: boolean;
    pendingTrainings: Array<{
      id: string;
      nome: string;
      nr_codigo?: string;
      data_vencimento: string;
    }>;
  }> => {
    const response = await api.get(`/trainings/compliance/user/${userId}`);
    return response.data;
  },

  create: async (data: Partial<Training>): Promise<Training> => {
    const response = await api.post('/trainings', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Training>): Promise<Training> => {
    const response = await api.patch(`/trainings/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/trainings/${id}`);
  },
};
