'use client';

import { useEffect, useState } from 'react';
import {
  canAttemptStuckRouteRecovery,
  triggerStuckRouteRecovery,
} from '@/lib/stuck-route-recovery';

const AUTO_RECOVERY_TIMEOUT_MS = 12_000;

export default function DashboardLoading() {
  const [showFallbackActions, setShowFallbackActions] = useState(false);

  useEffect(() => {
    let active = true;

    const timeout = window.setTimeout(async () => {
      const didRecover = await triggerStuckRouteRecovery(
        'dashboard-loading-timeout',
      );

      if (active && !didRecover) {
        setShowFallbackActions(true);
      }
    }, AUTO_RECOVERY_TIMEOUT_MS);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, []);

  const handleManualRetry = async () => {
    const didRecover = await triggerStuckRouteRecovery(
      'dashboard-loading-manual',
    );
    if (!didRecover) {
      window.location.reload();
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[color:var(--color-background)] px-6 text-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent" />

      {showFallbackActions && (
        <div className="max-w-sm rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-4 shadow-[var(--ds-shadow-xs)]">
          <p className="text-sm text-[var(--ds-color-text-secondary)]">
            A tela demorou para carregar. Vamos tentar atualizar automaticamente.
          </p>
          <button
            type="button"
            onClick={handleManualRetry}
            className="mt-3 rounded-lg bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--ds-color-action-primary-hover)]"
          >
            Tentar novamente
          </button>
          {!canAttemptStuckRouteRecovery() && (
            <p className="mt-2 text-xs text-[var(--ds-color-text-muted)]">
              Uma tentativa automática acabou de ser feita. Se continuar, feche e
              abra o app.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

