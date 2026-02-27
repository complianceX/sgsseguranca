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
    const config = error.config as RetryConfig | undefined;
    if (!config) {
      return Promise.reject(error);
    }
    const method = (config.method || 'get').toLowerCase();
    const isIdempotent = method === 'get' || method === 'head' || method === 'options';
    const status = error.response?.status;
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
