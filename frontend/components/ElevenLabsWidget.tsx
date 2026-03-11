'use client';

import { createElement, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Script from 'next/script';
import { aiService } from '@/services/aiService';
import { AIButton } from './AIButton';

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
  const [mode, setMode] = useState<'loading' | 'signed' | 'public' | 'fallback'>(
    'loading',
  );

  useEffect(() => {
    let cancelled = false;

    async function resolveSignedUrl() {
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
            'SOPHIE: sessão de voz indisponível, usando chat interno como fallback.',
            error,
          );
          setMode('fallback');
        }
      }
    }

    void resolveSignedUrl();

    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === 'fallback') {
    return <AIButton />;
  }

  if (mode === 'loading') {
    return null;
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
