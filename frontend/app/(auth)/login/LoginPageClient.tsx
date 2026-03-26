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
  BellRing,
  Blocks,
  Building2,
  ClipboardList,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
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

function getLoginErrorMessage(error: unknown): string {
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
      setError(getLoginErrorMessage(err));
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
        <section className={`${styles.institutionalPanel} ${styles.fadeInUp}`}>
          <div className={styles.brandRow}>
            <Image src="/logo-gst-mark.svg" alt="SGS" width={44} height={44} priority className={styles.brandBadge} />
            <span className={styles.brandName}>SGS — Sistema de Gestão de Segurança</span>
          </div>

          <h1 className={styles.heroTitle}>Sistema de Gestão de Segurança</h1>
          <p className={styles.heroSubtitle}>
            Controle treinamentos, exames médicos, EPIs, laudos e conformidades em um único sistema.
          </p>

          <div className={styles.statsGrid}>
            <article className={styles.statCard}>
              <ClipboardList size={18} />
              <strong>35+</strong>
              <span>Normas NR cobertas</span>
            </article>
            <article className={styles.statCard}>
              <Blocks size={18} />
              <strong>18+</strong>
              <span>Módulos ativos</span>
            </article>
            <article className={styles.statCard}>
              <BellRing size={18} />
              <strong>24/7</strong>
              <span>Alertas automáticos</span>
            </article>
            <article className={styles.statCard}>
              <Building2 size={18} />
              <strong>Multiempresa</strong>
              <span>Operação corporativa</span>
            </article>
          </div>

          <div className={styles.trustList}>
            <span><ShieldCheck size={14} /> SSL/TLS</span>
            <span><Lock size={14} /> Dados criptografados</span>
            <span><Building2 size={14} /> Multi-tenant</span>
          </div>
        </section>

        <section className={styles.loginSection}>
          <div className={`${styles.loginCard} ${styles.fadeInUp} ${shake ? styles.shake : ''}`}>
            <div className={styles.mobileBrand}>
              <Image src="/logo-gst-mark.svg" alt="SGS" width={56} height={56} priority />
              <div className={styles.mobileBrandText}>
                <span className={styles.mobileBrandTitle}>SGS</span>
                <span className={styles.mobileBrandSub}>SISTEMA DE GESTÃO DE SEGURANÇA</span>
              </div>
            </div>

            <h2 className={styles.loginTitle}>Bem-vindo de volta</h2>
            <p className={styles.loginSubtitle}>Acesso seguro ao SGS</p>

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
                    tabIndex={-1}
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
                <div className={styles.turnstileSection}>
                  <div className={styles.turnstileHeader}>
                    <div className={styles.turnstileBadge}>
                      <ShieldCheck size={14} />
                      Cloudflare ativo
                    </div>
                    <span className={styles.turnstileStatus}>
                      Análise adaptativa contra bots e brute force
                    </span>
                  </div>
                  <div className={styles.turnstileIntro}>
                    <strong>Camada extra de proteção no acesso</strong>
                    <p>
                      O login do SGS valida tráfego suspeito antes da autenticação
                      e reduz abuso automatizado sem atrapalhar usuários legítimos.
                    </p>
                  </div>
                  <div
                    ref={turnstileContainerRef}
                    className={styles.turnstileWidget}
                  />
                  <div className={styles.turnstileHighlights}>
                    <span><Lock size={13} /> Mitigação de credenciais automatizadas</span>
                    <span><Cloud size={13} /> Verificação contínua da sessão de entrada</span>
                    <span><ShieldCheck size={13} /> Proteção inteligente em tempo real</span>
                  </div>
                  <p className={styles.turnstileHint}>
                    <Cloud size={14} />
                    Protegido por Cloudflare Turnstile
                  </p>
                  {turnstileError && (
                    <p className={styles.turnstileError}>
                      <AlertTriangle size={14} />
                      {turnstileError}
                    </p>
                  )}
                </div>
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

              <div className={styles.securityTrust}>
                <span><Lock size={14} /> Criptografia AES-256</span>
                <span><ShieldCheck size={14} /> Conformidade LGPD</span>
                <span><Cloud size={14} /> Infraestrutura segura</span>
                {turnstileEnabled && (
                  <span><ShieldCheck size={14} /> Bot protection by Cloudflare</span>
                )}
              </div>
            </form>

            <footer className={styles.footer}>
              <p>© 2026 SGS — Sistema de Gestão de Segurança</p>
              <p>Todos os direitos reservados &nbsp;·&nbsp; Versão 2.0.0</p>
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
