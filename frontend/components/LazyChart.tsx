'use client';

import { cn } from '@/lib/utils';

interface LazyChartProps {
  height: number;
  className?: string;
}

export function LazyChart({ height, className }: LazyChartProps) {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-[var(--ds-radius-lg)] bg-[var(--ds-color-surface-muted)]/35',
        className,
      )}
      style={{ height }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex h-full items-end gap-2 px-4 py-4">
        <div className="h-[32%] flex-1 rounded-t-md bg-[var(--ds-color-surface-muted)]/90" />
        <div className="h-[56%] flex-1 rounded-t-md bg-[var(--ds-color-surface-muted)]/90" />
        <div className="h-[72%] flex-1 rounded-t-md bg-[var(--ds-color-surface-muted)]/90" />
        <div className="h-[48%] flex-1 rounded-t-md bg-[var(--ds-color-surface-muted)]/90" />
        <div className="h-[64%] flex-1 rounded-t-md bg-[var(--ds-color-surface-muted)]/90" />
      </div>
    </div>
  );
}
