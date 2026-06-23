'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';
import axios from 'axios';
import styles from '../../auth.module.css';

const RESET_ATTEMPTS_KEY = 'reset_password_attempts';
const MAX_RESET_ATTEMPTS = 5;
const RESET_WINDOW_MS = 15 * 60 * 1000;

function getResetAttempts(): { count: number; windowStart: number } {
  if (typeof window === 'undefined') return { count: 0, windowStart: 0 };
  try {
    const stored = localStorage.getItem(RESET_ATTEMPTS_KEY);
    if (!stored) return { count: 0, windowStart: 0 };
    const data = JSON.parse(stored);
    return { count: data.count || 0, windowStart: data.windowStart || 0 };
  } catch {
    return { count: 0, windowStart: 0 };
  }
}

function setResetAttempt(): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const current = getResetAttempts();
    const windowStart = now - current.windowStart > RESET_WINDOW_MS ? now : current.windowStart;
    const count = now - windowStart > RESET_WINDOW_MS ? 1 : current.count + 1;
    localStorage.setItem(RESET_ATTEMPTS_KEY, JSON.stringify({ count, windowStart }));
  } catch {}
}

function clearResetAttempts(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RESET_ATTEMPTS_KEY);
  } catch {}
}

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

function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [attemptError, setAttemptError] = useState<string | null>(null);

  const strength = getPasswordStrength(newPassword);

  useEffect(() => {
    const attempts = getResetAttempts();
    const now = Date.now();
    if (attempts.count >= MAX_RESET_ATTEMPTS && now - attempts.windowStart < RESET_WINDOW_MS) {
      const remainingMs = RESET_WINDOW_MS - (now - attempts.windowStart);
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      setAttemptError(`Muitas tentativas. Aguarde ${remainingMinutes} minutos.`);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (attemptError) {
      setError(attemptError);
      return;
    }

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
      clearResetAttempts();
      setDone(true);
    } catch (err) {
      setResetAttempt();
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
      
      const attempts = getResetAttempts();
      const remaining = MAX_RESET_ATTEMPTS - attempts.count;
      if (remaining <= 0) {
        setAttemptError('Muitas tentativas. Aguarde 15 minutos.');
      } else if (remaining <= 2) {
        setAttemptError(`Restam ${remaining} tentativas antes de bloqueio temporário.`);
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

      {attemptError ? (
        <div className={styles.errorBanner} role="alert" aria-live="assertive">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{attemptError}</span>
        </div>
      ) : null}

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
              autoComplete="new-password"
              aria-describedby={error ? 'form-error' : undefined}
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
              autoComplete="new-password"
              aria-describedby={error ? 'form-error' : undefined}
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
          <div id="form-error" className={styles.errorBanner} role="alert" aria-live="assertive">
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

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams();
  const token = typeof params.token === 'string' ? params.token.trim() : '';

  if (!token) {
    return (
      <main id="main-content" className={styles.page}>
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
      </main>
    );
  }

  return (
    <main id="main-content" className={styles.page}>
      <ResetPasswordForm token={token} />
    </main>
  );
}
