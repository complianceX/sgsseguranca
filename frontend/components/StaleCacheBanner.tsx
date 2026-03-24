'use client';

// ---------------------------------------------------------------------------
// StaleCacheBanner — exibe aviso quando dados desatualizados (stale) foram
// servidos do cache offline. Aparece como barra amarela fixa no topo.
//
// Consumida via useApiStatus().hasStaleCache e clearStaleFlag().
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useApiStatus } from '@/hooks/useApiStatus';

export function StaleCacheBanner() {
  const { hasStaleCache, isSyncing, clearStaleFlag } = useApiStatus();
  // Controla animação de slide-down/up
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasStaleCache) {
      // Pequeno delay para a animação de entrada funcionar após montar
      const timer = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      // Slide-up antes de desmontar
      setVisible(false);
    }
  }, [hasStaleCache]);

  if (!hasStaleCache) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'transform 0.25s ease-in-out',
      }}
    >
      <div
        style={{
          background: '#FFFBEB',
          borderBottom: '1px solid #FDE68A',
          color: '#92400E',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '8px 16px',
          fontSize: '13px',
          fontWeight: 500,
        }}
      >
        <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />

        <span>
          {isSyncing
            ? 'Sincronizando dados...'
            : 'Alguns dados podem estar desatualizados. Você estava offline.'}
        </span>

        {!isSyncing && (
          <>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginLeft: '8px',
                padding: '2px 10px',
                borderRadius: '4px',
                border: '1px solid #F59E0B',
                background: '#FEF3C7',
                color: '#92400E',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Atualizar agora
            </button>

            <button
              type="button"
              onClick={clearStaleFlag}
              aria-label="Fechar aviso"
              style={{
                marginLeft: '4px',
                padding: '2px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#92400E',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
