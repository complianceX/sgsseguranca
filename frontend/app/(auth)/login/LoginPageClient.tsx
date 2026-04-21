'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { useSearchParams } from 'next/navigation';
import { isAxiosError } from 'axios';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Shield,
  ShieldCheck,
  Users,
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
};

function LoginPageContent({ turnstileSiteKey, nonce }: LoginPageClientProps) {
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('expired') === '1';

  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaStage, setMfaStage] = useState<'none' | 'challenge'>('none');
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');

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

      const result = await login(cleanCpf, password, turnstileToken || undefined);
      if ('mfaRequired' in result) {
        setMfaStage('challenge');
        setMfaChallengeToken(result.challengeToken);
        setLoading(false);
        return;
      }
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 401) {
        setError('CPF ou senha inválidos.');
      } else {
        setError('Erro ao tentar entrar. Tente novamente.');
      }
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

      <div className={styles.left}>
        <div className={styles.leftBrand}>
          <Image
            src="/logo-sgs.svg"
            alt="SGS - Sistema de Gestão de Segurança"
            width={64}
            height={90}
            className={styles.brandLogo}
          />
          <div className={styles.brandBlock}>
            <div className={styles.brandName}>SGS</div>
            <div className={styles.brandSub}>Sistema de Gestão de Segurança</div>
          </div>
        </div>

        <div className={styles.leftHero}>
          <div className={styles.leftBadge}>Plataforma SST enterprise</div>
          <h1 className={styles.heroTitle}>
            <span className={styles.heroLine}>Proteja quem</span>
            <span className={styles.heroLine}>mantém sua</span>
            <span className={styles.heroLine}>operação em pé.</span>
          </h1>
          <p className={styles.heroDesc}>
            Governança de SST para obras, plantas e operações críticas com execução
            limpa, leitura instantânea de risco e conformidade pronta para auditoria.
          </p>

          <div className={styles.featureList}>
            <div className={styles.featureItem}>
              <CheckCircle2 size={18} className={styles.featureIcon} />
              <span>APRs, PTs, DDS e checklists em um fluxo operacional único</span>
            </div>
            <div className={styles.featureItem}>
              <Users size={18} className={styles.featureIcon} />
              <span>Isolamento por empresa com LGPD by design desde o login</span>
            </div>
            <div className={styles.featureItem}>
              <Shield size={18} className={styles.featureIcon} />
              <span>Rastreabilidade total para auditoria, liderança e campo</span>
            </div>
          </div>

          <div className={styles.signalRow}>
            <span className={styles.signalChip}>Multi-tenant</span>
            <span className={styles.signalChip}>LGPD</span>
            <span className={styles.signalChip}>Auditável</span>
          </div>
        </div>

        <div className={styles.leftFooter}>
          © 2026 SGS — Sistema de Gestão de Segurança
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.loginCard}>
          <div className={styles.cardEyebrow}>Acesso corporativo</div>

          <div className={styles.cardLogo}>
            <Image
              src="/logo-sgs.svg"
              alt="SGS - Sistema de Gestão de Segurança"
              width={52}
              height={74}
              className={styles.cardLogoImage}
            />
            <div className={styles.cardLogoCopy}>
              <div className={styles.cardLogoName}>SGS</div>
              <div className={styles.cardLogoSub}>Sistema de Gestão de Segurança</div>
            </div>
          </div>

          <h2 className={styles.cardTitle}>Acesse sua conta</h2>
          <p className={styles.cardSubtitle}>
            Entre com suas credenciais para continuar na operação com contexto,
            segurança e rastreabilidade.
          </p>

          {sessionExpired ? (
            <div className={`${styles.noticeBanner} ${styles.infoBanner}`} role="status">
              <Shield size={16} aria-hidden="true" />
              <span>Sua sessão expirou. Faça login novamente para retomar o trabalho.</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="cpf">CPF</label>
              <div className={styles.inputWrap}>
                <UserIcon size={18} className={styles.inputIcon} />
                <input
                  id="cpf"
                  type="text"
                  inputMode="numeric"
                  autoComplete="username"
                  autoFocus
                  className={styles.formInput}
                  placeholder="000.000.000-00"
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
              <label className={styles.formLabel} htmlFor="senha">Senha</label>
              <div className={styles.inputWrap}>
                <Lock size={18} className={styles.inputIcon} />
                <input
                  id="senha"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={styles.formInput}
                  placeholder="Sua senha"
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
              <div className={styles.rowForgot}>
                <Link href="/forgot-password" className={styles.forgotLink}>
                  Esqueceu a senha?
                </Link>
              </div>
            </div>

            {mfaStage === 'challenge' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="mfa">Código MFA</label>
                <div className={styles.inputWrap}>
                  <ShieldCheck size={18} className={styles.inputIcon} />
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
              {loading ? (
                'Entrando...'
              ) : (
                <>
                  <span>{mfaStage === 'challenge' ? 'Confirmar acesso' : 'Acessar plataforma'}</span>
                  <ArrowRight size={18} className={styles.btnArrow} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <div className={styles.securityBadge}>
            <Shield size={14} aria-hidden="true" />
            Ambiente protegido por SSL, tenant isolado e trilha auditável
          </div>

          <div className={styles.cardFooter}>
            <Link href="/suporte" className={styles.footerLink}>Suporte</Link>
            <Link href="/termos" className={styles.footerLink}>Termos</Link>
            <Link href="/privacidade" className={styles.footerLink}>Privacidade</Link>
          </div>
        </div>
      </div>
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
