'use client';

import { memo, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RefreshCw } from 'lucide-react';

const TICK_MS = 60_000;

function formatLastFetched(date: Date | null): string {
  if (!date) return 'carregando...';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'agora mesmo';
  if (diffMin === 1) return 'há 1 min';
  if (diffMin < 60) return `há ${diffMin} min`;
  return format(date, 'HH:mm', { locale: ptBR });
}

export interface LastUpdatedLabelProps {
  lastFetchedAt: Date | null;
}

export const LastUpdatedLabel = memo(function LastUpdatedLabel({
  lastFetchedAt,
}: LastUpdatedLabelProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="hidden text-[11px] text-[var(--ds-color-text-secondary)] sm:inline-flex items-center gap-1">
      <RefreshCw className="h-3 w-3" aria-hidden="true" />
      {formatLastFetched(lastFetchedAt)}
    </span>
  );
});
