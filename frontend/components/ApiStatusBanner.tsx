'use client';

import { useEffect, useRef } from 'react';
import { useApiStatus } from '@/hooks/useApiStatus';
import { useApiReconnect } from '@/hooks/useApiReconnect';

export function ApiStatusBanner() {
  const { isOffline, offlineMessage, apiBaseUrl } = useApiStatus();
  const { isReconnecting, reconnect, reconnectWithBackoff } = useApiReconnect(apiBaseUrl);
  const autoReconnectAttemptedRef = useRef(false);

  useEffect(() => {
    if (!isOffline) {
      autoReconnectAttemptedRef.current = false;
      return;
    }
    if (autoReconnectAttemptedRef.current) return;
    autoReconnectAttemptedRef.current = true;
    void reconnectWithBackoff();
  }, [isOffline, reconnectWithBackoff]);

  if (!isOffline) return null;

  return (
    <div className="mx-6 mt-3 rounded-xl border border-[color:var(--ds-color-warning)]/22 bg-[color:var(--ds-color-warning-subtle)] px-3.5 py-2.5 text-[13px] text-[var(--ds-color-warning)] shadow-[var(--ds-shadow-sm)]">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[var(--ds-color-text-primary)]">{offlineMessage}</p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={reconnect}
            disabled={isReconnecting}
            className="rounded-lg border border-[color:var(--ds-color-warning)]/24 bg-[var(--ds-color-surface-base)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ds-color-warning)] transition-colors hover:bg-[color:var(--ds-color-warning-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isReconnecting ? 'Reconectando...' : 'Reconectar'}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-[color:var(--ds-color-warning)]/24 bg-[var(--ds-color-surface-base)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ds-color-warning)] transition-colors hover:bg-[color:var(--ds-color-warning-subtle)]"
          >
            Recarregar
          </button>
        </div>
      </div>
    </div>
  );
}
