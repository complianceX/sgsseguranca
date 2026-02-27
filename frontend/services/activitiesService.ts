import api from '@/lib/api';

export interface Activity {
  id: string;
  nome: string;
  descricao?: string;
  company_id: string;
  createdAt: string;
  updatedAt: string;
}

export const activitiesService = {
  findAll: async () => {
    const response = await api.get<Activity[]>('/activities');
    return response.data;
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
