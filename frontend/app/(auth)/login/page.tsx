'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSearchParams, useRouter as useNextRouter } from 'next/navigation';
import Image from 'next/image';
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

  if (status === 401 || status === 403) {
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

const REMEMBER_CPF_KEY = 'gst_remembered_cpf';
const LEGACY_REMEMBER_CPF_KEY = 'compliance_x_remembered_cpf';

function LoginPageContent() {
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

  const cpfRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { login } = useAuth();

  useEffect(() => {
    const savedCpf =
      localStorage.getItem(REMEMBER_CPF_KEY) ??
      localStorage.getItem(LEGACY_REMEMBER_CPF_KEY) ??
      '';
    if (savedCpf) {
      setCpf(savedCpf);
      setRememberCpf(true);
      passwordRef.current?.focus();
      return;
    }
    cpfRef.current?.focus();
  }, []);

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const cleanCpf = cpf.replace(/\D/g, '');

    try {
      await login(cleanCpf, password);
      if (rememberCpf) {
        localStorage.setItem(REMEMBER_CPF_KEY, cpf);
        localStorage.removeItem(LEGACY_REMEMBER_CPF_KEY);
      } else {
        localStorage.removeItem(REMEMBER_CPF_KEY);
        localStorage.removeItem(LEGACY_REMEMBER_CPF_KEY);
      }
    } catch (err: unknown) {
      setError(getLoginErrorMessage(err));
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.backgroundGlowA} />
      <div className={styles.backgroundGlowB} />
      <div className={styles.backgroundGrid} />

      <main className={styles.layout}>
        <section className={`${styles.institutionalPanel} ${styles.fadeInUp}`}>
          <div className={styles.brandRow}>
            <div className={styles.brandBadge}>GST</div>
            <span className={styles.brandName}>&lt;GST&gt; GESTÃO DE SEGURANÇA DO TRABALHO</span>
          </div>

          <h1 className={styles.heroTitle}>Gestão de Segurança do Trabalho</h1>
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
              <Image
                src="/logo-gst.svg"
                alt="Logo <GST> Gestão de Segurança do Trabalho"
                width={284}
                height={62}
                priority
              />
            </div>

            <h2 className={styles.loginTitle}>Bem-vindo de volta</h2>
            <p className={styles.loginSubtitle}>Sistema de Gestão de Segurança do Trabalho</p>

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

              <button
                type="submit"
                disabled={loading}
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
              </div>
            </form>

            <footer className={styles.footer}>
              <p>© 2026 &lt;GST&gt; Gestão de Segurança do Trabalho</p>
              <p>Todos os direitos reservados</p>
              <p>Versão 2.0.0</p>
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

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
