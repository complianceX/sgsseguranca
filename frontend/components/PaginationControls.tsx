'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export function PaginationControls(props: {
  page: number;
  lastPage: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const canPrev = props.page > 1;
  const canNext = props.page < props.lastPage;

  return (
    <div className="flex flex-col gap-2 border-t bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-gray-600">
        Página <span className="font-semibold">{props.page}</span> de{' '}
        <span className="font-semibold">{props.lastPage}</span> •{' '}
        <span className="font-semibold">{props.total}</span> item(s)
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={props.onPrev}
          disabled={!canPrev}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>
        <button
          type="button"
          onClick={props.onNext}
          disabled={!canNext}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Próxima
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

