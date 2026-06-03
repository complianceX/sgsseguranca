'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TICK_MS = 60_000;

function resolveGreeting(hour: number): string {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function computeSnapshot(): { greeting: string; dateLabel: string; hour: number } {
  const now = new Date();
  const hour = now.getHours();
  return {
    greeting: resolveGreeting(hour),
    dateLabel: format(now, "EEEE, dd 'de' MMMM", { locale: ptBR }),
    hour,
  };
}

export interface DynamicGreeting {
  greeting: string;
  dateLabel: string;
  hour: number;
}

export function useDynamicGreeting(): DynamicGreeting {
  const [snapshot, setSnapshot] = useState<DynamicGreeting>(() => computeSnapshot());

  useEffect(() => {
    const id = setInterval(() => {
      setSnapshot((prev) => {
        const next = computeSnapshot();
        if (
          prev.greeting === next.greeting &&
          prev.dateLabel === next.dateLabel &&
          prev.hour === next.hour
        ) {
          return prev;
        }
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, []);

  return snapshot;
}
