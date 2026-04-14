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

export interface AuthMfaChallengeResponse {
  mfaRequired: true;
  challengeToken: string;
  expiresIn: number;
  methods: string[];
}

export interface AuthMfaBootstrapResponse {
  mfaEnrollRequired: true;
  challengeToken: string;
  expiresIn: number;
  otpAuthUrl: string;
  manualEntryKey: string;
  recoveryCodes: string[];
}

export type AuthLoginResult =
  | AuthLoginResponse
  | AuthMfaChallengeResponse
  | AuthMfaBootstrapResponse;

export interface RefreshAccessTokenResponse {
  accessToken: string;
}

export const authService = {
  login: async (
    cpf: string,
    password: string,
    turnstileToken?: string,
  ): Promise<AuthLoginResult> => {
    const response = await api.post<AuthLoginResult>('/auth/login', {
      cpf,
      password,
      turnstileToken,
    });
    return response.data;
  },

  verifyLoginMfa: async (
    challengeToken: string,
    code: string,
  ): Promise<AuthLoginResponse> => {
    const response = await api.post<AuthLoginResponse>('/auth/login/mfa/verify', {
      challengeToken,
      code,
    });
    return response.data;
  },

  activateBootstrapMfa: async (
    challengeToken: string,
    code: string,
  ): Promise<AuthLoginResponse> => {
    const response = await api.post<AuthLoginResponse>(
      '/auth/login/mfa/bootstrap/activate',
      {
        challengeToken,
        code,
      },
    );
    return response.data;
  },

  verifyStepUp: async (payload: {
    reason: string;
    code?: string;
    password?: string;
  }): Promise<{ stepUpToken: string; expiresIn: number }> => {
    const response = await api.post<{ stepUpToken: string; expiresIn: number }>(
      '/auth/step-up/verify',
      payload,
    );
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

  getCsrfToken: async (): Promise<void> => {
    await api.get('/auth/csrf', {
      params: { ts: Date.now() },
    });
  },
};
