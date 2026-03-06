import api from '@/lib/api';
import { fetchAllPages, PaginatedResponse } from './pagination';

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

export const usersService = {
  findPaginated: async (opts?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<User>> => {
    const response = await api.get<PaginatedResponse<User>>('/users', {
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
      fetchPage: (page, limit) => usersService.findPaginated({ page, limit }),
      limit: 100,
      maxPages: 50,
    });
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

  delete: async (id: string) => {
    await api.delete(`/users/${id}`);
  },
};
