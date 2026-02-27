import api from '@/lib/api';

export interface Profile {
  id: string;
  nome: string;
  permissoes: string[];
}

export const profilesService = {
  findAll: async () => {
    const response = await api.get<Profile[]>('/profiles');
    return response.data;
  },

  findOne: async (id: string) => {
    const response = await api.get<Profile>(`/profiles/${id}`);
    return response.data;
  },
};
