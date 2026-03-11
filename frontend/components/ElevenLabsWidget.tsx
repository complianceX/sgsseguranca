'use client';

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import Script from 'next/script';
import { AlertTriangle, Move, RefreshCw } from 'lucide-react';
import { aiService } from '@/services/aiService';
import { Button } from './ui/button';

export const elevenLabsAgentId =
  process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID?.trim() || '';
const elevenLabsBranchId =
  process.env.NEXT_PUBLIC_ELEVENLABS_BRANCH_ID?.trim() || '';
const elevenLabsAvatarImageUrl =
  process.env.NEXT_PUBLIC_ELEVENLABS_AVATAR_IMAGE_URL?.trim() ||
  '/sophie-avatar.svg';

const POSITION_STORAGE_KEY = 'gst.sophie.widget.position';
const WIDGET_MARGIN_PX = 12;
const WIDGET_DRAG_SIZE_PX = 72;

const widgetStyle: CSSProperties = {
  position: 'fixed',
  left: '1rem',
  bottom: '5.75rem',
  zIndex: 55,
};

type WidgetPosition = {
  left: number;
  top: number;
};

const clampPositionToViewport = (position: WidgetPosition): WidgetPosition => {
  if (typeof window === 'undefined') {
    return position;
  }

  const maxLeft = Math.max(
    WIDGET_MARGIN_PX,
    window.innerWidth - WIDGET_DRAG_SIZE_PX - WIDGET_MARGIN_PX,
  );
  const maxTop = Math.max(
    WIDGET_MARGIN_PX,
    window.innerHeight - WIDGET_DRAG_SIZE_PX - WIDGET_MARGIN_PX,
  );

  return {
    left: Math.min(Math.max(position.left, WIDGET_MARGIN_PX), maxLeft),
    top: Math.min(Math.max(position.top, WIDGET_MARGIN_PX), maxTop),
  };
};

const getDefaultWidgetPosition = (): WidgetPosition => {
  if (typeof window === 'undefined') {
    return { left: 16, top: 16 };
  }

  return clampPositionToViewport({
    left: 16,
    top: window.innerHeight - 160,
  });
};

const readStoredWidgetPosition = (): WidgetPosition | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<WidgetPosition>;
    if (
      typeof parsed?.left !== 'number' ||
      typeof parsed?.top !== 'number'
    ) {
      return null;
    }

    return clampPositionToViewport({
      left: parsed.left,
      top: parsed.top,
    });
  } catch {
    return null;
  }
};

const saveWidgetPosition = (position: WidgetPosition) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    POSITION_STORAGE_KEY,
    JSON.stringify(position),
  );
};

export function ElevenLabsWidget() {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [publicAgentId, setPublicAgentId] = useState<string>(elevenLabsAgentId);
  const [resolvedBranchId, setResolvedBranchId] = useState<string>(elevenLabsBranchId);
  const [mode, setMode] = useState<'loading' | 'signed' | 'public' | 'unavailable'>(
    elevenLabsAgentId ? 'public' : 'loading',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [widgetPosition, setWidgetPosition] = useState<WidgetPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: WidgetPosition;
  } | null>(null);
  const latestPositionRef = useRef<WidgetPosition | null>(null);

  useEffect(() => {
    const position = readStoredWidgetPosition() || getDefaultWidgetPosition();
    setWidgetPosition(position);
    latestPositionRef.current = position;
  }, []);

  useEffect(() => {
    if (!widgetPosition || typeof window === 'undefined') {
      return;
    }

    const onResize = () => {
      const next = clampPositionToViewport(widgetPosition);
      setWidgetPosition(next);
      latestPositionRef.current = next;
      saveWidgetPosition(next);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [widgetPosition]);

  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const current = latestPositionRef.current;
      if (!current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: current,
      };
      setIsDragging(true);
    },
    [],
  );

  const handleDragMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const next = clampPositionToViewport({
        left: dragRef.current.origin.left + (event.clientX - dragRef.current.startX),
        top: dragRef.current.origin.top + (event.clientY - dragRef.current.startY),
      });

      latestPositionRef.current = next;
      setWidgetPosition(next);
    },
    [],
  );

  const handleDragEnd = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
      setIsDragging(false);

      const finalPosition = latestPositionRef.current;
      if (finalPosition) {
        saveWidgetPosition(finalPosition);
      }
    },
    [],
  );

  const handleResetPosition = useCallback(() => {
    const next = getDefaultWidgetPosition();
    latestPositionRef.current = next;
    setWidgetPosition(next);
    saveWidgetPosition(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveErrorMessage = (error: unknown) => {
      if (typeof error === 'object' && error && 'response' in error) {
        const response = (error as {
          response?: { data?: { message?: string | string[] } };
        }).response;
        const message = response?.data?.message;
        if (typeof message === 'string' && message.trim()) {
          return message.trim();
        }
        if (Array.isArray(message) && message.length > 0) {
          return message.join(' ');
        }
      }

      if (error instanceof Error && error.message.trim()) {
        return error.message.trim();
      }

      return 'Não foi possível iniciar a sessão de voz da SOPHIE.';
    };

    async function resolveSignedUrl() {
      setErrorMessage(null);
      setSignedUrl(null);
      setPublicAgentId(elevenLabsAgentId);
      setResolvedBranchId(elevenLabsBranchId);
      if (elevenLabsAgentId) {
        setMode('public');
      } else {
        setMode('loading');
      }

      try {
        const session = await aiService.getElevenLabsSignedUrl(
          elevenLabsAgentId || undefined,
          elevenLabsBranchId || undefined,
        );
        if (cancelled) {
          return;
        }

        if (session.mode === 'signed' && session.signedUrl) {
          setResolvedBranchId(session.branchId || elevenLabsBranchId);
          setSignedUrl(session.signedUrl);
          setMode('signed');
          return;
        }

        if (session.mode === 'public' && session.agentId) {
          setPublicAgentId(session.agentId);
          setResolvedBranchId(session.branchId || elevenLabsBranchId);
          setErrorMessage(session.reason ?? null);
          setMode('public');
          return;
        }

        setErrorMessage(
          session.reason ||
            'A sessão de voz da SOPHIE não pôde ser iniciada neste momento.',
        );
        setMode('unavailable');
      } catch (error) {
        if (!cancelled) {
          if (elevenLabsAgentId) {
            console.warn(
              'SOPHIE: signed_url indisponível, usando agent_id público como fallback.',
              error,
            );
            setPublicAgentId(elevenLabsAgentId);
            setMode('public');
            return;
          }

          console.warn(
            'SOPHIE: sessão de voz indisponível.',
            error,
          );
          setErrorMessage(resolveErrorMessage(error));
          setMode('unavailable');
        }
      }
    }

    void resolveSignedUrl();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const widgetWrapperStyle = useMemo<CSSProperties>(() => {
    if (!widgetPosition) {
      return widgetStyle;
    }

    return {
      position: 'fixed',
      left: `${widgetPosition.left}px`,
      top: `${widgetPosition.top}px`,
      zIndex: 55,
    };
  }, [widgetPosition]);

  const embeddedWidgetStyle = useMemo<CSSProperties>(
    () => ({
      position: 'relative',
      left: 0,
      top: 0,
      bottom: 'auto',
      right: 'auto',
      zIndex: 55,
    }),
    [],
  );

  if (mode === 'loading') {
    return (
      <div
        className="fixed bottom-24 left-4 z-[55] w-[min(18rem,calc(100vw-2rem))] rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ds-color-surface-elevated)_94%,white_6%),color-mix(in_srgb,var(--ds-color-surface-base)_96%,transparent))] px-4 py-3 text-xs text-[var(--ds-color-text-secondary)] shadow-[var(--ds-shadow-md)] sm:bottom-6 sm:left-6"
        role="status"
        aria-live="polite"
      >
        Carregando SOPHIE...
      </div>
    );
  }

  if (mode === 'unavailable') {
    const talkToUrl = publicAgentId
      ? `https://elevenlabs.io/app/talk-to?agent_id=${encodeURIComponent(publicAgentId)}${
          resolvedBranchId
            ? `&branch_id=${encodeURIComponent(resolvedBranchId)}`
            : ''
        }`
      : null;

    return (
      <div
        className="fixed bottom-24 left-4 z-[55] w-[min(22rem,calc(100vw-2rem))] rounded-[var(--ds-radius-xl)] border border-[color:var(--ds-color-warning)]/30 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ds-color-surface-elevated)_94%,white_6%),color-mix(in_srgb,var(--ds-color-surface-base)_96%,transparent))] p-4 shadow-[var(--ds-shadow-lg)] sm:bottom-6 sm:left-6"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-[color:var(--ds-color-warning)]/16 p-2 text-[var(--ds-color-warning)]">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
              SOPHIE indisponível
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
              {errorMessage ||
                'A sessão de voz da ElevenLabs não foi iniciada neste navegador.'}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end">
          {talkToUrl ? (
            <a
              href={talkToUrl}
              target="_blank"
              rel="noreferrer"
              className="mr-2 inline-flex h-8 items-center rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] px-2.5 text-[11px] font-semibold text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)] hover:text-[var(--ds-color-text-primary)]"
            >
              Abrir no ElevenLabs
            </a>
          ) : null}
          <Button
            type="button"
            size="sm"
            rightIcon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => {
              setMode('loading');
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://unpkg.com/@elevenlabs/convai-widget-embed"
        strategy="afterInteractive"
      />
      <div style={widgetWrapperStyle}>
        <button
          type="button"
          aria-label="Mover botão da SOPHIE"
          title="Arraste para mover a SOPHIE (duplo clique para resetar)"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          onDoubleClick={handleResetPosition}
          className={`absolute -right-2 -top-2 z-[56] inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-elevated)]/92 text-[var(--ds-color-text-secondary)] shadow-[var(--ds-shadow-sm)] transition-colors hover:bg-[var(--ds-color-surface-muted)] hover:text-[var(--ds-color-text-primary)] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ touchAction: 'none' }}
        >
          <Move className="h-3.5 w-3.5" />
        </button>

        {createElement('elevenlabs-convai', {
          key: signedUrl || publicAgentId || 'sophie-elevenlabs',
          ...(mode === 'signed' && signedUrl
            ? { 'signed-url': signedUrl }
            : { 'agent-id': publicAgentId }),
          'action-text': 'Falar com a SOPHIE',
          'start-call-text': 'Iniciar conversa',
          'end-call-text': 'Encerrar conversa',
          'expand-text': 'Abrir assistente de voz',
          'listening-text': 'Ouvindo...',
          'speaking-text': 'SOPHIE respondendo',
          'avatar-image-url': elevenLabsAvatarImageUrl,
          'avatar-orb-color-1': '#1D4ED8',
          'avatar-orb-color-2': '#0F766E',
          style: embeddedWidgetStyle,
        })}
      </div>
    </>
  );
}
