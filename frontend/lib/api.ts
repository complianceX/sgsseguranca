import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import * as Sentry from '@sentry/browser';
import { tokenStore } from './tokenStore';
import { sessionStore } from './sessionStore';
import { authRefreshHint } from './authRefreshHint';
import { selectedTenantStore } from './selectedTenantStore';

const resolveBaseUrl = () => {
  const explicitApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (explicitApiUrl) {
    return explicitApiUrl;
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    const isLocalHost =
      hostname === 'localhost' || hostname === '127.0.0.1';

    if (isLocalHost) {
      // Padrão local: backend roda em 3011 (run-local.ps1 / LOCAL_SETUP.md)
      return `${protocol}//${hostname}:3011`;
    }
  }

  return null;
};

const API_BASE_URL = resolveBaseUrl();
const API_BASE_URL_ERROR_MESSAGE =
  'API não configurada para este ambiente. Defina NEXT_PUBLIC_API_URL de forma explícita no frontend. O único fallback automático permitido é localhost em desenvolvimento.';

export function getApiBaseUrl(): string | null {
  return API_BASE_URL;
}

export function buildApiUrl(path: string): string | null {
  if (!API_BASE_URL) {
    return null;
  }

  const normalizedBase = API_BASE_URL.endsWith('/')
    ? API_BASE_URL.slice(0, -1)
    : API_BASE_URL;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBase}${normalizedPath}`;
}

type RetryConfig = AxiosRequestConfig & { __retryCount?: number };
type AuthRetryConfig = RetryConfig & { __authRetry?: boolean };

const notifyApiStatus = (online: boolean, baseURL?: string) => {
  if (typeof window === 'undefined') return;
  const eventName = online ? 'app:api-online' : 'app:api-offline';
  window.dispatchEvent(
    new CustomEvent(eventName, {
      detail: { baseURL },
    }),
  );
};

const refreshClient = axios.create({
  baseURL: API_BASE_URL || undefined,
  timeout: 15000,
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
      tokenStore.set(token);
      return token;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Timeouts específicos para operações longas — use via config override por request. */
export const TIMEOUT_EXPORT = 120_000; // 2 min — exportação Excel
export const TIMEOUT_PDF    = 180_000; // 3 min — geração de PDF governado
export const TIMEOUT_UPLOAD =  90_000; // 1.5 min — upload de arquivos
export const TIMEOUT_AI     =  45_000; // 45 s — operações de IA

const api = axios.create({
  baseURL: API_BASE_URL || undefined,
  timeout: 30000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (typeof window === 'undefined') {
    return config;
  }
  if (!API_BASE_URL) {
    return Promise.reject(new Error(API_BASE_URL_ERROR_MESSAGE));
  }
  const token = tokenStore.get();
  const session = sessionStore.get();
  const companyId = session?.companyId || null;
  const userProfileName = session?.profileName;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Propagação de trace Sentry → backend (correlação Sentry ↔ Jaeger/logs)
  try {
    const sentryApi = Sentry as unknown as {
      getCurrentHub?: () => {
        getScope?: () => {
          getSpan?: () => { toTraceparent?: () => string | undefined };
        };
      };
      getTraceData?: () => Record<string, string | undefined>;
    };

    const sentryTrace = sentryApi
      .getCurrentHub?.()
      .getScope?.()
      .getSpan?.()
      .toTraceparent?.();

    if (sentryTrace) {
      config.headers['sentry-trace'] = sentryTrace;
    }

    const traceData = sentryApi.getTraceData?.() || {};
    const sentryBaggage = traceData['baggage'];
    if (sentryBaggage) {
      config.headers['baggage'] = sentryBaggage;
    } else if (traceData['sentry-trace'] && !sentryTrace) {
      config.headers['sentry-trace'] = traceData['sentry-trace'];
    }
  } catch {
    // Sentry não inicializado (ex: testes, SSR sem DSN) — ignorar silenciosamente
  }

  const existingCompanyId =
    config.headers?.get?.('x-company-id') ||
    config.headers?.['x-company-id'];
  if (!existingCompanyId) {
    if (userProfileName === 'Administrador Geral') {
      const selectedTenant = selectedTenantStore.get();
      if (selectedTenant?.companyId) {
        config.headers['x-company-id'] = selectedTenant.companyId;
      } else if (companyId) {
        config.headers['x-company-id'] = companyId;
      }
    } else if (companyId) {
      config.headers['x-company-id'] = companyId;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    notifyApiStatus(true, response.config?.baseURL);
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as AuthRetryConfig | undefined;
    if (!config) {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    if (!status || error.code === 'ERR_NETWORK') {
      notifyApiStatus(false, config.baseURL || API_BASE_URL || undefined);
    }

    // 401 → tenta refresh via cookie httpOnly e refaz a request uma única vez
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
        if (typeof config.headers.set === 'function') {
          config.headers.set('Authorization', `Bearer ${newToken}`);
        } else {
          config.headers = {
            ...config.headers,
            Authorization: `Bearer ${newToken}`,
          };
        }
        return api.request(config);
      } catch {
        tokenStore.clear();
        sessionStore.clear();
        authRefreshHint.clear();
        selectedTenantStore.clear();
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
    const jitter = Math.random() * 100;
    const backoffMs = 300 * config.__retryCount + jitter;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    return api.request(config);
  },
);

export default api;
