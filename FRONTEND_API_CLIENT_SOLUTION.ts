// frontend/lib/api-client.ts
// ARQUIVO PARA IMPLEMENTAR HEADER DE COMPANY CONTEXT

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.sgsseguranca.com.br';

// Criar instância axios
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ✅ INTERCEPTOR CRÍTICO: Adicionar company context em cada request
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 1. Obter token do localStorage
    const token = localStorage.getItem('auth_token');
    
    // 2. Obter company_id do localStorage (definido após login e seleção)
    const companyId = localStorage.getItem('selected_company_id');

    // 3. Adicionar Authorization header
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 4. ✅ CRUCIAL: Adicionar x-company-id header
    if (companyId) {
      config.headers['x-company-id'] = companyId;
    } else {
      console.warn('⚠️ WARNING: No company_id found. Requests will be rejected.');
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ INTERCEPTOR: Lidar com erros 401 (token expirado)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 1. Tentar refresh do token
      return refreshAuthToken()
        .then((newToken) => {
          // 2. Repetir request com novo token
          const config = error.config;
          config.headers.Authorization = `Bearer ${newToken}`;
          return apiClient.request(config);
        })
        .catch(() => {
          // 3. Se refresh falhar, redirecionar para login
          localStorage.removeItem('auth_token');
          localStorage.removeItem('selected_company_id');
          window.location.href = '/login';
          return Promise.reject(error);
        });
    }

    if (error.response?.status === 403) {
      // Falta company context
      console.error('❌ ERROR 403: Company context not set. Please select a company.');
      window.location.href = '/company-select';
    }

    return Promise.reject(error);
  }
);

// Função para refresh token
async function refreshAuthToken(): Promise<string> {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      {},
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          'x-company-id': localStorage.getItem('selected_company_id'),
        },
      }
    );
    
    const newToken = response.data.access_token;
    localStorage.setItem('auth_token', newToken);
    return newToken;
  } catch (error) {
    throw new Error('Failed to refresh token');
  }
}

export default apiClient;
