'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSearchParams, useRouter as useNextRouter } from 'next/navigation';
import Image from 'next/image';
import Script from 'next/script';
import axios from 'axios';
import {
  AlertCircle,
  AlertTriangle,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import styles from './login.module.css';

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
};

async function isApiHealthy(apiBase?: string): Promise<boolean> {
  if (typeof window === 'undefined' || !apiBase?.trim()) {
    return false;
  }

  const normalizedBase = apiBase.trim().replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(
      `${normalizedBase}/health/public?ts=${Date.now()}`,
      {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      },
    );

    if (response.ok) {
      window.dispatchEvent(
        new CustomEvent('app:api-online', {
          detail: { baseURL: normalizedBase },
        }),
      );
      return true;
    }
  } catch {
    window.dispatchEvent(
      new CustomEvent('app:api-offline', {
        detail: { baseURL: normalizedBase },
      }),
    );
  } finally {
    window.clearTimeout(timeout);
  }

  return false;
}

async function getLoginErrorMessage(error: unknown): Promise<string> {
  if (!axios.isAxiosError(error)) {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return 'Erro ao tentar fazer login. Tente novamente.';
  }

  const status = error.response?.status;
  const data = error.response?.data as { message?: string | string[] } | undefined;

  if (!error.response) {
    const apiBase = error.config?.baseURL || 'http://localhost:3011';
    const apiHealthy = await isApiHealthy(apiBase);

    if (apiHealthy) {
      return `A API está online em ${apiBase}, mas esta aba perdeu a conexão. Recarregue a página e tente novamente.`;
    }

    return `Não foi possível conectar ao servidor (${apiBase}). Verifique se o backend está rodando.`;
  }

  if (status === 401) {
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

const REMEMBER_CPF_KEY = 'sgs_remembered_cpf';
const LEGACY_REMEMBER_CPF_KEYS = [
  'gst_remembered_cpf',
  'compliance_x_remembered_cpf',
];

function LoginPageContent({ turnstileSiteKey }: LoginPageClientProps) {
  const searchParams = useSearchParams();
  const router = useNextRouter();
  const sessionExpired = searchParams.get('expired') === '1';

  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberCpf, setRememberCpf] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileError, setTurnstileError] = useState('');
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);

  const cpfRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const { login } = useAuth();
  const turnstileEnabled = turnstileSiteKey.length > 0;

  useEffect(() => {
    const savedCpf =
      sessionStorage.getItem(REMEMBER_CPF_KEY) ??
      (() => {
        for (const legacyKey of LEGACY_REMEMBER_CPF_KEYS) {
          const sessionLegacy = sessionStorage.getItem(legacyKey);
          if (sessionLegacy) {
            sessionStorage.removeItem(legacyKey);
            return sessionLegacy;
          }

          const localLegacy = localStorage.getItem(legacyKey);
          if (localLegacy) {
            localStorage.removeItem(legacyKey);
            return localLegacy;
          }
        }
        return null;
      })() ??
      '';
    if (savedCpf) {
      setCpf(savedCpf);
      setRememberCpf(true);
      passwordRef.current?.focus();
      return;
    }
    cpfRef.current?.focus();
  }, []);

  useEffect(() => {
    if (
      !turnstileEnabled ||
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
        theme: 'auto',
        callback: (token: string) => {
          setTurnstileToken(token);
          setTurnstileError('');
        },
        'expired-callback': () => {
          setTurnstileToken('');
          setTurnstileError(
            'A verificação de segurança expirou. Confirme novamente para entrar.',
          );
        },
        'error-callback': () => {
          setTurnstileToken('');
          setTurnstileError(
            'Não foi possível carregar a proteção da Cloudflare agora.',
          );
        },
      },
    );

    return () => {
      if (turnstileWidgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
      }
      turnstileWidgetIdRef.current = null;
    };
  }, [turnstileEnabled, turnstileScriptReady, turnstileSiteKey]);

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

  const resetTurnstile = () => {
    setTurnstileToken('');
    if (turnstileWidgetIdRef.current && window.turnstile?.reset) {
      window.turnstile.reset(turnstileWidgetIdRef.current);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (turnstileEnabled && !turnstileToken) {
      setTurnstileError(
        'Confirme a verificação de segurança para continuar com o login.',
      );
      triggerShake();
      return;
    }

    setLoading(true);

    const cleanCpf = cpf.replace(/\D/g, '');

    try {
      await login(cleanCpf, password, turnstileToken || undefined);
      if (rememberCpf) {
        sessionStorage.setItem(REMEMBER_CPF_KEY, cpf);
      } else {
        sessionStorage.removeItem(REMEMBER_CPF_KEY);
      }
    } catch (err: unknown) {
      setError(await getLoginErrorMessage(err));
      if (turnstileEnabled) {
        resetTurnstile();
      }
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {turnstileEnabled && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setTurnstileScriptReady(true)}
          onError={() =>
            setTurnstileError(
              'Não foi possível carregar a proteção da Cloudflare agora.',
            )
          }
        />
      )}
      <div className={styles.backgroundGlowA} />
      <div className={styles.backgroundGlowB} />
      <div className={styles.backgroundGrid} />

      <main className={styles.layout}>
        <section className={styles.loginSection}>
          <div className={`${styles.loginCard} ${styles.fadeInUp} ${shake ? styles.shake : ''}`}>
            {turnstileEnabled && (
              <div
                className={styles.turnstileCornerBadge}
                title="Protegido por Cloudflare Turnstile"
                aria-label="Protegido por Cloudflare Turnstile"
              >
                <Cloud size={13} />
                <span>Cloudflare</span>
              </div>
            )}
            <div className={styles.mobileBrand}>
              <Image
                src="/logo-sgs.svg"
                alt="SGS - Sistema de Gestão de Segurança"
                width={104}
                height={147}
                priority
                className={styles.mobileBrandLogo}
              />
              <p className={styles.mobileBrandCaption}>Sistema de Gestão de Segurança</p>
            </div>

            <h1 className={styles.loginTitle}>Acesse sua conta</h1>
            <p className={styles.loginSubtitle}>
              Entre com seu CPF e senha para continuar no ambiente SGS.
            </p>

            {sessionExpired && (
              <div className={styles.warningBanner}>
                <AlertTriangle size={16} />
                <span>Sua sessão expirou. Faça login novamente para continuar.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="cpf" className={styles.label}>CPF</label>
                <input
                  id="cpf"
                  ref={cpfRef}
                  type="text"
                  inputMode="numeric"
                  value={cpf}
                  onChange={handleCpfChange}
                  autoComplete="username"
                  className={styles.inputField}
                  placeholder="000.000.000-00"
                  required
                  aria-label="CPF do usuário"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="password" className={styles.label}>Senha</label>
                <div className={styles.passwordWrap}>
                  <input
                    id="password"
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={handlePasswordKeyEvent}
                    onKeyDown={handlePasswordKeyEvent}
                    autoComplete="current-password"
                    className={styles.inputField}
                    placeholder="••••••••••"
                    required
                    aria-label="Senha do usuário"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className={styles.passwordToggle}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {capsLockOn && (
                  <p className={styles.capsWarning}>
                    <AlertTriangle size={14} />
                    Caps Lock ativado
                  </p>
                )}
              </div>

              <div className={styles.assistRow}>
                <label className={styles.rememberRow}>
                  <input
                    type="checkbox"
                    checked={rememberCpf}
                    onChange={(e) => setRememberCpf(e.target.checked)}
                  />
                  Lembrar CPF
                </label>
                <button
                  type="button"
                  onClick={() => router.push('/forgot-password')}
                  className={styles.forgotButton}
                >
                  Esqueceu a senha?
                </button>
              </div>

              {error && (
                <div className={styles.errorBanner}>
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {turnstileEnabled && (
                <>
                  <div
                    ref={turnstileContainerRef}
                    className={styles.turnstileMount}
                  />
                  {turnstileError && (
                    <p className={styles.turnstileErrorBanner}>
                      <AlertTriangle size={14} />
                      {turnstileError}
                    </p>
                  )}
                </>
              )}

              <button
                type="submit"
                disabled={
                  loading ||
                  (turnstileEnabled &&
                    (!turnstileScriptReady || !turnstileToken))
                }
                className={styles.submitButton}
              >
                {loading ? (
                  <span className={styles.loadingState}>
                    <span className={styles.loadingDot} />
                    Entrando...
                  </span>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>

            <footer className={styles.footer}>
              <p>© 2026 SGS — Sistema de Gestão de Segurança</p>
              <p className={styles.footerLinks}>
                <a href="/privacidade">Política de Privacidade</a>
                <a href="/termos">Termos de Uso</a>
              </p>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className={styles.page}>
      <div className={styles.loadingFallback}>
        <KeyRound size={20} />
      </div>
    </div>
  );
}

export default function LoginPageClient(props: LoginPageClientProps) {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageContent {...props} />
    </Suspense>
  );
}
