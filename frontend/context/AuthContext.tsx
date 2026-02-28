'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { storage } from '@/lib/storage';

import { User } from '@/services/usersService';

interface AuthMeResponse {
  user?: User;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (cpf: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const bootstrapSession = async () => {
      try {
        const token = storage.getItem('token');
        if (!token) {
          if (mounted) {
            setUser(null);
          }
          return;
        }
        const response = await api.get<AuthMeResponse>('/auth/me');
        const data = response.data;
        if (mounted) {
          setUser(data.user || null);
        }
      } catch {
        if (mounted) {
          setUser(null);
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
      };

      if (data.requires2FA || data.requires2FASetup) {
        throw new Error(
          data.requires2FASetup
            ? 'Sua conta exige configuracao de 2FA antes do login.'
            : 'Sua conta exige validacao 2FA para continuar.',
        );
      }

      const authenticatedUser = data.user
        ? data.user
        : (await api.get<AuthMeResponse>('/auth/me')).data?.user;

      if (!authenticatedUser) {
        throw new Error('Resposta de login invalida do servidor.');
      }

      if (!data.accessToken) {
        throw new Error('Access token ausente na resposta de login.');
      }

      storage.setItem('token', data.accessToken);
      storage.setItem('user', JSON.stringify(authenticatedUser));
      storage.setItem('companyId', authenticatedUser.company_id);

      setUser(authenticatedUser);
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

    storage.removeItem('token');
    storage.removeItem('user');
    storage.removeItem('companyId');
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
