import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';

const MAX_USERS_PAGE_LIMIT = 100;

export const UserIdentityType = {
  SYSTEM_USER: 'system_user',
  EMPLOYEE_SIGNER: 'employee_signer',
} as const;

export type UserIdentityType =
  (typeof UserIdentityType)[keyof typeof UserIdentityType];

export const UserAccessStatus = {
  CREDENTIALED: 'credentialed',
  NO_LOGIN: 'no_login',
  MISSING_CREDENTIALS: 'missing_credentials',
} as const;

export type UserAccessStatus =
  (typeof UserAccessStatus)[keyof typeof UserAccessStatus];

function normalizeUsersLimit(limit?: number) {
  if (!Number.isFinite(limit)) {
    return 20;
  }
  return Math.min(Math.max(Math.floor(limit || 20), 1), MAX_USERS_PAGE_LIMIT);
}

export interface Company {
  id: string;
  razao_social: string;
  cnpj: string;
  endereco: string;
  responsavel: string;
  status: boolean;
}

export interface UserCompanySummary {
  id: string;
  razao_social: string;
}

export interface Profile {
  id: string;
  nome: string;
  permissoes: string[];
}

export interface User {
  id: string;
  nome: string;
  email: string;
  cpf: string;
  funcao?: string;
  role: string;
  company_id: string;
  company?: UserCompanySummary;
  site_id?: string;
  site?: { id: string; nome: string };
  profile_id: string;
  profile?: Profile;
  isAdminGeral?: boolean;
  roles?: string[];
  permissions?: string[];
  /** Consentimento explícito para processamento por IA (LGPD). */
  ai_processing_consent?: boolean;
  identity_type?: UserIdentityType;
  access_status?: UserAccessStatus;
  created_at: string;
  updated_at: string;
}

export interface WorkerOperationalStatus {
  user: {
    id: string;
    nome: string;
    cpf: string | null;
    funcao?: string | null;
    company_id: string;
  };
  operationalStatus: 'APTO' | 'BLOQUEADO';
  blocked: boolean;
  reasons: string[];
  medicalExam: {
    status: 'VALIDO' | 'VENCIDO' | 'INAPTO' | 'AUSENTE';
    data_realizacao?: string | null;
    data_vencimento?: string | null;
    resultado?: string | null;
  };
  trainings: {
    total: number;
    expiredBlocking: Array<{
      id: string;
      nome: string;
      data_vencimento: string;
    }>;
  };
  epis: {
    totalActive: number;
    expiringCa: Array<{
      id: string;
      epiNome?: string;
      validade_ca?: string;
    }>;
  };
}

export interface WorkerTimelineResponse {
  worker: {
    id: string;
    nome: string;
    cpf: string | null;
    email: string | null;
    funcao: string | null;
    companyId: string;
    companyName: string | null;
    siteId: string | null;
    siteName: string | null;
    createdAt: string;
    updatedAt: string;
  };
  status: WorkerOperationalStatus;
  summary: {
    trainingsTotal: number;
    expiredTrainings: number;
    activeEpis: number;
    expiringEpis: number;
    medicalExamStatus: WorkerOperationalStatus['medicalExam']['status'];
    relatedDocuments: number;
  };
  documents: Array<{
    id: string;
    module: string;
    title: string;
    documentCode: string | null;
    documentDate: string | null;
    originalName: string | null;
  }>;
  timeline: Array<{
    id: string;
    type: 'worker_created' | 'medical_exam' | 'training' | 'epi_assignment' | 'document';
    title: string;
    description: string;
    status: 'info' | 'success' | 'warning' | 'danger';
    date: string;
  }>;
}

export interface ExportMyDataResponse {
  exportedAt?: string;
  subject?: Record<string, unknown>;
  account?: Record<string, unknown>;
  consents?: unknown[];
  processingSummary?: unknown[];
  limitations?: unknown[];
  [key: string]: unknown;
}

export const usersService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
    siteId?: string;
    identityType?: UserIdentityType;
    accessStatus?: UserAccessStatus;
  }): Promise<PaginatedResponse<User>> => {
    const params = {
      page: opts?.page ?? 1,
      limit: normalizeUsersLimit(opts?.limit),
      ...(opts?.search ? { search: opts.search } : {}),
      ...(opts?.siteId ? { site_id: opts.siteId } : {}),
      ...(opts?.identityType ? { identity_type: opts.identityType } : {}),
      ...(opts?.accessStatus ? { access_status: opts.accessStatus } : {}),
    };
    const headers = opts?.companyId ? { 'x-company-id': opts.companyId } : {};
    try {
      const response = await api.get<PaginatedResponse<User>>('/users', {
        params,
        headers,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  findAll: async (companyId?: string, siteId?: string) => {
    try {
      const data = await fetchAllPages({
        fetchPage: (page, limit) =>
          usersService.findPaginated({ page, limit, companyId, siteId }),
        limit: 100,
        maxPages: 50,
        batchSize: 3,
        cacheKey: `GET:/users?page=*&limit=100&company_id=${companyId || 'all'}&site_id=${siteId || 'all'}`,
      });
      return data;
    } catch (error) {
      throw error;
    }
  },

  findOne: async (id: string) => {
    try {
      const response = await api.get<User>(`/users/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getWorkerStatusByCpf: async (cpf: string) => {
    const response = await api.post<WorkerOperationalStatus>(
      '/users/worker-status/by-cpf',
      { cpf },
    );
    return response.data;
  },

  getWorkerTimelineByCpf: async (cpf: string) => {
    const response = await api.post<WorkerTimelineResponse>(
      '/users/worker-status/by-cpf/timeline',
      { cpf },
    );
    return response.data;
  },

  getWorkerTimelineById: async (id: string) => {
    const response = await api.get<WorkerTimelineResponse>(`/users/${id}/timeline`);
    return response.data;
  },

  create: async (data: Partial<User>) => {
    const { company_id, ...body } = data;
    const headers = company_id ? { 'x-company-id': company_id } : {};
    const response = await api.post<User>('/users', body, { headers });
    return response.data;
  },

  update: async (id: string, data: Partial<User>) => {
    const { company_id, ...body } = data;
    const headers = company_id ? { 'x-company-id': company_id } : {};
    const response = await api.patch<User>(`/users/${id}`, body, { headers });
    return response.data;
  },

  gdprErasure: async (id: string) => {
    await api.patch(`/users/${id}/gdpr-erasure`);
  },

  exportMyData: async (): Promise<ExportMyDataResponse> => {
    const { data } = await api.get<ExportMyDataResponse>('/users/me/export');
    return data;
  },

  delete: async (id: string) => {
    await api.delete(`/users/${id}`);
  },

  /** Atualiza o consentimento do usuário autenticado para processamento por IA (LGPD). */
  updateAiConsent: async (consent: boolean): Promise<{ ai_processing_consent: boolean }> => {
    const { data } = await api.patch<{ ai_processing_consent: boolean }>(
      '/users/me/ai-consent',
      { consent },
    );
    return data;
  },
};
