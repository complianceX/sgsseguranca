import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';

export interface Activity {
  id: string;
  nome: string;
  descricao?: string;
  company_id: string;
  createdAt: string;
  updatedAt: string;
}

export const activitiesService = {
  findPaginated: async (opts?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<Activity>> => {
    const response = await api.get<PaginatedResponse<Activity>>('/activities', {
      params: {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 20,
        ...(opts?.search ? { search: opts.search } : {}),
      },
    });
    return response.data;
  },

  findAll: async () => {
    return fetchAllPages({
      fetchPage: (page, limit) =>
        activitiesService.findPaginated({
          page,
          limit,
        }),
      limit: 100,
      maxPages: 50,
    });
  },

  findOne: async (id: string) => {
    const response = await api.get<Activity>(`/activities/${id}`);
    return response.data;
  },

  create: async (data: Partial<Activity>) => {
    const response = await api.post<Activity>('/activities', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Activity>) => {
    const response = await api.patch<Activity>(`/activities/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/activities/${id}`);
  },
};
