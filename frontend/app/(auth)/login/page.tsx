'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import axios from 'axios';

function getLoginErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Erro ao tentar fazer login. Tente novamente.';
  }

  const status = error.response?.status;
  const data = error.response?.data as { message?: string | string[] } | undefined;

  if (!error.response) {
    const apiBase = error.config?.baseURL || 'http://localhost:3011';
    return `Não foi possível conectar ao servidor (${apiBase}). Verifique se o backend está rodando.`;
  }

  if (status === 401 || status === 403) {
    return 'CPF ou senha inválidos.';
  }

  if (status === 429) {
    return 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.';
  }

  if (Array.isArray(data?.message)) {
    return data.message[0] || 'Falha na autenticação.';
  }

  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message;
  }

  return 'Falha na autenticação. Tente novamente.';
}

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

const REMEMBER_CPF_KEY = 'compliance_x_remembered_cpf';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('expired') === '1';

  const savedCpf = typeof window !== 'undefined' ? localStorage.getItem(REMEMBER_CPF_KEY) ?? '' : '';

  const [cpf, setCpf] = useState(savedCpf);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberCpf, setRememberCpf] = useState(!!savedCpf);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  const cpfRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { login } = useAuth();

  useEffect(() => {
    // Auto-focus: se já tem CPF salvo, foca na senha; senão, foca no CPF
    if (savedCpf && passwordRef.current) {
      passwordRef.current.focus();
    } else if (cpfRef.current) {
      cpfRef.current.focus();
    }
  }, [savedCpf]);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCpf(e.target.value));
  };

  const handlePasswordKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(e.getModifierState('CapsLock'));
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const cleanCpf = cpf.replace(/\D/g, '');

    try {
      await login(cleanCpf, password);
      if (rememberCpf) {
        localStorage.setItem(REMEMBER_CPF_KEY, cpf);
      } else {
        localStorage.removeItem(REMEMBER_CPF_KEY);
      }
    } catch (err: unknown) {
      console.error('Erro no formulário de login:', err);
      setError(getLoginErrorMessage(err));
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-[#0F172A] to-[#1E3A5F]">
      {/* Lado esquerdo — branding (só desktop) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 text-white">
        <div className="max-w-md space-y-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB] text-lg font-bold">
              G
            </div>
            <span className="text-2xl font-bold tracking-tight">COMPLIANCE X</span>
          </div>

          <div>
            <h1 className="text-4xl font-bold leading-tight">
              Gestão de Segurança do Trabalho
            </h1>
            <p className="mt-4 text-lg text-blue-200">
              Controle treinamentos, exames médicos, EPIs, laudos e conformidades em um único sistema.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Normas NR cobertas', value: '35+' },
              { label: 'Módulos ativos', value: '18+' },
              { label: 'Alertas automáticos', value: '24/7' },
              { label: 'Multi-empresa', value: '100%' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-blue-200">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-6 text-sm text-blue-300">
            <div className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              SSL/TLS
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Dados criptografados
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Multi-tenant
            </div>
          </div>
        </div>
      </div>

      {/* Lado direito — formulário */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div
          className={`w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl transition-all ${
            shake ? 'login-shake' : ''
          }`}
        >
          {/* Logo */}
          <div className="mb-6 flex justify-center lg:hidden">
            <Image
              src="/logo-compliance-x.svg"
              alt="Compliance X Logo"
              width={180}
              height={54}
              priority
            />
          </div>
          <div className="mb-2 hidden lg:flex justify-center">
            <Image
              src="/logo-compliance-x.svg"
              alt="Compliance X Logo"
              width={160}
              height={48}
              priority
            />
          </div>

          <h2 className="mb-1 text-center text-xl font-bold text-gray-900">Bem-vindo de volta</h2>
          <p className="mb-6 text-center text-sm text-gray-500">
            Sistema de Gestão de Segurança do Trabalho
          </p>

          {/* Banner de sessão expirada */}
          {sessionExpired && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Sua sessão expirou. Faça login novamente para continuar.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* CPF */}
            <div>
              <label htmlFor="cpf" className="mb-2 block text-sm font-semibold text-gray-700">
                CPF
              </label>
              <input
                id="cpf"
                ref={cpfRef}
                type="text"
                inputMode="numeric"
                value={cpf}
                onChange={handleCpfChange}
                autoComplete="username"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition"
                placeholder="000.000.000-00"
                required
                aria-label="CPF do usuário"
              />
            </div>

            {/* Senha */}
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-gray-700">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={handlePasswordKeyEvent}
                  onKeyDown={handlePasswordKeyEvent}
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 p-3 pr-12 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition"
                  placeholder="••••••••••"
                  required
                  aria-label="Senha do usuário"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Aviso de Caps Lock */}
              {capsLockOn && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-600">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  Caps Lock ativado
                </p>
              )}
            </div>

            {/* Lembrar CPF + Esqueceu a senha */}
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 select-none">
                <input
                  type="checkbox"
                  checked={rememberCpf}
                  onChange={(e) => setRememberCpf(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Lembrar CPF
              </label>
              <button
                type="button"
                onClick={() => alert('Entre em contato com o administrador do sistema para redefinir sua senha.')}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
              >
                Esqueceu a senha?
              </button>
            </div>

            {/* Erro */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 p-3 font-semibold text-white shadow-lg transition hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Entrando...
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-gray-400">
            <p>© 2026 Compliance X · Todos os direitos reservados</p>
            <p className="mt-1">Versão 2.0.0</p>
          </div>
        </div>
      </div>

      {/* Keyframe de shake via style tag */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-6px); }
          30% { transform: translateX(6px); }
          45% { transform: translateX(-4px); }
          60% { transform: translateX(4px); }
          75% { transform: translateX(-2px); }
          90% { transform: translateX(2px); }
        }
        .login-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  );
}
