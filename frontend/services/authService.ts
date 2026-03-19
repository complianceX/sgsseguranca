import api from '@/lib/api';
import type { User } from './usersService';

export interface AuthMeResponse {
  user?: User;
  roles?: string[];
  permissions?: string[];
}

export interface AuthLoginResponse extends AuthMeResponse {
  accessToken: string;
}

export interface RefreshAccessTokenResponse {
  accessToken: string;
}

export const authService = {
  login: async (cpf: string, password: string): Promise<AuthLoginResponse> => {
    const response = await api.post<AuthLoginResponse>('/auth/login', {
      cpf,
      password,
    });
    return response.data;
  },

  getCurrentSession: async (): Promise<AuthMeResponse> => {
    const response = await api.get<AuthMeResponse>('/auth/me');
    return response.data;
  },

  refreshAccessToken: async (): Promise<RefreshAccessTokenResponse> => {
    const response =
      await api.post<RefreshAccessTokenResponse>('/auth/refresh');
    return response.data;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },
};
