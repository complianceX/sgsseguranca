import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';
import { authService } from './authService';

export interface Company {
  id: string;
  razao_social: string;
  cnpj: string;
  endereco: string;
  responsavel: string;
  email_contato?: string | null;
  logo_url?: string | null;
  status: boolean;
  created_at: string;
  updated_at: string;
}

type AuthSessionCompanyLike = {
  id?: string;
  razao_social?: string;
  cnpj?: string;
  endereco?: string;
  responsavel?: string;
  email_contato?: string | null;
  logo_url?: string | null;
  status?: boolean;
  created_at?: string;
  updated_at?: string;
};

function normalizeCompanyFromSession(
  companyLike?: AuthSessionCompanyLike | null,
): Company | null {
  if (!companyLike?.id) {
    return null;
  }

  return {
    id: companyLike.id,
    razao_social: companyLike.razao_social || 'Empresa vinculada',
    cnpj: companyLike.cnpj || '',
    endereco: companyLike.endereco || '',
    responsavel: companyLike.responsavel || '',
    email_contato: companyLike.email_contato ?? null,
    logo_url: companyLike.logo_url ?? null,
    status: companyLike.status ?? true,
    created_at: companyLike.created_at || new Date(0).toISOString(),
    updated_at: companyLike.updated_at || new Date(0).toISOString(),
  };
}

async function getCompanyFromCurrentSession(
  expectedCompanyId?: string,
): Promise<Company | null> {
  const meResponse = await authService.getCurrentSession();
  const user = meResponse.user;
  if (!user?.company_id) {
    return null;
  }

  if (expectedCompanyId && user.company_id !== expectedCompanyId) {
    return null;
  }

  const normalized = normalizeCompanyFromSession(
    user.company as AuthSessionCompanyLike | undefined,
  );

  if (normalized) {
    return normalized;
  }

  // Fallback final: tenta endpoint direto somente se necessário.
  const companyResponse = await api.get<Company>(`/companies/${user.company_id}`);
  return companyResponse.data;
}

export const companiesService = {
  findPaginated: async (opts?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<Company>> => {
    const response = await api.get<PaginatedResponse<Company>>('/companies', {
      params: {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 20,
        ...(opts?.search ? { search: opts.search } : {}),
      },
    });
    return response.data;
  },

  findAll: async () => {
    try {
      return fetchAllPages({
        fetchPage: (page, limit) =>
          companiesService.findPaginated({
            page,
            limit,
          }),
        limit: 100,
        maxPages: 20,
      });
    } catch (error) {
      if (typeof window === 'undefined') {
        throw error;
      }
    }
    try {
      const fallbackCompany = await getCompanyFromCurrentSession();
      if (fallbackCompany) {
        return [fallbackCompany];
      }
    } catch {
      return [];
    }
    return [];
  },

  findOne: async (id: string) => {
    try {
      const response = await api.get<Company>(`/companies/${id}`);
      return response.data;
    } catch (error) {
      if (typeof window === 'undefined') {
        throw error;
      }

      const fallbackCompany = await getCompanyFromCurrentSession(id);
      if (fallbackCompany) {
        return fallbackCompany;
      }

      throw error;
    }
  },

  create: async (data: Partial<Company>) => {
    const response = await api.post<Company>('/companies', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Company>) => {
    const response = await api.patch<Company>(`/companies/${id}`, data, {
      timeout: 45000,
    });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/companies/${id}`);
  },
};
