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
    <div className="flex min-h-screen items-center justify-center bg-[#0F172A] px-6 text-center text-white">
      <div className="max-w-md rounded-2xl border border-[#334155] bg-[#1E293B] p-6 shadow-xl">
        <h2 className="text-lg font-bold">Erro ao carregar o Dashboard</h2>
        <p className="mt-2 text-sm text-[#CBD5E1]">
          Recarregue a página. Se continuar, abra o console (F12) e envie o erro para correção.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 rounded-xl border border-[#334155] bg-transparent px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F172A]"
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex-1 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1D4ED8]"
          >
            Recarregar
          </button>
        </div>
      </div>
    </div>
  );
}

