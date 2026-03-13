import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';
import { getOfflineCache, isOfflineRequestError, setOfflineCache } from '@/lib/offline-cache';

export interface Company {
  id: string;
  razao_social: string;
  cnpj: string;
  endereco: string;
  responsavel: string;
  status: boolean;
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
  company?: Company;
  site_id?: string;
  site?: { id: string; nome: string };
  profile_id: string;
  profile?: Profile;
  roles?: string[];
  permissions?: string[];
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

export const usersService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
  }): Promise<PaginatedResponse<User>> => {
    const params = {
      page: opts?.page ?? 1,
      limit: opts?.limit ?? 20,
      ...(opts?.search ? { search: opts.search } : {}),
      ...(opts?.companyId ? { company_id: opts.companyId } : {}),
    };
    const cacheKey = `users.paginated.${JSON.stringify(params)}`;

    try {
      const response = await api.get<PaginatedResponse<User>>('/users', {
        params,
      });
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<PaginatedResponse<User>>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findAll: async () => {
    const cacheKey = 'users.all';
    try {
      const data = await fetchAllPages({
        fetchPage: (page, limit) => usersService.findPaginated({ page, limit }),
        limit: 100,
        maxPages: 50,
      });
      setOfflineCache(cacheKey, data);
      return data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<User[]>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findOne: async (id: string) => {
    const cacheKey = `users.one.${id}`;
    try {
      const response = await api.get<User>(`/users/${id}`);
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<User>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  getWorkerStatusByCpf: async (cpf: string) => {
    const response = await api.get<WorkerOperationalStatus>(
      `/users/worker-status/cpf/${cpf}`,
    );
    return response.data;
  },

  getWorkerTimelineByCpf: async (cpf: string) => {
    const response = await api.get<WorkerTimelineResponse>(
      `/users/worker-status/cpf/${cpf}/timeline`,
    );
    return response.data;
  },

  getWorkerTimelineById: async (id: string) => {
    const response = await api.get<WorkerTimelineResponse>(`/users/${id}/timeline`);
    return response.data;
  },

  create: async (data: Partial<User>) => {
    const response = await api.post<User>('/users', data);
    return response.data;
  },

  update: async (id: string, data: Partial<User>) => {
    const response = await api.patch<User>(`/users/${id}`, data);
    return response.data;
  },

  gdprErasure: async (id: string) => {
    await api.patch(`/users/${id}/gdpr-erasure`);
  },

  delete: async (id: string) => {
    await api.delete(`/users/${id}`);
  },
};
