'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import api from '@/lib/api';
import { tokenStore } from '@/lib/tokenStore';
import { forcePasswordChangeStore } from '@/lib/forcePasswordChangeStore';
import styles from '../auth.module.css';

function getPasswordStrength(password: string): 'weak' | 'medium' | 'strong' | null {
  if (!password) return null;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const score = [password.length >= 10, hasUpper, hasLower, hasNumber, hasSpecial].filter(
    Boolean,
  ).length;
  if (score <= 2) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
}

const strengthLabel: Record<'weak' | 'medium' | 'strong', string> = {
  weak: 'Fraca',
  medium: 'Média',
  strong: 'Forte',
};

function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (Array.isArray(msg)) return msg[0] || 'Ocorreu um erro. Tente novamente.';
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return 'Ocorreu um erro. Tente novamente.';
}

export default function TrocarSenhaInicialPage() {
  const router = useRouter();
  const [nome, setNome] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = getPasswordStrength(newPassword);

  useEffect(() => {
    const pending = forcePasswordChangeStore.get();
    if (!pending) {
      router.replace('/login');
      return;
    }
    setNome(pending.nome);
    setReady(true);
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      tokenStore.clear();
      forcePasswordChangeStore.clear();
      toast.success('Senha alterada com sucesso! Faça login com a nova senha.');
      router.push('/login');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError('Muitas tentativas. Aguarde alguns minutos.');
      } else {
        setError(extractErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className={styles.page}>
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--ds-color-border-subtle)] border-t-[var(--ds-color-action-primary)]" />
      </div>
    );
  }

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

        <div className={styles.header}>
          <h1 className={styles.title}>Troque sua senha</h1>
          <p className={styles.subtitle}>
            {nome ? `Olá, ${nome}. ` : ''}
            Por segurança, defina uma nova senha antes de continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="currentPassword" className={styles.label}>
              Senha temporária recebida por e-mail
            </label>
            <div className={styles.passwordWrap}>
              <input
                id="currentPassword"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => {
                  if (error) setError('');
                  setCurrentPassword(e.target.value);
                }}
                className={`${styles.input} ${styles.inputWithToggle}`}
                placeholder="••••••••"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className={styles.passwordToggle}
                aria-label={showCurrent ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showCurrent}
              >
                {showCurrent ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="newPassword" className={styles.label}>
              Nova senha
            </label>
            <div className={styles.passwordWrap}>
              <input
                id="newPassword"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => {
                  if (error) setError('');
                  setNewPassword(e.target.value);
                }}
                className={`${styles.input} ${styles.inputWithToggle}`}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className={styles.passwordToggle}
                aria-label={showNew ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showNew}
              >
                {showNew ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
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
                  Força: {strengthLabel[strength]} — mínimo 10 caracteres, com maiúscula, minúscula,
                  número e símbolo.
                </p>
              </>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="confirmPassword" className={styles.label}>
              Confirmar nova senha
            </label>
            <input
              id="confirmPassword"
              type={showNew ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => {
                if (error) setError('');
                setConfirmPassword(e.target.value);
              }}
              className={styles.input}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className={styles.errorBanner} role="alert" aria-live="assertive">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading} className={styles.submitButton}>
            {loading ? (
              <span className={styles.loadingState}>
                <span className={styles.loadingDot} />
                Salvando...
              </span>
            ) : (
              'Trocar senha e continuar'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
