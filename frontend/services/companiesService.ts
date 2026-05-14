import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';
import { authService } from './authService';
import { isAdminGeralAccount } from '@/lib/auth-session-state';
import { sessionStore } from '@/lib/sessionStore';

const MAX_COMPANIES_PAGE_LIMIT = 100;
const MAX_COMPANIES_FETCH_ALL_PAGES = 100;

function normalizeCompaniesLimit(limit?: number) {
  if (!Number.isFinite(limit)) {
    return 20;
  }
  return Math.min(
    Math.max(Math.floor(limit || 20), 1),
    MAX_COMPANIES_PAGE_LIMIT,
  );
}

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

function buildSyntheticSessionCompany(companyId: string): Company {
  return {
    id: companyId,
    razao_social: 'Empresa vinculada',
    cnpj: '',
    endereco: '',
    responsavel: '',
    email_contato: null,
    logo_url: null,
    status: true,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
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

  if (!isAdminGeralAccount(sessionStore.get())) {
    return buildSyntheticSessionCompany(user.company_id);
  }

  // Fallback final apenas para admin geral; usuário tenant-scoped pode não ter
  // can_view_companies e não deve disparar /companies/:id só para rotular o form.
  const companyResponse = await api.get<Company>(
    `/companies/${user.company_id}`,
  );
  return companyResponse.data;
}

function getCurrentSessionCompanyId(): string | null {
  const session = sessionStore.get();
  return session?.companyId || session?.user?.companyId || null;
}

async function getTenantScopedCompanyPage(opts?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<PaginatedResponse<Company> | null> {
  if (isAdminGeralAccount(sessionStore.get())) {
    return null;
  }

  const companyId = getCurrentSessionCompanyId();
  if (!companyId) {
    return null;
  }

  const company = await getCompanyFromCurrentSession(companyId);
  if (!company) {
    return null;
  }

  const search = opts?.search?.trim().toLowerCase();
  const matchesSearch =
    !search ||
    [company.razao_social, company.cnpj, company.responsavel]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(search));
  const data = matchesSearch ? [company] : [];
  const page = opts?.page ?? 1;

  return {
    data,
    total: data.length,
    page,
    lastPage: 1,
  };
}

export const companiesService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<Company>> => {
    const tenantScopedPage = await getTenantScopedCompanyPage(opts);
    if (tenantScopedPage) {
      return tenantScopedPage;
    }

    const response = await api.get<PaginatedResponse<Company>>('/companies', {
      params: {
        page: opts?.page ?? 1,
        limit: normalizeCompaniesLimit(opts?.limit),
        ...(opts?.search ? { search: opts.search } : {}),
      },
    });
    return response.data;
  },

  findAll: async () => {
    const tenantScopedPage = await getTenantScopedCompanyPage({
      page: 1,
      limit: 100,
    });
    if (tenantScopedPage) {
      return tenantScopedPage.data;
    }

    try {
      return await fetchAllPages({
        fetchPage: (page, limit) =>
          companiesService.findPaginated({
            page,
            limit,
          }),
        limit: 100,
        maxPages: MAX_COMPANIES_FETCH_ALL_PAGES,
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
    const sessionCompanyId = getCurrentSessionCompanyId();
    if (!isAdminGeralAccount(sessionStore.get()) && id === sessionCompanyId) {
      const fallbackCompany = await getCompanyFromCurrentSession(id);
      if (fallbackCompany) {
        return fallbackCompany;
      }
    }

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
