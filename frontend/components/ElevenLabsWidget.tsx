'use client';

import { createElement, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Script from 'next/script';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { aiService } from '@/services/aiService';
import { Button } from './ui/button';

export const elevenLabsAgentId =
  process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID?.trim() || '';

const widgetStyle: CSSProperties = {
  position: 'fixed',
  left: '1rem',
  bottom: '5.75rem',
  zIndex: 55,
};

export function ElevenLabsWidget() {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'loading' | 'signed' | 'public' | 'unavailable'>(
    'loading',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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

      try {
        const session = await aiService.getElevenLabsSignedUrl(
          elevenLabsAgentId || undefined,
        );
        if (!cancelled) {
          setSignedUrl(session.signedUrl);
          setMode('signed');
        }
      } catch (error) {
        if (!cancelled) {
          if (elevenLabsAgentId) {
            console.warn(
              'SOPHIE: signed_url indisponível, usando agent_id público como fallback.',
              error,
            );
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

  if (mode === 'loading') {
    return null;
  }

  if (mode === 'unavailable') {
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
      {createElement('elevenlabs-convai', {
        key: signedUrl || elevenLabsAgentId || 'sophie-elevenlabs',
        ...(mode === 'signed' && signedUrl
          ? { 'signed-url': signedUrl }
          : { 'agent-id': elevenLabsAgentId }),
        'action-text': 'Falar com a SOPHIE',
        'start-call-text': 'Iniciar conversa',
        'end-call-text': 'Encerrar conversa',
        'expand-text': 'Abrir assistente de voz',
        'listening-text': 'Ouvindo...',
        'speaking-text': 'SOPHIE respondendo',
        'avatar-orb-color-1': '#1D4ED8',
        'avatar-orb-color-2': '#0F766E',
        style: widgetStyle,
      })}
    </>
  );
}
