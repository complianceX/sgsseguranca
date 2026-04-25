'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { useSearchParams } from 'next/navigation';
import { isAxiosError } from 'axios';
import {
  AlertCircle,
  BadgeCheck,
  Eye,
  EyeOff,
  Lock,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import styles from './login.module.css';
import { authService } from '@/services/authService';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

type LoginPageClientProps = {
  turnstileSiteKey: string;
  nonce?: string;
  supportHref: string;
};

function LoginPageContent({ turnstileSiteKey, nonce, supportHref }: LoginPageClientProps) {
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('expired') === '1';

  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaStage, setMfaStage] = useState<'none' | 'challenge' | 'bootstrap'>('none');
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaManualEntryKey, setMfaManualEntryKey] = useState('');
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([]);
  const [mfaOtpAuthUrl, setMfaOtpAuthUrl] = useState('');

  const { login, finalizeLogin } = useAuth();
  const { theme } = useTheme();
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  const turnstileEnabled = turnstileSiteKey.length > 0;
  const shouldRenderTurnstile = turnstileEnabled && mfaStage === 'none';
  const currentTurnstileTheme = theme === 'dark' ? 'dark' : 'light';
  const turnstileContainerRef = React.useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (
      !shouldRenderTurnstile ||
      !turnstileScriptReady ||
      !turnstileContainerRef.current ||
      !window.turnstile ||
      turnstileWidgetIdRef.current
    ) {
      return;
    }

    turnstileWidgetIdRef.current = window.turnstile.render(
      turnstileContainerRef.current,
      {
        sitekey: turnstileSiteKey,
        action: 'login',
        theme: currentTurnstileTheme,
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      },
    );

    return () => {
      if (turnstileWidgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
      }
      turnstileWidgetIdRef.current = null;
      setTurnstileToken('');
    };
  }, [currentTurnstileTheme, shouldRenderTurnstile, turnstileScriptReady, turnstileSiteKey]);

  const formatCpf = (value: string) => {
    let v = value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{3})/, '$1.$2');
    return v;
  };

  const clearError = () => {
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!cpf || !password) {
      setError('Preencha todos os campos.');
      return;
    }

    setLoading(true);
    const cleanCpf = cpf.replace(/\D/g, '');

    try {
      if (mfaStage === 'challenge') {
        const response = await authService.verifyLoginMfa(mfaChallengeToken, mfaCode);
        finalizeLogin(response);
        return;
      }

      if (mfaStage === 'bootstrap') {
        const response = await authService.activateBootstrapMfa(
          mfaChallengeToken,
          mfaCode,
        );
        finalizeLogin(response);
        return;
      }

      const result = await login(cleanCpf, password, turnstileToken || undefined);
      if ('mfaRequired' in result) {
        setMfaStage('challenge');
        setMfaChallengeToken(result.challengeToken);
        return;
      }

      if ('mfaEnrollRequired' in result) {
        setMfaStage('bootstrap');
        setMfaChallengeToken(result.challengeToken);
        setMfaOtpAuthUrl(result.otpAuthUrl || '');
        setMfaManualEntryKey(result.manualEntryKey || '');
        setMfaRecoveryCodes(Array.isArray(result.recoveryCodes) ? result.recoveryCodes : []);
        return;
      }
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401) {
          setError('CPF, senha ou código MFA inválido.');
        } else if (status === 429) {
          setError('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
        } else if (status === 503) {
          setError('Serviço temporariamente indisponível. Tente novamente em instantes.');
        } else {
          setError('Erro ao tentar entrar. Tente novamente.');
        }
      } else {
        setError('Erro ao tentar entrar. Tente novamente.');
      }

      if (turnstileWidgetIdRef.current && window.turnstile?.reset) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      }
      setTurnstileToken('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {turnstileEnabled && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          nonce={nonce}
          strategy="afterInteractive"
          onLoad={() => setTurnstileScriptReady(true)}
        />
      )}

      <main className={styles.shell}>
        <section className={styles.brandBlock}>
          <div className={styles.brandRow}>
            <div className={styles.brandCopy}>
              <span className={styles.brandPrefix}>Software</span>
              <span className={styles.brandProduct}>SGS</span>
            </div>
            <span className={styles.brandIcon}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-sgs.svg"
                alt="SGS - Sistema de Gestão de Segurança"
                width={72}
                height={102}
                className={styles.brandLogo}
              />
            </span>
          </div>
        </section>

        <section className={styles.formSection}>
          <header className={styles.header}>
            <h1 className={styles.title}>Informe seus dados abaixo:</h1>
          </header>

          {sessionExpired ? (
            <div className={`${styles.noticeBanner} ${styles.infoBanner}`} role="status">
              <Shield size={16} aria-hidden="true" />
              <span>Sua sessão expirou. Faça login novamente para retomar o trabalho.</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className={styles.loginForm}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="cpf">
                CPF
              </label>
              <div className={styles.inputWrap}>
                <UserIcon size={18} className={styles.inputIcon} />
                <input
                  id="cpf"
                  type="text"
                  inputMode="numeric"
                  autoComplete="username"
                  autoFocus
                  className={styles.formInput}
                  placeholder="Informe seu CPF"
                  value={cpf}
                  onChange={(e) => {
                    clearError();
                    setCpf(formatCpf(e.target.value));
                  }}
                  disabled={loading}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="senha">
                Senha
              </label>
              <div className={styles.inputWrap}>
                <Lock size={18} className={styles.inputIcon} />
                <input
                  id="senha"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={styles.formInput}
                  placeholder="Informe sua senha"
                  value={password}
                  onChange={(e) => {
                    clearError();
                    setPassword(e.target.value);
                  }}
                  disabled={loading}
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className={styles.metaRow}>
              <Link href="/forgot-password" className={styles.forgotLink}>
                Esqueci a senha
              </Link>
            </div>

            {mfaStage === 'bootstrap' ? (
              <div className={`${styles.noticeBanner} ${styles.infoBanner}`} role="status">
                <Shield size={16} aria-hidden="true" />
                <span>
                  Primeiro acesso com MFA obrigatório. Cadastre seu autenticador e informe
                  o código de 6 dígitos para concluir.
                </span>
              </div>
            ) : null}

            {mfaStage === 'bootstrap' && mfaManualEntryKey ? (
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="mfa-manual-key">
                  Chave manual (backup)
                </label>
                <input
                  id="mfa-manual-key"
                  type="text"
                  className={`${styles.formInput} ${styles.readOnlyField}`}
                  value={mfaManualEntryKey}
                  readOnly
                  aria-readonly="true"
                />
              </div>
            ) : null}

            {mfaStage === 'bootstrap' && mfaRecoveryCodes.length > 0 ? (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Códigos de recuperação</label>
                <textarea
                  className={`${styles.formInput} ${styles.recoveryField}`}
                  value={mfaRecoveryCodes.join('\n')}
                  readOnly
                  aria-readonly="true"
                  rows={Math.min(Math.max(mfaRecoveryCodes.length, 3), 8)}
                />
              </div>
            ) : null}

            {mfaStage === 'bootstrap' && mfaOtpAuthUrl ? (
              <div className={styles.metaRow}>
                <a href={mfaOtpAuthUrl} className={styles.forgotLink}>
                  Abrir cadastro no app autenticador
                </a>
              </div>
            ) : null}

            {(mfaStage === 'challenge' || mfaStage === 'bootstrap') && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="mfa">
                  Código MFA
                </label>
                <div className={styles.inputWrap}>
                  <Shield size={18} className={styles.inputIcon} />
                  <input
                    id="mfa"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className={styles.formInput}
                    placeholder="000000"
                    value={mfaCode}
                    onChange={(e) => {
                      clearError();
                      setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    }}
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            {error ? (
              <div
                className={`${styles.noticeBanner} ${styles.errorBanner}`}
                role="alert"
                aria-live="assertive"
              >
                <AlertCircle size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            {shouldRenderTurnstile ? (
              <div className={styles.turnstileWrap}>
                <div ref={turnstileContainerRef} />
              </div>
            ) : null}

            <button
              className={styles.btnSubmit}
              type="submit"
              disabled={loading || (shouldRenderTurnstile && !turnstileToken)}
            >
              {loading
                ? 'Entrando...'
                : mfaStage === 'bootstrap'
                  ? 'Ativar MFA e entrar'
                  : mfaStage === 'challenge'
                    ? 'Confirmar acesso'
                    : 'Acessar'}
            </button>
          </form>

          <div className={styles.supportCta}>
            <a href={supportHref} className={styles.supportLink}>
              Precisa de ajuda para acessar?
            </a>
          </div>

          <div className={styles.securityNote}>
            <BadgeCheck size={14} aria-hidden="true" />
            <span>Acesso protegido e rastreável.</span>
          </div>

          <div className={styles.footerLinks}>
            <Link href="/termos" prefetch={false} className={styles.footerLink}>
              Termos de Uso
            </Link>
            <Link href="/privacidade" prefetch={false} className={styles.footerLink}>
              Política de Privacidade
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function LoginFallback() {
  return <div className={styles.fallback} />;
}

export default function LoginPageClient(props: LoginPageClientProps) {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageContent {...props} />
    </Suspense>
  );
}
