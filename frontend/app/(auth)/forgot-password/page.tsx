'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  'w-full max-w-[27rem] rounded-[24px] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-overlay)] p-6 shadow-[var(--ds-shadow-lg)] backdrop-blur-xl';

const authInputClass =
  'w-full rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-bg-subtle)] px-3 py-2.5 text-[13px] text-[var(--ds-color-text-primary)] transition-all focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-4 focus:ring-[var(--ds-color-focus-ring)]';

const primaryButtonClass =
  'w-full rounded-xl bg-[image:var(--ds-gradient-brand)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[var(--ds-shadow-md)] transition-all hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50';

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { cpf: cpf.replace(/\D/g, '') });
      setSent(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      } else {
        setError('Ocorreu um erro. Tente novamente mais tarde.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-5" style={AUTH_SHELL_STYLE}>
      <div className={authCardClass}>
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[image:var(--ds-gradient-brand)] text-lg font-bold text-white shadow-[var(--ds-shadow-sm)]">
            G
          </div>
          <h1 className="text-lg font-bold text-[var(--ds-color-text-primary)]">Recuperação de Senha</h1>
          <p className="mt-1 text-[13px] text-[var(--ds-color-text-muted)]">
            Informe seu CPF para receber as instruções por e-mail
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[color:var(--ds-color-success)]/20 bg-[color:var(--ds-color-success)]/10 p-3.5 text-center">
              <svg className="mx-auto mb-2 h-8 w-8 text-[var(--ds-color-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-semibold text-[var(--ds-color-text-primary)]">Solicitação enviada!</p>
              <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                Se o CPF estiver cadastrado, você receberá um e-mail com o link para redefinir sua senha. Verifique também sua caixa de spam.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className={primaryButtonClass}
            >
              Voltar para o login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="cpf" className="mb-2 block text-[13px] font-semibold text-[var(--ds-color-text-secondary)]">
                CPF
              </label>
              <input
                id="cpf"
                type="text"
                inputMode="numeric"
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                className={authInputClass}
                placeholder="000.000.000-00"
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-[color:var(--ds-color-danger)]/20 bg-[color:var(--ds-color-danger)]/10 p-3 text-[13px] text-[var(--ds-color-danger)]">
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
                  Enviando...
                </span>
              ) : (
                'Enviar instruções'
              )}
            </button>

            <button
              type="button"
              onClick={() => router.push('/login')}
              className="w-full text-center text-[13px] text-[var(--ds-color-text-muted)] transition-colors hover:text-[var(--ds-color-text-secondary)]"
            >
              Voltar para o login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
