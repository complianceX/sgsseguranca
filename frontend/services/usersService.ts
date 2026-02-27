import api from '@/lib/api';

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
  created_at: string;
  updated_at: string;
}

export const usersService = {
  findAll: async () => {
    const response = await api.get<User[]>('/users');
    return response.data;
  },

  findOne: async (id: string) => {
    const response = await api.get<User>(`/users/${id}`);
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
};
