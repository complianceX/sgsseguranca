'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { isAxiosError } from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  Users,
  Shield,
} from 'lucide-react';
import styles from './login.module.css';
import { normalizePublicApiBaseUrl } from '@/lib/public-api-url';
import { authService } from '@/services/authService';

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

const FEATURES = [
  { icon: <CheckCircle2 size={16} />, label: 'APRs e análises de risco automatizadas' },
  { icon: <Users size={16} />, label: 'Multi-tenant com isolamento por empresa' },
  { icon: <Shield size={16} />, label: 'Conformidade LGPD e NRs vigentes' },
];

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

async function isApiEndpointReachableWithoutCorsInspection(
  apiBase?: string,
): Promise<boolean> {
  if (typeof window === 'undefined' || !apiBase?.trim()) {
    return false;
  }

  const normalizedBase = apiBase.trim().replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);

  try {
    await fetch(`${normalizedBase}/health/public?ts=${Date.now()}`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

function resolveApiBaseForWarmup(): string | null {
  const explicitApiUrl = normalizePublicApiBaseUrl(
    process.env.NEXT_PUBLIC_API_URL,
  );
  if (!explicitApiUrl) {
    return null;
  }

  return explicitApiUrl.endsWith('/')
    ? explicitApiUrl.slice(0, -1)
    : explicitApiUrl;
}

async function getLoginErrorMessage(error: unknown): Promise<string> {
  if (!isAxiosError(error)) {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return 'Erro ao tentar fazer login. Tente novamente.';
  }

  const status = error.response?.status;
  const data = error.response?.data as { message?: string | string[] } | undefined;

  if (!error.response) {
    const apiBase = (error.config?.baseURL || 'http://localhost:3011')
      .trim()
      .replace(/\/$/, '');
    const [apiHealthy, apiEndpointReachable] = await Promise.all([
      isApiHealthy(apiBase),
      isApiEndpointReachableWithoutCorsInspection(apiBase),
    ]);

    if (apiHealthy) {
      return 'Conexão instável. Recarregue a página e tente novamente.';
    }

    if (apiEndpointReachable) {
      return 'Serviço temporariamente indisponível. Aguarde alguns instantes e tente novamente.';
    }

    return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
  }

  if (status === 401) {
    return 'CPF ou senha inválidos.';
  }

  if (status === 403) {
    return 'Acesso negado para este login. Verifique permissões e políticas de segurança.';
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

function LoginPageContent({ turnstileSiteKey, nonce }: LoginPageClientProps) {
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('expired') === '1';

  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileError, setTurnstileError] = useState('');
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  const [mfaStage, setMfaStage] = useState<'none' | 'challenge' | 'bootstrap'>(
    'none',
  );
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [manualEntryKey, setManualEntryKey] = useState('');
  const [otpAuthUrl, setOtpAuthUrl] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryCodesCopied, setRecoveryCodesCopied] = useState(false);

  const cpfRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const recoveryCodesCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { login, finalizeLogin } = useAuth();
  const turnstileEnabled = turnstileSiteKey.length > 0;

  useEffect(() => {
    cpfRef.current?.focus();
  }, []);

  useEffect(() => {
    const apiBase = resolveApiBaseForWarmup();
    if (!apiBase) {
      return;
    }

    let cancelled = false;
    const retryHandle = window.setTimeout(async () => {
      if (cancelled) {
        return;
      }
      await isApiHealthy(apiBase);
    }, 2500);

    void isApiHealthy(apiBase);

    return () => {
      cancelled = true;
      window.clearTimeout(retryHandle);
    };
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
    if (error) setError('');
    setCpf(formatCpf(e.target.value));
  };

  const handlePasswordKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (error) setError('');
    setCapsLockOn(e.getModifierState('CapsLock'));
  };

  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerShake = () => {
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    setShake(true);
    shakeTimerRef.current = setTimeout(() => setShake(false), 500);
  };

  useEffect(() => {
    return () => {
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      if (recoveryCodesCopyTimeoutRef.current) {
        clearTimeout(recoveryCodesCopyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyRecoveryCodes = async () => {
    if (!recoveryCodes.length) return;

    await navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setRecoveryCodesCopied(true);
    if (recoveryCodesCopyTimeoutRef.current) {
      clearTimeout(recoveryCodesCopyTimeoutRef.current);
    }
    recoveryCodesCopyTimeoutRef.current = setTimeout(() => {
      setRecoveryCodesCopied(false);
    }, 2000);
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
    if (mfaStage !== 'none') {
      setLoading(true);
      try {
        const response =
          mfaStage === 'bootstrap'
            ? await authService.activateBootstrapMfa(mfaChallengeToken, mfaCode)
            : await authService.verifyLoginMfa(mfaChallengeToken, mfaCode);
        finalizeLogin(response);
      } catch (err: unknown) {
        setError(await getLoginErrorMessage(err));
        triggerShake();
      } finally {
        setLoading(false);
      }
      return;
    }

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
      const result = await login(cleanCpf, password, turnstileToken || undefined);
      if ('mfaRequired' in result) {
        setMfaStage('challenge');
        setMfaChallengeToken(result.challengeToken);
        setMfaCode('');
        setPassword('');
        setError('');
        return;
      }
      if ('mfaEnrollRequired' in result) {
        setMfaStage('bootstrap');
        setMfaChallengeToken(result.challengeToken);
        setOtpAuthUrl(result.otpAuthUrl);
        setManualEntryKey(result.manualEntryKey);
        setRecoveryCodes(result.recoveryCodes);
        setMfaCode('');
        setPassword('');
        setError('');
        return;
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
          nonce={nonce}
          strategy="afterInteractive"
          onLoad={() => setTurnstileScriptReady(true)}
          onError={() =>
            setTurnstileError(
              'Não foi possível carregar a proteção da Cloudflare agora.',
            )
          }
        />
      )}

      <main className={styles.layout}>
        {/* ── Left panel ───────────────────────────────────── */}
        <section className={`${styles.loginSection} ${shake ? styles.shake : ''}`}>
          {/* hex-grid overlay */}
          <div className={styles.loginCard} aria-hidden="true" />

          {/* Centre content */}
          <div className={styles.brandPanelInner}>
            <div className={styles.brandContent}>
              {/* Plataforma SST pill */}
              <ul className={styles.highlightList} aria-label="Categoria">
                <li className={styles.highlightItem}>
                  <span className={styles.highlightDot} />
                  Plataforma SST
                </li>
              </ul>

              <h2 className={styles.brandTitle}>
                Proteja quem<br />move sua<br /><em className={styles.brandTitleAccent}>operação.</em>
              </h2>

              <p className={styles.brandLead}>
                APRs, laudos, treinamentos e exames ocupacionais — rastreáveis, auditáveis e em conformidade com as NRs.
              </p>

              {/* Feature list */}
              <ul className={styles.featureList} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {FEATURES.map((f) => (
                  <li key={f.label} className={styles.featureItem}>
                    <span className={styles.featureIcon}>{f.icon}</span>
                    {f.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className={styles.brandFooter}>© 2026 SGS — Sistema de Gestão de Segurança</p>
        </section>

        {/* ── Right panel (form) ───────────────────────────── */}
        <section className={styles.formPanel}>
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

          <div className={`${styles.formBody} ${styles.fadeInUp}`}>
            <div className={styles.rightLogo}>
              <div className={styles.rightLogoLockup}>
                <svg
                  className={styles.rightLogoMark}
                  viewBox="0 0 48 48"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <circle cx="24" cy="24" r="22" stroke="rgba(13,31,60,0.12)" strokeWidth="1.5" />
                  <path
                    d="M24 14a10 10 0 1 1 0 20 10 10 0 0 1 0-20z"
                    fill="rgba(13,31,60,0.05)"
                    stroke="rgba(13,31,60,0.3)"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M18 26 Q18 20 24 19 Q30 20 30 26"
                    stroke="#F5A623"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <line x1="17" y1="27" x2="31" y2="27" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" />
                  <rect x="22.5" y="10" width="3" height="4" rx="1" fill="rgba(13,31,60,0.32)" />
                  <rect x="22.5" y="34" width="3" height="4" rx="1" fill="rgba(13,31,60,0.32)" />
                  <rect x="10" y="22.5" width="4" height="3" rx="1" fill="rgba(13,31,60,0.32)" />
                  <rect x="34" y="22.5" width="4" height="3" rx="1" fill="rgba(13,31,60,0.32)" />
                </svg>
                <div className={styles.rightLogoText}>
                  <span className={styles.rightLogoWordmark}>SGS</span>
                  <span className={styles.rightLogoCaption}>Sistema de Gestão de Segurança</span>
                </div>
              </div>
            </div>

            <div className={styles.formHeader}>
              <h1 className={styles.loginTitle}>Acesse sua conta</h1>
              <p className={styles.loginSubtitle}>
                {mfaStage === 'none'
                  ? 'Entre com seu CPF e senha para continuar.'
                  : 'Conclua a verificação adicional para liberar o acesso.'}
              </p>
            </div>

            {sessionExpired && (
              <div className={styles.warningBanner} role="alert">
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
                  disabled={mfaStage !== 'none'}
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
                    disabled={mfaStage !== 'none'}
                    aria-label="Senha do usuário"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
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
                <a href="/forgot-password" className={styles.forgotButton}>
                  Esqueceu a senha?
                </a>
              </div>

              {mfaStage !== 'none' && (
                <section className={styles.mfaPanel}>
                  <div className={styles.mfaHeader}>
                    <ShieldCheck size={18} />
                    <span>
                      {mfaStage === 'bootstrap'
                        ? 'MFA obrigatório para esta conta'
                        : 'Informe o código MFA'}
                    </span>
                  </div>

                  {mfaStage === 'bootstrap' && otpAuthUrl && (
                    <div className={styles.mfaBootstrapGrid}>
                      <div className={styles.qrWrap}>
                        <QRCodeSVG value={otpAuthUrl} size={168} />
                      </div>
                      <div className={styles.mfaBootstrapInfo}>
                        <p className={styles.mfaHint}>
                          Escaneie o QR Code no autenticador ou use a chave manual.
                        </p>
                        <code className={styles.manualKey}>{manualEntryKey}</code>
                      </div>
                    </div>
                  )}

                  <div className={styles.field}>
                    <label htmlFor="mfaCode" className={styles.label}>
                      Código do autenticador ou recovery code
                    </label>
                    <input
                      id="mfaCode"
                      type="text"
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value)}
                      className={styles.inputField}
                      placeholder="123456 ou ABCD-EFGH-IJKL-MNOP"
                      autoComplete="one-time-code"
                      required
                    />
                  </div>

                  {recoveryCodes.length > 0 && (
                    <div className={styles.recoveryWrap}>
                      <p className={styles.mfaHint}>
                        Guarde estes recovery codes. Eles aparecem apenas uma vez.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleCopyRecoveryCodes()}
                        className={styles.forgotButton}
                      >
                        {recoveryCodesCopied ? 'Copiado!' : 'Copiar todos os códigos'}
                      </button>
                      <ul className={styles.recoveryList}>
                        {recoveryCodes.map((code) => (
                          <li key={code}>{code}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {error && (
                <div className={styles.errorBanner} role="alert" aria-live="assertive">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {turnstileEnabled && mfaStage === 'none' && (
                <>
                  <div ref={turnstileContainerRef} className={styles.turnstileMount} />
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
                  (mfaStage === 'none' && turnstileEnabled && !turnstileToken) ||
                  (mfaStage !== 'none' && !mfaCode.trim())
                }
                className={styles.submitButton}
              >
                {loading ? (
                  <span className={styles.loadingState}>
                    <span className={styles.loadingDot} />
                    {mfaStage === 'none' ? 'Entrando...' : 'Validando...'}
                  </span>
                ) : (
                  <span className={styles.submitContent}>
                    <span>{mfaStage === 'none' ? 'Entrar' : 'Confirmar MFA'}</span>
                    <ArrowRight size={18} />
                  </span>
                )}
              </button>
            </form>

            <footer className={styles.footer}>
              <p className={styles.footerLinks}>
                <a href="/privacidade">Privacidade</a>
                <a href="/termos">Termos de uso</a>
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
