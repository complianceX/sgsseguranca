'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle, CheckCircle } from 'lucide-react';
import api from '@/lib/api';
import axios from 'axios';
import styles from '../auth.module.css';

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

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error) setError('');
    setCpf(formatCpf(e.target.value));
  };

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
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <Image
            src="/logo-sgs.svg"
            alt="SGS - Sistema de Gestão de Segurança"
            width={72}
            height={102}
            priority
            className={styles.brandLogo}
          />
          <p className={styles.brandCaption}>Sistema de Gestão de Segurança</p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className={styles.successBanner} role="status">
              <CheckCircle size={32} className={styles.successIcon} aria-hidden="true" />
              <p className={styles.successTitle}>Solicitação enviada</p>
              <p className={styles.successText}>
                Se o CPF estiver cadastrado, você receberá um e-mail com o link para redefinir sua senha. Verifique também sua caixa de spam.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className={styles.submitButton}
            >
              Voltar para o login
            </button>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <h1 className={styles.title}>Recuperação de senha</h1>
              <p className={styles.subtitle}>Informe seu CPF para receber as instruções por e-mail</p>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="cpf" className={styles.label}>CPF</label>
                <input
                  id="cpf"
                  type="text"
                  inputMode="numeric"
                  value={cpf}
                  onChange={handleCpfChange}
                  className={styles.input}
                  placeholder="000.000.000-00"
                  required
                  autoFocus
                  aria-label="CPF do usuário"
                />
              </div>

              {error && (
                <div className={styles.errorBanner} role="alert" aria-live="assertive">
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={styles.submitButton}
              >
                {loading ? (
                  <span className={styles.loadingState}>
                    <span className={styles.loadingDot} />
                    Enviando...
                  </span>
                ) : (
                  'Enviar instruções'
                )}
              </button>

              <button
                type="button"
                onClick={() => router.push('/login')}
                className={styles.backLink}
              >
                Voltar para o login
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
