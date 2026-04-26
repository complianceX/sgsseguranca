'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void import('@sentry/browser').then((Sentry) => {
      Sentry.captureException(error, {
        tags: { boundary: 'global-error' },
        extra: { digest: error.digest },
      });
    });
    if (process.env.NODE_ENV !== 'production') console.error('[Global Error Page]', error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="bg-[var(--bg-app)] text-[var(--text-primary)] antialiased">
        <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-[color:var(--ds-color-danger)]/20 bg-[color:var(--ds-color-danger-subtle)] p-5 text-center shadow-[var(--ds-shadow-sm)]">
          <h2 className="text-base font-semibold text-[var(--ds-color-danger)]">
            Falha crítica ao carregar a aplicação
          </h2>
          <p className="mt-2 text-[13px] text-[var(--ds-color-text-secondary)]">
            Tente novamente. Se o erro persistir, acione o suporte.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-4 rounded-xl bg-[var(--ds-color-danger)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--ds-color-danger-hover)]"
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
