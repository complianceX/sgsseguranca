'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/tokenStore';
import { authRefreshHint } from '@/lib/authRefreshHint';
import { User } from '@/services/usersService';
import {
  clearAuthenticatedSession,
  isAdminGeralAccount,
  persistAuthenticatedSession,
} from '@/lib/auth-session-state';
import { authService } from '@/services/authService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  roles: string[];
  permissions: string[];
  isAdminGeral: boolean;
  hasPermission: (permission: string) => boolean;
  login: (cpf: string, password: string, turnstileToken?: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface AuthStateContextType {
  user: User | null;
  loading: boolean;
  roles: string[];
  permissions: string[];
  isAdminGeral: boolean;
}

interface AuthActionsContextType {
  hasPermission: (permission: string) => boolean;
  login: (cpf: string, password: string, turnstileToken?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthStateContext = createContext<AuthStateContextType | undefined>(undefined);
const AuthActionsContext = createContext<AuthActionsContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const router = useRouter();
  const isAdminGeral = useMemo(
    () => isAdminGeralAccount(user?.profile?.nome, roles),
    [roles, user?.profile?.nome],
  );

  const applyAuthenticatedSession = useCallback(
    (session: {
      user: User | null;
      roles?: string[];
      permissions?: string[];
      accessToken?: string;
    }) => {
      const nextRoles = session.roles || [];
      const nextPermissions = session.permissions || [];

      setUser(session.user);
      setRoles(nextRoles);
      setPermissions(nextPermissions);

      if (session.user) {
        persistAuthenticatedSession({
          user: session.user,
          roles: nextRoles,
          accessToken: session.accessToken,
        });
        return;
      }

      clearAuthenticatedSession();
    },
    [],
  );

  const clearAuthState = useCallback(() => {
    clearAuthenticatedSession();
    setUser(null);
    setRoles([]);
    setPermissions([]);
  }, []);

  useEffect(() => {
    let mounted = true;

    const bootstrapSession = async () => {
      try {
        // Handshake de segurança: garante cookie CSRF inicial
        await authService.getCsrfToken().catch(() => {
          /* ignorar falha de handshake inicial em modo offline */
        });

        // Access token fica apenas em memória.
        // Em reload, tentamos obter novo access token via refresh token (cookie httpOnly).
        if (!tokenStore.get() && authRefreshHint.get()) {
          const refreshed = await authService.refreshAccessToken();
          const refreshedToken = refreshed.accessToken;
          if (refreshedToken) {
            tokenStore.set(refreshedToken);
          }
        }

        if (!tokenStore.get()) return;

        const data = await authService.getCurrentSession();
        if (mounted) {
          applyAuthenticatedSession({
            user: data.user || null,
            roles: data.roles || [],
            permissions: data.permissions || [],
          });
        }
      } catch {
        if (mounted) {
          clearAuthState();
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      mounted = false;
    };
  }, [applyAuthenticatedSession, clearAuthState]);

  const login = useCallback(
    async (cpf: string, password: string, turnstileToken?: string) => {
      try {
        const data = await authService.login(cpf, password, turnstileToken);

        if (!data.accessToken) {
          throw new Error('Access token ausente na resposta de login.');
        }

        const authenticatedUser = data.user;
        if (!authenticatedUser) {
          throw new Error('Resposta de login invalida do servidor.');
        }

        const resolvedRoles = data.roles || [];
        applyAuthenticatedSession({
          user: authenticatedUser,
          roles: resolvedRoles,
          permissions: data.permissions || [],
          accessToken: data.accessToken,
        });

        router.push('/dashboard');
      } catch (error) {
        console.error('Login error:', error);
        throw error;
      }
    },
    [applyAuthenticatedSession, router],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Ignora falhas de rede no logout e limpa estado local mesmo assim.
    }

    clearAuthState();
    router.push('/login');
  }, [clearAuthState, router]);

  const hasPermission = useCallback(
    (permission: string) => isAdminGeral || permissions.includes(permission),
    [isAdminGeral, permissions],
  );

  const authStateValue = useMemo<AuthStateContextType>(
    () => ({
      user,
      loading,
      roles,
      permissions,
      isAdminGeral,
    }),
    [isAdminGeral, loading, permissions, roles, user],
  );

  const authActionsValue = useMemo<AuthActionsContextType>(
    () => ({
      hasPermission,
      login,
      logout,
    }),
    [hasPermission, login, logout],
  );

  return (
    <AuthStateContext.Provider value={authStateValue}>
      <AuthActionsContext.Provider value={authActionsValue}>
        {children}
      </AuthActionsContext.Provider>
    </AuthStateContext.Provider>
  );
};

export const useAuthState = () => {
  const context = useContext(AuthStateContext);
  if (!context) {
    throw new Error('useAuthState must be used within an AuthProvider');
  }

  return context;
};

export const useAuthActions = () => {
  const context = useContext(AuthActionsContext);
  if (!context) {
    throw new Error('useAuthActions must be used within an AuthProvider');
  }

  return context;
};

export const useAuth = (): AuthContextType => {
  const state = useAuthState();
  const actions = useAuthActions();

  return useMemo(
    () => ({
      ...state,
      ...actions,
    }),
    [actions, state],
  );
};
