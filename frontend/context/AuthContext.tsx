'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/tokenStore';
import { authRefreshHint } from '@/lib/authRefreshHint';
import { User } from '@/services/usersService';
import {
  clearAuthenticatedSession,
  isAdminGeralAccount,
  persistAuthenticatedSession,
} from '@/lib/auth-session-state';
import { authService, type AuthMeResponse } from '@/services/authService';

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

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const bootstrapSession = async () => {
      try {
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
          setUser(data.user || null);
          setRoles(data.roles || []);
          setPermissions(data.permissions || []);
          if (data.user) {
            persistAuthenticatedSession({
              user: data.user,
              roles: data.roles || [],
            });
          }
        }
      } catch {
        if (mounted) {
          setUser(null);
          setRoles([]);
          setPermissions([]);
          clearAuthenticatedSession();
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
  }, []);

  const login = async (
    cpf: string,
    password: string,
    turnstileToken?: string,
  ) => {
    try {
      const data = await authService.login(cpf, password, turnstileToken);

      if (!data.accessToken) {
        throw new Error('Access token ausente na resposta de login.');
      }

      let meData: AuthMeResponse | null = null;
      try {
        meData = await authService.getCurrentSession();
      } catch {
        meData = null;
      }

      const authenticatedUser = meData?.user || data.user;
      if (!authenticatedUser) {
        throw new Error('Resposta de login invalida do servidor.');
      }
      const resolvedRoles = meData?.roles || data.roles || [];
      persistAuthenticatedSession({
        user: authenticatedUser,
        roles: resolvedRoles,
        accessToken: data.accessToken,
      });

      setUser(authenticatedUser);
      setRoles(resolvedRoles);
      setPermissions(meData?.permissions || data.permissions || []);
      router.push('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // Ignora falhas de rede no logout e limpa estado local mesmo assim.
    }

    clearAuthenticatedSession();
    setUser(null);
    setRoles([]);
    setPermissions([]);
    router.push('/login');
  };

  const isAdminGeral = isAdminGeralAccount(user?.profile?.nome, roles);
  const hasPermission = (permission: string) =>
    isAdminGeral || permissions.includes(permission);

  return (
    <AuthContext.Provider
      value={{ user, loading, roles, permissions, isAdminGeral, hasPermission, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
