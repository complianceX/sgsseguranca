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
    <div className="mx-8 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex items-center justify-between gap-4">
        <p>{offlineMessage}</p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={reconnect}
            disabled={isReconnecting}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isReconnecting ? 'Reconectando...' : 'Reconectar'}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Recarregar
          </button>
        </div>
      </div>
    </div>
  );
}
