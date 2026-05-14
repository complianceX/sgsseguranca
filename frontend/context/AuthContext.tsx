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
  persistAuthenticatedSession,
} from '@/lib/auth-session-state';
import {
  authService,
  AuthLoginResponse,
  AuthLoginResult,
} from '@/services/authService';

const REFRESH_CSRF_COOKIE_NAME = 'refresh_csrf';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const encoded = encodeURIComponent(name);
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${encoded}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(encoded.length + 1));
}

function resolveIdleLogoutMs(): number | null {
  const raw = (process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES || '').trim();
  if (!raw) return 8 * 60 * 60 * 1000;
  const normalized = raw.toLowerCase();
  if (normalized === 'off' || normalized === 'false' || normalized === '0') {
    return null;
  }
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) return 8 * 60 * 60 * 1000;
  const clampedMinutes = Math.min(Math.max(Math.floor(minutes), 5), 24 * 60);
  return clampedMinutes * 60 * 1000;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  roles: string[];
  permissions: string[];
  isAdminGeral: boolean;
  hasPermission: (permission: string) => boolean;
  login: (
    cpf: string,
    password: string,
    turnstileToken?: string,
  ) => Promise<AuthLoginResult>;
  finalizeLogin: (data: AuthLoginResponse) => void;
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
  login: (
    cpf: string,
    password: string,
    turnstileToken?: string,
  ) => Promise<AuthLoginResult>;
  finalizeLogin: (data: AuthLoginResponse) => void;
  logout: () => Promise<void>;
}

const AuthStateContext = createContext<AuthStateContextType | undefined>(undefined);
const AuthActionsContext = createContext<AuthActionsContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isAdminGeral, setIsAdminGeral] = useState(false);
  const router = useRouter();

  const applyAuthenticatedSession = useCallback(
    (session: {
      user: User | null;
      roles?: string[];
      permissions?: string[];
      accessToken?: string;
      isAdminGeral?: boolean;
    }) => {
      const nextRoles = session.roles || [];
      const nextPermissions = session.permissions || [];
      const nextIsAdminGeral =
        session.isAdminGeral === true || session.user?.isAdminGeral === true;

      setUser(
        session.user
          ? { ...session.user, isAdminGeral: nextIsAdminGeral }
          : null,
      );
      setRoles(nextRoles);
      setPermissions(nextPermissions);
      setIsAdminGeral(nextIsAdminGeral);

      if (session.user) {
        persistAuthenticatedSession({
          user: { ...session.user, isAdminGeral: nextIsAdminGeral },
          isAdminGeral: nextIsAdminGeral,
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
    setIsAdminGeral(false);
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
        const hasRefreshCsrfCookie = Boolean(
          readCookie(REFRESH_CSRF_COOKIE_NAME),
        );
        if (!hasRefreshCsrfCookie && authRefreshHint.get()) {
          authRefreshHint.clear();
        }

        if (!tokenStore.get() && hasRefreshCsrfCookie) {
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
            isAdminGeral: data.isAdminGeral === true,
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
    async (
      cpf: string,
      password: string,
      turnstileToken?: string,
    ): Promise<AuthLoginResult> => {
      try {
        clearAuthState();
        await authService.getCsrfToken();
        const data = await authService.login(cpf, password, turnstileToken);

        if ('mfaRequired' in data || 'mfaEnrollRequired' in data) {
          return data;
        }

        if (!data.accessToken || !data.user) {
          throw new Error('Resposta de login inválida do servidor.');
        }

        applyAuthenticatedSession({
          user: data.user,
          roles: data.roles || [],
          permissions: data.permissions || [],
          accessToken: data.accessToken,
          isAdminGeral: data.isAdminGeral === true,
        });

        router.push('/dashboard');
        return data;
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Login error:', error);
        }
        throw error;
      }
    },
    [applyAuthenticatedSession, clearAuthState, router],
  );

  const finalizeLogin = useCallback(
    (data: AuthLoginResponse) => {
      if (!data.accessToken || !data.user) {
        throw new Error('Resposta de login inválida do servidor.');
      }

      applyAuthenticatedSession({
        user: data.user,
        roles: data.roles || [],
        permissions: data.permissions || [],
        accessToken: data.accessToken,
        isAdminGeral: data.isAdminGeral === true,
      });

      router.push('/dashboard');
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

  // Logout automático por inatividade (LGPD + segurança)
  useEffect(() => {
    if (!user) return;

    const IDLE_MS = resolveIdleLogoutMs();
    if (IDLE_MS === null) {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void logout();
        router.push('/login?expired=1');
      }, IDLE_MS);
    };

    const events = ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [user, logout, router]);

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
      finalizeLogin,
      logout,
    }),
    [finalizeLogin, hasPermission, login, logout],
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
