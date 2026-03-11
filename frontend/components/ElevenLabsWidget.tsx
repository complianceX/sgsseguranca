'use client';

import { createElement } from 'react';
import type { CSSProperties } from 'react';
import Script from 'next/script';

const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID?.trim();
const widgetStyle: CSSProperties = {
  position: 'fixed',
  right: '1rem',
  bottom: '5.75rem',
  zIndex: 55,
};

export function ElevenLabsWidget() {
  if (!agentId) {
    return null;
  }

  return (
    <>
      <Script
        src="https://unpkg.com/@elevenlabs/convai-widget-embed"
        strategy="afterInteractive"
      />
      {createElement('elevenlabs-convai', {
        'agent-id': agentId,
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
