'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import axios from 'axios';

const AUTH_SHELL_STYLE = {
  background: [
    'radial-gradient(circle at top left, rgba(37, 99, 235, 0.24), transparent 24%)',
    'radial-gradient(circle at bottom right, rgba(15, 118, 110, 0.18), transparent 30%)',
    'linear-gradient(135deg, #0B1220 0%, #111827 46%, #0F1E35 100%)',
  ].join(', '),
};

const authCardClass =
  'w-full max-w-md rounded-[28px] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-overlay)] p-8 shadow-[var(--ds-shadow-lg)] backdrop-blur-xl';

const authInputClass =
  'w-full rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-bg-subtle)] p-3 text-[var(--ds-color-text-primary)] transition-all focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-4 focus:ring-[var(--ds-color-focus-ring)]';

const primaryButtonClass =
  'w-full rounded-xl bg-[image:var(--ds-gradient-brand)] p-3 font-semibold text-white shadow-[var(--ds-shadow-md)] transition-all hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
    return (
      <div className={`${authCardClass} text-center`}>
        <p className="font-semibold text-[var(--ds-color-danger)]">Link inválido ou expirado.</p>
        <button
          type="button"
          onClick={() => router.push('/forgot-password')}
          className={`mt-4 ${primaryButtonClass}`}
        >
          Solicitar novo link
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setDone(true);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        if (typeof msg === 'string') {
          setError(msg);
        } else if (err.response?.status === 429) {
          setError('Muitas tentativas. Aguarde alguns minutos.');
        } else {
          setError('Ocorreu um erro. Tente novamente.');
        }
      } else {
        setError('Ocorreu um erro inesperado.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className={`${authCardClass} space-y-4`}>
        <div className="rounded-2xl border border-[color:var(--ds-color-success)]/20 bg-[color:var(--ds-color-success)]/10 p-4 text-center text-sm">
          <svg className="mx-auto mb-2 h-8 w-8 text-[var(--ds-color-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="font-semibold text-[var(--ds-color-text-primary)]">Senha redefinida com sucesso!</p>
          <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
            Você já pode fazer login com a nova senha.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/login')}
          className={primaryButtonClass}
        >
          Ir para o login
        </button>
      </div>
    );
  }

  return (
    <div className={authCardClass}>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[image:var(--ds-gradient-brand)] text-xl font-bold text-white shadow-[var(--ds-shadow-sm)]">
          G
        </div>
        <h1 className="text-xl font-bold text-[var(--ds-color-text-primary)]">Nova Senha</h1>
        <p className="mt-1 text-sm text-[var(--ds-color-text-muted)]">
          Defina uma nova senha para sua conta
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="newPassword" className="mb-2 block text-sm font-semibold text-[var(--ds-color-text-secondary)]">
            Nova senha
          </label>
          <div className="relative">
            <input
              id="newPassword"
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={`${authInputClass} pr-12`}
              placeholder="••••••••"
              required
              minLength={8}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ds-color-text-muted)] transition-colors hover:text-[var(--ds-color-text-secondary)]"
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
          <p className="mt-1.5 text-xs text-[var(--ds-color-text-muted)]">
            Mínimo 8 caracteres, incluindo letras maiúsculas, minúsculas e números.
          </p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-2 block text-sm font-semibold text-[var(--ds-color-text-secondary)]">
            Confirmar nova senha
          </label>
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={authInputClass}
            placeholder="••••••••"
            required
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-[color:var(--ds-color-danger)]/20 bg-[color:var(--ds-color-danger)]/10 p-3 text-sm text-[var(--ds-color-danger)]">
            <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={primaryButtonClass}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Salvando...
            </span>
          ) : (
            'Redefinir senha'
          )}
        </button>
      </form>
    </div>
  );
}

function Fallback() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={AUTH_SHELL_STYLE}>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-[var(--ds-color-action-primary)]" />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={AUTH_SHELL_STYLE}>
      <Suspense fallback={<Fallback />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
