'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import axios from 'axios';

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0F172A] to-[#1E3A5F] p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
            G
          </div>
          <h1 className="text-xl font-bold text-gray-900">Recuperação de Senha</h1>
          <p className="mt-1 text-sm text-gray-500">
            Informe seu CPF para receber as instruções por e-mail
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center text-sm text-green-800">
              <svg className="mx-auto mb-2 h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-semibold">Solicitação enviada!</p>
              <p className="mt-1 text-xs text-green-700">
                Se o CPF estiver cadastrado, você receberá um e-mail com o link para redefinir sua senha. Verifique também sua caixa de spam.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Voltar para o login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="cpf" className="mb-2 block text-sm font-semibold text-gray-700">
                CPF
              </label>
              <input
                id="cpf"
                type="text"
                inputMode="numeric"
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition"
                placeholder="000.000.000-00"
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 p-3 font-semibold text-white shadow-lg transition hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Voltar para o login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
