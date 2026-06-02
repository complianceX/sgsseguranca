import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';
import { consumeOfflineCache, isOfflineRequestError, setOfflineCache, CACHE_TTL } from '@/lib/offline-cache';

const MAX_SITES_PAGE_LIMIT = 100;
const MAX_SITES_FETCH_ALL_PAGES = 500;

function normalizeSitesLimit(limit?: number) {
  if (!Number.isFinite(limit)) {
    return 20;
  }
  return Math.min(Math.max(Math.floor(limit || 20), 1), MAX_SITES_PAGE_LIMIT);
}

export interface Site {
  id: string;
  nome: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export const sitesService = {
  findPaginated: async (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
  }): Promise<PaginatedResponse<Site>> => {
    const params = {
      page: opts?.page ?? 1,
      limit: normalizeSitesLimit(opts?.limit),
      ...(opts?.search ? { search: opts.search } : {}),
    };
    const cacheKey = `sites.paginated.${opts?.companyId ?? 'default'}.${JSON.stringify(params)}`;

    const headers = opts?.companyId ? { 'x-company-id': opts.companyId } : {};
    try {
      const response = await api.get<PaginatedResponse<Site>>('/sites', {
        params,
        headers,
      });
      setOfflineCache(cacheKey, response.data, CACHE_TTL.REFERENCE);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = consumeOfflineCache<PaginatedResponse<Site>>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findAll: async (companyId?: string) => {
    const cacheKey = `sites.all.${companyId || 'all'}`;
    try {
      const data = await fetchAllPages({
        fetchPage: (page, limit) =>
          sitesService.findPaginated({
            page,
            limit,
            companyId,
          }),
        limit: 100,
        maxPages: MAX_SITES_FETCH_ALL_PAGES,
      });
      setOfflineCache(cacheKey, data, CACHE_TTL.REFERENCE);
      return data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = consumeOfflineCache<Site[]>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findOne: async (id: string) => {
    const cacheKey = `sites.one.${id}`;
    try {
      const response = await api.get<Site>(`/sites/${id}`);
      setOfflineCache(cacheKey, response.data, CACHE_TTL.REFERENCE);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = consumeOfflineCache<Site>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  create: async (data: Partial<Site>, companyId?: string) => {
    const { company_id, ...body } = data;
    const resolvedCompanyId = companyId ?? company_id;
    const headers = resolvedCompanyId ? { 'x-company-id': resolvedCompanyId } : {};
    const response = await api.post<Site>('/sites', body, { headers });
    return response.data;
  },

  update: async (id: string, data: Partial<Site>, companyId?: string) => {
    const { company_id, ...body } = data;
    const resolvedCompanyId = companyId ?? company_id;
    const headers = resolvedCompanyId ? { 'x-company-id': resolvedCompanyId } : {};
    const response = await api.patch<Site>(`/sites/${id}`, body, { headers });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/sites/${id}`);
  },
};
