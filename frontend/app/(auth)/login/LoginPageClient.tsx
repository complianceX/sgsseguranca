'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSearchParams } from 'next/navigation';
import { isAxiosError } from 'axios';
import {
  Eye,
  EyeOff,
  CheckCircle2,
  Users,
  Shield,
  ArrowRight,
  Lock,
  User as UserIcon,
  ShieldCheck,
} from 'lucide-react';
import styles from './login.module.css';
import { authService } from '@/services/authService';
import Script from 'next/script';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  const turnstileEnabled = turnstileSiteKey.length > 0;

  // ── Particle network logic ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W: number, H: number;
    let pts: Array<{ x: number; y: number; vx: number; vy: number; r: number; a: number }> = [];

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        W = canvas.width = parent.clientWidth;
        H = canvas.height = parent.clientHeight;
      }
    };

    const spawn = () => {
      pts = [];
      for (let i = 0; i < 40; i++) {
        pts.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: Math.random() * 1.4 + 0.4,
          a: Math.random() * 0.28 + 0.06,
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 115) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(245, 166, 35, ${(1 - d / 115) * 0.055})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245, 166, 35, ${p.a})`;
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      });
      requestAnimationFrame(draw);
    };

    resize();
    spawn();
    draw();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
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
        },
        'expired-callback': () => {
          setTurnstileToken('');
        },
        'error-callback': () => {
          setTurnstileToken('');
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

  const formatCpf = (value: string) => {
    let v = value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{3})/, '$1.$2');
    return v;
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCpf(e.target.value));
    setError('');
  };

  const handleRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = submitBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height) * 2;
    ripple.className = styles.btnRipple;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 800);
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
      {/* ── LEFT ── */}
      <div className={styles.left}>
        <canvas ref={canvasRef} className={styles.particlesCanvas} />
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />
        <div className={`${styles.ring} ${styles.ring1}`} />
        <div className={`${styles.ring} ${styles.ring2}`} />
        <div className={`${styles.ring} ${styles.ring3}`} />
        <div className={styles.ringAccent} />
        <div className={`${styles.dot} ${styles.dot1}`} />
        <div className={`${styles.dot} ${styles.dot2}`} />
        <div className={`${styles.dot} ${styles.dot3}`} />
        <div className={`${styles.dot} ${styles.dot4}`} />
        <div className={styles.scan} />
        <div className={styles.vline} />

        <div className={styles.leftBrand}>
          <div className={styles.brandIcon}>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z" stroke="#f5a623" strokeWidth="1.6" strokeLinejoin="round" />
              <circle cx="12" cy="11" r="2.5" fill="#f5a623" opacity="0.8" />
            </svg>
          </div>
          <div>
            <div className={styles.brandName}>SGS</div>
            <div className={styles.brandSub}>Sistema de Gestão de Segurança<a href=""></a></div>
          </div>
        </div>

        <div className={styles.leftHero}>
          <div className={styles.leftBadge}><span className={styles.badgeDot}></span><span className={styles.badgeText}>S</span></div>
          <h1 className={styles.heroTitle}>
            <span className={styles.heroLine}>Proteja quem</span>
            <span className={styles.heroLine}>move sua</span>
            <span className={styles.heroLine}>operação.</span>
          </h1>
          <p className={styles.heroDesc}>APRs,PTs,DDS,CHECK-LIST — rastreáveis, auditáveis e em conformidade com as NRs.</p>
          <div className={styles.featureList}>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}><CheckCircle2 size={16} /></div>
              <span className={styles.featureLabel}>APRs e análises de risco automatizadas</span>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}><Users size={16} /></div>
              <span className={styles.featureLabel}>Multi-tenant com isolamento por empresa</span>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}><Shield size={16} /></div>
              <span className={styles.featureLabel}>Conformidade LGPD e NRs vigentes</span>
            </div>
          </div>
        </div>
        <div className={styles.leftFooter}>© 2026 SGS — Sistema de Gestão de Segurança</div>
      </div>

      {/* ── RIGHT ── */}
      <div className={styles.right}>
        <div className={styles.loginCard}>
          <div className={styles.cardLogo}>
            <div className={styles.cardLogoIcon}>
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z" stroke="#f5a623" strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="12" cy="11" r="2.5" fill="#f5a623" opacity="0.85" />
              </svg>
            </div>
            <div>
              <div className={styles.cardLogoName}>SGS</div>
              <div className={styles.cardLogoSub}>Sistema de Gestão de Segurança</div>
            </div>
          </div>
          <h2 className={styles.cardTitle}>Acesse sua conta</h2>
          <p className={styles.cardSubtitle}>Entre com seu CPF e senha para continuar.</p>

          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="cpf">CPF</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><UserIcon size={16} /></span>
                <input
                  id="cpf"
                  type="text"
                  className={`${styles.formInput} ${error ? styles.invalid : ''}`}
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={handleCpfChange}
                  disabled={loading}
                />
                <div className={styles.inputFocusBar} />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="senha">Senha</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><Lock size={16} /></span>
                <input
                  id="senha"
                  type={showPassword ? 'text' : 'password'}
                  className={`${styles.formInput} ${error ? styles.invalid : ''}`}
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <div className={styles.inputFocusBar} />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className={styles.rowForgot}><a href="/forgot-password" className={styles.forgotLink}>Esqueceu a senha?</a></div>
            </div>

            {mfaStage === 'challenge' && (
              <div className={styles.formGroup} style={{ marginTop: '16px' }}>
                <label className={styles.formLabel} htmlFor="mfa">Código MFA</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}><ShieldCheck size={16} /></span>
                  <input
                    id="mfa"
                    type="text"
                    className={styles.formInput}
                    placeholder="000000"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    disabled={loading}
                  />
                  <div className={styles.inputFocusBar} />
                </div>
              </div>
            )}

            {error && <p className={styles.cardSubtitle} style={{ color: '#dc2626', marginTop: '12px', fontSize: '13px' }}>{error}</p>}

            {turnstileEnabled && mfaStage === 'none' && (
              <div ref={turnstileContainerRef} style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }} />
            )}

            <button
              ref={submitBtnRef}
              className={`${styles.btnSubmit} ${loading ? styles.loading : ''}`}
              type="submit"
              disabled={loading || (turnstileEnabled && !turnstileToken && mfaStage === 'none')}
              onClick={(e) => handleRipple(e as unknown as React.MouseEvent<HTMLButtonElement>)}
            >
              <span className={styles.btnText} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {mfaStage === 'challenge' ? 'Confirmar' : 'Entrar'} <ArrowRight className={styles.btnArrow} size={18} />
              </span>
              <span className={styles.btnLoader}><span></span><span></span><span></span></span>
            </button>
          </form>

          <div className={styles.divider}>
            <div className={styles.dividerLine} />
            <span className={styles.dividerText}>acesso seguro</span>
            <div className={styles.dividerLine} />
          </div>

          <div className={styles.securityBadge}>
            <ShieldCheck size={14} />
            Conexão criptografada · Dados protegidos pela LGPD
          </div>

          <div className={styles.cardFooter}>
            <a href="/privacidade" className={styles.footerLink}>Privacidade</a>
            <span className={styles.footerSep}>·</span>
            <a href="/termos" className={styles.footerLink}>Termos de uso</a>
            <span className={styles.footerSep}>·</span>
            <a href="/suporte" className={styles.footerLink}>Suporte</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className={styles.page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        <div className={styles.btnLoader} style={{ display: 'flex' }}><span></span><span></span><span></span></div>
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
