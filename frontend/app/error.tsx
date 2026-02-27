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
    console.error('[App Error Page]', error);
  }, [error]);

  return (
    <div className="mx-auto mt-12 max-w-xl rounded-lg border border-red-200 bg-red-50 p-6 text-center">
      <h2 className="text-lg font-semibold text-red-800">
        Falha ao carregar esta página
      </h2>
      <p className="mt-2 text-sm text-red-700">
        Tente novamente. Se o erro persistir, acione o suporte.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        Tentar novamente
      </button>
    </div>
  );
}

