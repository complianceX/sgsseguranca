import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SummaryMetricTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';

const toneMap: Record<
  SummaryMetricTone,
  { container: string; label: string; value: string; note: string }
> = {
  neutral: {
    container:
      'border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]',
    label: 'text-[var(--ds-color-text-secondary)]',
    value: 'text-[var(--ds-color-text-primary)]',
    note: 'text-[var(--ds-color-text-muted)]',
  },
  primary: {
    container:
      'border-[var(--ds-color-primary-border)] bg-[var(--ds-color-primary-subtle)]/42',
    label: 'text-[var(--ds-color-action-primary)]',
    value: 'text-[var(--ds-color-text-primary)]',
    note: 'text-[var(--ds-color-text-secondary)]',
  },
  info: {
    container:
      'border-[var(--ds-color-info-border)] bg-[var(--ds-color-info-subtle)]',
    label: 'text-[var(--ds-color-info-fg)]',
    value: 'text-[var(--ds-color-info-fg)]',
    note: 'text-[color:var(--ds-color-info-fg)]/88',
  },
  success: {
    container:
      'border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)]',
    label: 'text-[var(--ds-color-success-fg)]',
    value: 'text-[var(--ds-color-success-fg)]',
    note: 'text-[color:var(--ds-color-success-fg)]/88',
  },
  warning: {
    container:
      'border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)]',
    label: 'text-[var(--ds-color-warning-fg)]',
    value: 'text-[var(--ds-color-warning-fg)]',
    note: 'text-[color:var(--ds-color-warning-fg)]/88',
  },
  danger: {
    container:
      'border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)]',
    label: 'text-[var(--ds-color-danger-fg)]',
    value: 'text-[var(--ds-color-danger-fg)]',
    note: 'text-[color:var(--ds-color-danger-fg)]/88',
  },
};

export function SummaryMetricCard({
  label,
  value,
  note,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: SummaryMetricTone;
  className?: string;
}) {
  const styles = toneMap[tone];

  return (
    <div
      className={cn(
        'rounded-[var(--ds-radius-xl)] border px-4 py-3 shadow-[var(--ds-shadow-xs)]',
        styles.container,
        className,
      )}
    >
      <p
        className={cn(
          'text-[10px] font-semibold uppercase tracking-[0.16em]',
          styles.label,
        )}
      >
        {label}
      </p>
      <div
        className={cn(
          'mt-2 text-base font-semibold leading-tight break-words',
          styles.value,
        )}
      >
        {value}
      </div>
      {note ? (
        <p className={cn('mt-1.5 text-xs leading-5', styles.note)}>{note}</p>
      ) : null}
    </div>
  );
}
