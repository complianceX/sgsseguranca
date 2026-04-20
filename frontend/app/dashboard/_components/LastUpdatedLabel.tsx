"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type LastUpdatedLabelProps = {
  lastUpdatedAt: Date | null;
};

const TICK_MS = 60_000;

function LastUpdatedLabelComponent({ lastUpdatedAt }: LastUpdatedLabelProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(new Date());
    }, TICK_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const label = useMemo(() => {
    if (!lastUpdatedAt) {
      return "ainda não atualizado";
    }

    const nowTime = now.getTime();
    if (lastUpdatedAt.getTime() > nowTime) {
      return "atualizado há pouco";
    }

    const distance = formatDistanceToNow(lastUpdatedAt, {
      locale: ptBR,
      addSuffix: true,
    });

    return `atualizado ${distance}`;
  }, [lastUpdatedAt, now]);

  return (
    <span className="hidden text-[11px] text-[var(--ds-color-text-secondary)] sm:inline-flex items-center gap-1">
      {label}
    </span>
  );
}

export const LastUpdatedLabel = memo(LastUpdatedLabelComponent);
