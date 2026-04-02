// frontend/lib/auth-service.ts
// SERVIÇO DE AUTENTICAÇÃO COM COMPANY CONTEXT

import apiClient from './api-client';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatar?: string;
  };
  companies: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
}

interface SelectCompanyResponse {
  company_id: string;
  company_name: string;
  permissions: string[];
}

class AuthService {
  /**
   * ✅ ETAPA 1: Fazer login (obter token + lista de empresas)
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      const response = await apiClient.post<LoginResponse>('/auth/login', {
        email,
        password,
      });

      const { access_token, refresh_token, user, companies } = response.data;

      // Salvar token
      localStorage.setItem('auth_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('user', JSON.stringify(user));

      // ✅ NÃO salvamos company_id aqui ainda!
      // O usuário precisa SELECIONAR uma empresa antes de acessar dados

      return response.data;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  /**
   * ✅ ETAPA 2: Selecionar empresa (POST após login)
   */
  async selectCompany(companyId: string): Promise<SelectCompanyResponse> {
    try {
      const response = await apiClient.post<SelectCompanyResponse>(
        '/auth/select-company',
        { company_id: companyId },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
            // Aqui ainda não temos x-company-id, a API deve permitir
          },
        }
      );

      // ✅ CRUCIAL: Salvar company_id após seleção bem-sucedida
      localStorage.setItem('selected_company_id', companyId);

      return response.data;
    } catch (error) {
      console.error('Failed to select company:', error);
      throw error;
    }
  }

  /**
   * ✅ Verificar se usuário está autenticado com company context
   */
  isAuthenticated(): boolean {
    const token = localStorage.getItem('auth_token');
    const companyId = localStorage.getItem('selected_company_id');

    return !!token && !!companyId;
  }

  /**
   * ✅ Obter informações do usuário autenticado
   */
  getCurrentUser() {
    const userJson = localStorage.getItem('user');
    return userJson ? JSON.parse(userJson) : null;
  }

  /**
   * ✅ Obter empresa selecionada
   */
  getSelectedCompanyId(): string | null {
    return localStorage.getItem('selected_company_id');
  }

  /**
   * ✅ Logout (limpar tudo)
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.warn('Logout API call failed:', error);
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      localStorage.removeItem('selected_company_id');
    }
  }
}

export default new AuthService();

/**
 * ✅ FLUXO DE LOGIN COMPLETO:
 * 
 * 1. Usuário acessa /login
 * 2. Submete email + password
 * 3. authService.login() → recebe token + lista de empresas
 * 4. Redireciona para /company-select
 * 5. Usuário clica em uma empresa
 * 6. authService.selectCompany(companyId) → valida no backend
 * 7. localStorage salva selected_company_id
 * 8. Interceptor axios adiciona x-company-id header em todos requests
 * 9. Usuário pode acessar /dashboard e outros endpoints protegidos
 * 
 * ERROS EVITADOS:
 * - ❌ 401: Agora enviando Authorization header
 * - ❌ 403: Agora enviando x-company-id header
 */
