'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DashboardError]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-background)] px-6 text-center text-[var(--color-text)]">
      <div className="max-w-md rounded-2xl border border-[var(--color-border-subtle)] bg-[color:var(--component-card-bg-elevated)] p-6 shadow-[var(--ds-shadow-lg)]">
        <h2 className="text-lg font-bold text-[var(--color-text)]">Erro ao carregar o Dashboard</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Recarregue a página. Se continuar, abra o console (F12) e envie o erro para correção.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 rounded-xl border border-[var(--color-border-subtle)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[color:var(--color-card-muted)]"
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex-1 rounded-xl bg-[color:var(--component-button-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--component-button-primary-text)] hover:bg-[color:var(--component-button-primary-hover-bg)]"
          >
            Recarregar
          </button>
        </div>
      </div>
    </div>
  );
}

