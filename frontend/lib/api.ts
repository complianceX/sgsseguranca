import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { storage } from './storage';

const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return 'http://localhost:3001';
};

type RetryConfig = AxiosRequestConfig & { __retryCount?: number };
type AuthRetryConfig = RetryConfig & { __authRetry?: boolean };

const refreshClient = axios.create({
  baseURL: getBaseUrl(),
  timeout: 45000,
  withCredentials: true,
});

let refreshInFlight: Promise<string> | null = null;
async function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const res = await refreshClient.post<{ accessToken: string }>('/auth/refresh');
      const token = res.data?.accessToken;
      if (!token) {
        throw new Error('Refresh não retornou accessToken.');
      }
      storage.setItem('token', token);
      return token;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 45000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (typeof window === 'undefined') {
    return config;
  }
  const token = storage.getItem('token');
  let companyId = storage.getItem('companyId');
  let userProfileName: string | undefined;
  const rawUser = storage.getItem('user');
  if (rawUser) {
    try {
      const parsedUser = JSON.parse(rawUser) as {
        company_id?: string;
        profile?: { nome?: string };
      };
      if (!companyId && parsedUser?.company_id) {
        companyId = parsedUser.company_id;
      }
      userProfileName = parsedUser?.profile?.nome;
    } catch {
      companyId = companyId || null;
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const existingCompanyId =
    config.headers?.get?.('x-company-id') ||
    config.headers?.['x-company-id'];
  if (!existingCompanyId && companyId && userProfileName !== 'Administrador Geral') {
    config.headers['x-company-id'] = companyId;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as AuthRetryConfig | undefined;
    if (!config) {
      return Promise.reject(error);
    }

    // 401 → tenta refresh via cookie httpOnly e refaz a request uma única vez
    const status = error.response?.status;
    const url = String(config.url || '');
    const method = (config.method || 'get').toLowerCase();
    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/logout');

    if (status === 401 && !config.__authRetry && !isAuthEndpoint) {
      config.__authRetry = true;
      try {
        const newToken = await refreshAccessToken();
        config.headers = config.headers || {};
        (config.headers as any).Authorization = `Bearer ${newToken}`;
        return api.request(config);
      } catch {
        storage.removeItem('token');
        storage.removeItem('user');
        storage.removeItem('companyId');
        return Promise.reject(error);
      }
    }

    const isIdempotent = method === 'get' || method === 'head' || method === 'options';
    const shouldRetry =
      isIdempotent &&
      (error.code === 'ECONNABORTED' ||
        !status ||
        (status >= 500 && status <= 599));

    if (!shouldRetry) {
      return Promise.reject(error);
    }

    config.__retryCount = config.__retryCount || 0;
    if (config.__retryCount >= 2) {
      return Promise.reject(error);
    }
    config.__retryCount += 1;
    const backoffMs = 300 * config.__retryCount;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    return api.request(config);
  },
);

export default api;
