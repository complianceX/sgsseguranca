import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';
import { getOfflineCache, isOfflineRequestError, setOfflineCache } from '@/lib/offline-cache';

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
      limit: opts?.limit ?? 20,
      ...(opts?.search ? { search: opts.search } : {}),
      ...(opts?.companyId ? { company_id: opts.companyId } : {}),
    };
    const cacheKey = `sites.paginated.${JSON.stringify(params)}`;

    try {
      const response = await api.get<PaginatedResponse<Site>>('/sites', {
        params,
      });
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<PaginatedResponse<Site>>(cacheKey);
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
        maxPages: 50,
      });
      setOfflineCache(cacheKey, data);
      return data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<Site[]>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  findOne: async (id: string) => {
    const cacheKey = `sites.one.${id}`;
    try {
      const response = await api.get<Site>(`/sites/${id}`);
      setOfflineCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (!isOfflineRequestError(error)) {
        throw error;
      }
      const cached = getOfflineCache<Site>(cacheKey);
      if (cached) return cached;
      throw error;
    }
  },

  create: async (data: Partial<Site>) => {
    const response = await api.post<Site>('/sites', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Site>) => {
    const response = await api.patch<Site>(`/sites/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/sites/${id}`);
  },
};
