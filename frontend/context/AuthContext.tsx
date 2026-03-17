'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { tokenStore } from '@/lib/tokenStore';
import { sessionStore } from '@/lib/sessionStore';
import { authRefreshHint } from '@/lib/authRefreshHint';
import { selectedTenantStore } from '@/lib/selectedTenantStore';

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
  isAdminGeral: boolean;
  hasPermission: (permission: string) => boolean;
  login: (cpf: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

function normalizeRoleToken(value?: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isAdminGeralAccount(
  profileName?: string | null,
  roleNames: string[] = [],
): boolean {
  const adminTokens = new Set(['administradorgeral', 'admingeral']);

  const normalizedProfile = normalizeRoleToken(profileName);
  if (adminTokens.has(normalizedProfile)) {
    return true;
  }

  return roleNames.some((role) => adminTokens.has(normalizeRoleToken(role)));
}

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
        const isAdminGeralDetected = isAdminGeralAccount(
          data.user?.profile?.nome,
          data.roles || [],
        );
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
            if (
              isAdminGeralDetected &&
              data.user.company_id &&
              !selectedTenantStore.get()
            ) {
              selectedTenantStore.set({
                companyId: data.user.company_id,
                companyName: data.user.company?.razao_social || 'Empresa padrão',
              });
            }
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
          selectedTenantStore.clear();
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
      let meData: AuthMeResponse | null = null;
      try {
        const meResponse = await api.get<AuthMeResponse>('/auth/me');
        meData = meResponse.data;
      } catch {
        meData = null;
      }

      const authenticatedUser = meData?.user || data.user;
      if (!authenticatedUser) {
        throw new Error('Resposta de login invalida do servidor.');
      }
      const resolvedRoles = meData?.roles || data.roles || [];
      const isAdminGeralDetected = isAdminGeralAccount(
        authenticatedUser.profile?.nome,
        resolvedRoles,
      );
      sessionStore.set({
        userId: authenticatedUser.id,
        companyId: authenticatedUser.company_id,
        profileName: authenticatedUser.profile?.nome ?? null,
      });
      if (isAdminGeralDetected) {
        if (authenticatedUser.company_id) {
          selectedTenantStore.set({
            companyId: authenticatedUser.company_id,
            companyName: authenticatedUser.company?.razao_social || 'Empresa padrão',
          });
        } else {
          selectedTenantStore.clear();
        }
      } else {
        selectedTenantStore.clear();
      }

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
      await api.post('/auth/logout');
    } catch {
      // Ignora falhas de rede no logout e limpa estado local mesmo assim.
    }

    tokenStore.clear();
    sessionStore.clear();
    authRefreshHint.clear();
    selectedTenantStore.clear();
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
