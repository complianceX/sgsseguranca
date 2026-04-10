'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';
import axios from 'axios';
import styles from '../auth.module.css';

function getPasswordStrength(password: string): 'weak' | 'medium' | 'strong' | null {
  if (!password) return null;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const score = [password.length >= 8, hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
  if (score <= 2) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
}

const strengthLabel: Record<'weak' | 'medium' | 'strong', string> = {
  weak: 'Fraca',
  medium: 'Média',
  strong: 'Forte',
};

function sanitizeBackendMessage(msg: unknown): string {
  if (typeof msg !== 'string' || !msg.trim()) return 'Ocorreu um erro. Tente novamente.';
  // Rejeita mensagens técnicas em inglês ou stacktraces
  if (/[a-z]{3,}/.test(msg) && !/[àáâãéêíóôõúüç]/i.test(msg) && msg.length > 60) {
    return 'Ocorreu um erro. Tente novamente.';
  }
  const known: Record<string, string> = {
    'password must be longer than or equal to 8 characters': 'A senha deve ter no mínimo 8 caracteres.',
    'password is too weak': 'A senha é muito fraca. Use letras maiúsculas, minúsculas e números.',
    'token expired': 'O link expirou. Solicite um novo link de redefinição.',
    'invalid token': 'Link inválido. Solicite um novo link de redefinição.',
  };
  const lower = msg.toLowerCase();
  for (const [key, value] of Object.entries(known)) {
    if (lower.includes(key)) return value;
  }
  return msg;
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const strength = getPasswordStrength(newPassword);

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.invalidLink}>
          <p className={styles.invalidLinkText}>Link inválido ou expirado.</p>
          <button
            type="button"
            onClick={() => router.push('/forgot-password')}
            className={styles.submitButton}
          >
            Solicitar novo link
          </button>
        </div>
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

    if (newPassword.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setDone(true);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        if (err.response?.status === 429) {
          setError('Muitas tentativas. Aguarde alguns minutos.');
        } else {
          setError(sanitizeBackendMessage(Array.isArray(msg) ? msg[0] : msg));
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
      <div className={styles.card}>
        <div className={styles.successBanner} role="status">
          <CheckCircle size={32} className={styles.successIcon} aria-hidden="true" />
          <p className={styles.successTitle}>Senha redefinida com sucesso</p>
          <p className={styles.successText}>Você já pode fazer login com a nova senha.</p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/login')}
          className={styles.submitButton}
          style={{ marginTop: '16px' }}
        >
          Ir para o login
        </button>
      </div>
    );
  }

  return (
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

      <div className={styles.header}>
        <h1 className={styles.title}>Nova senha</h1>
        <p className={styles.subtitle}>Defina uma nova senha para sua conta</p>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="newPassword" className={styles.label}>Nova senha</label>
          <div className={styles.passwordWrap}>
            <input
              id="newPassword"
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => { if (error) setError(''); setNewPassword(e.target.value); }}
              className={`${styles.input} ${styles.inputWithToggle}`}
              placeholder="••••••••"
              required
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className={styles.passwordToggle}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {strength && (
            <>
              <div className={styles.passwordStrength} aria-hidden="true">
                {(['weak', 'medium', 'strong'] as const).map((level, i) => {
                  const levels = { weak: 1, medium: 2, strong: 3 };
                  const filled = levels[strength] > i;
                  return (
                    <div
                      key={level}
                      className={styles.strengthBar}
                      data-filled={String(filled)}
                      data-level={strength}
                    />
                  );
                })}
              </div>
              <p className={styles.hint}>
                Força: {strengthLabel[strength]} — mínimo 8 caracteres com letras e números.
              </p>
            </>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="confirmPassword" className={styles.label}>Confirmar nova senha</label>
          <div className={styles.passwordWrap}>
            <input
              id="confirmPassword"
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => { if (error) setError(''); setConfirmPassword(e.target.value); }}
              className={`${styles.input} ${styles.inputWithToggle}`}
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className={styles.passwordToggle}
              aria-label={showConfirm ? 'Ocultar confirmação' : 'Mostrar confirmação'}
              aria-pressed={showConfirm}
            >
              {showConfirm ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
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
              Salvando...
            </span>
          ) : (
            'Redefinir senha'
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
    </div>
  );
}

function Fallback() {
  return (
    <div className={styles.page}>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--ds-color-border-subtle)] border-t-[var(--ds-color-action-primary)]" />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<Fallback />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
