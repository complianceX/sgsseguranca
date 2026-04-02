// frontend/components/LoginFlow.tsx
// COMPONENTES DE LOGIN COM SELEÇÃO DE EMPRESA

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import authService from '@/lib/auth-service';

// ═══════════════════════════════════════════════════════════
// ✅ COMPONENTE 1: Login
// ═══════════════════════════════════════════════════════════

export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // ✅ ETAPA 1: Fazer login e receber lista de empresas
      const loginResponse = await authService.login(email, password);

      // ✅ Redirecionar para seleção de empresa
      router.push('/company-select');
    } catch (err) {
      setError('Email ou senha inválidos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <h1>Login - SGS Segurança</h1>
      
      {error && <div className="error">{error}</div>}

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <input
        type="password"
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <button type="submit" disabled={loading}>
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════
// ✅ COMPONENTE 2: Seleção de Empresa
// ═══════════════════════════════════════════════════════════

export function CompanySelectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Obter lista de empresas do token/sessão
  // (foi retornada no login)
  const [companies] = useState(() => {
    // Recuperar da sessão/cache
    const userJson = localStorage.getItem('user');
    // Assumindo que você guardou as empresas em algum lugar
    return [
      { id: 'afdf7dd1-38b0-445f-9745-b5f6341143a9', name: 'Empresa A' },
      { id: '2b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e', name: 'Empresa B' },
    ];
  });

  const handleSelectCompany = async (companyId: string) => {
    setLoading(true);
    setError('');

    try {
      // ✅ ETAPA 2: Selecionar empresa e validar no backend
      await authService.selectCompany(companyId);

      // ✅ REDIREÇÃO: Agora pode acessar /dashboard
      router.push('/dashboard');
    } catch (err) {
      setError('Falha ao selecionar empresa');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Selecione uma Empresa</h1>
      
      {error && <div className="error">{error}</div>}

      <ul>
        {companies.map((company) => (
          <li key={company.id}>
            <button
              onClick={() => handleSelectCompany(company.id)}
              disabled={loading}
            >
              {company.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ✅ HOOK: useIsAuthenticated
// ═══════════════════════════════════════════════════════════

export function useIsAuthenticated(): boolean {
  const [isAuth, setIsAuth] = React.useState(false);

  React.useEffect(() => {
    setIsAuth(authService.isAuthenticated());
  }, []);

  return isAuth;
}

// ═══════════════════════════════════════════════════════════
// ✅ COMPONENTE: ProtectedRoute
// ═══════════════════════════════════════════════════════════

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();

  React.useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  return isAuthenticated ? <>{children}</> : <div>Loading...</div>;
}

/**
 * ✅ USO EM PAGES/APP:
 * 
 * // pages/login.tsx
 * import { LoginPage } from '@/components/LoginFlow';
 * export default LoginPage;
 * 
 * // pages/company-select.tsx
 * import { CompanySelectPage } from '@/components/LoginFlow';
 * export default CompanySelectPage;
 * 
 * // pages/dashboard.tsx
 * import { ProtectedRoute } from '@/components/LoginFlow';
 * export default function Dashboard() {
 *   return (
 *     <ProtectedRoute>
 *       <DashboardContent />
 *     </ProtectedRoute>
 *   );
 * }
 */
