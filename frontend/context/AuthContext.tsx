'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { tokenStore } from '@/lib/tokenStore';
import { sessionStore } from '@/lib/sessionStore';
import { authRefreshHint } from '@/lib/authRefreshHint';

import { User } from '@/services/usersService';

interface AuthMeResponse {
  user?: User;
  roles?: string[];
  permissions?: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  roles: string[];
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  login: (cpf: string, password: string) => Promise<void>;
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
          const refreshed = await api.post<{ accessToken: string }>('/auth/refresh');
          const refreshedToken = refreshed.data?.accessToken;
          if (refreshedToken) {
            tokenStore.set(refreshedToken);
          }
        }

        if (!tokenStore.get()) return;

        const response = await api.get<AuthMeResponse>('/auth/me');
        const data = response.data;
        if (mounted) {
          setUser(data.user || null);
          setRoles(data.roles || []);
          setPermissions(data.permissions || []);
          if (data.user?.id) {
            sessionStore.set({
              userId: data.user.id,
              companyId: data.user.company_id,
              profileName: data.user.profile?.nome ?? null,
            });
          }
        }
      } catch {
        if (mounted) {
          setUser(null);
          setRoles([]);
          setPermissions([]);
          tokenStore.clear();
          sessionStore.clear();
          authRefreshHint.clear();
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

  const login = async (cpf: string, password: string) => {
    try {
      const response = await api.post('/auth/login', { cpf, password });
      const data = response.data as {
        user?: User;
        accessToken?: string;
        requires2FA?: boolean;
        requires2FASetup?: boolean;
        roles?: string[];
        permissions?: string[];
      };

      if (data.requires2FA || data.requires2FASetup) {
        throw new Error(
          data.requires2FASetup
            ? 'Sua conta exige configuracao de 2FA antes do login.'
            : 'Sua conta exige validacao 2FA para continuar.',
        );
      }

      if (!data.accessToken) {
        throw new Error('Access token ausente na resposta de login.');
      }

      tokenStore.set(data.accessToken);
      authRefreshHint.set();

      const meResponse = await api.get<AuthMeResponse>('/auth/me');
      const authenticatedUser = meResponse.data?.user || data.user;
      if (!authenticatedUser) {
        throw new Error('Resposta de login invalida do servidor.');
      }
      sessionStore.set({
        userId: authenticatedUser.id,
        companyId: authenticatedUser.company_id,
        profileName: authenticatedUser.profile?.nome ?? null,
      });

      setUser(authenticatedUser);
      setRoles(meResponse.data?.roles || data.roles || []);
      setPermissions(meResponse.data?.permissions || data.permissions || []);
      router.push('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignora falhas de rede no logout e limpa estado local mesmo assim.
    }

    tokenStore.clear();
    sessionStore.clear();
    authRefreshHint.clear();
    setUser(null);
    setRoles([]);
    setPermissions([]);
    router.push('/login');
  };

  const hasPermission = (permission: string) => permissions.includes(permission);

  return (
    <AuthContext.Provider
      value={{ user, loading, roles, permissions, hasPermission, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
