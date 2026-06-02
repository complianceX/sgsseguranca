import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SummaryMetricTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';

const toneMap: Record<
  SummaryMetricTone,
  { container: string; dot: string; label: string; value: string; note: string }
> = {
  neutral: {
    container:
      'border-[var(--component-card-border)] bg-[color:var(--component-card-bg)]',
    dot: 'bg-[var(--ds-color-border-strong)]',
    label: 'text-[var(--ds-color-text-secondary)]',
    value: 'text-[var(--ds-color-text-primary)]',
    note: 'text-[var(--ds-color-text-muted)]',
  },
  primary: {
    container:
      'border-[var(--ds-color-primary-border)] bg-[color:color-mix(in_srgb,var(--ds-color-primary-subtle)_70%,var(--component-card-bg-elevated)_30%)]',
    dot: 'bg-[var(--ds-color-action-primary)]',
    label: 'text-[var(--ds-color-action-primary)]',
    value: 'text-[var(--ds-color-text-primary)]',
    note: 'text-[var(--ds-color-text-secondary)]',
  },
  info: {
    container:
      'border-[var(--ds-color-info-border)] bg-[color:color-mix(in_srgb,var(--ds-color-info-subtle)_84%,var(--component-card-bg-elevated)_16%)]',
    dot: 'bg-[var(--ds-color-info)]',
    label: 'text-[var(--ds-color-info-fg)]',
    value: 'text-[var(--ds-color-info-fg)]',
    note: 'text-[color:var(--ds-color-info-fg)]/88',
  },
  success: {
    container:
      'border-[var(--ds-color-success-border)] bg-[color:color-mix(in_srgb,var(--ds-color-success-subtle)_84%,var(--component-card-bg-elevated)_16%)]',
    dot: 'bg-[var(--ds-color-success)]',
    label: 'text-[var(--ds-color-success-fg)]',
    value: 'text-[var(--ds-color-success-fg)]',
    note: 'text-[color:var(--ds-color-success-fg)]/88',
  },
  warning: {
    container:
      'border-[var(--ds-color-warning-border)] bg-[color:color-mix(in_srgb,var(--ds-color-warning-subtle)_84%,var(--component-card-bg-elevated)_16%)]',
    dot: 'bg-[var(--ds-color-warning)]',
    label: 'text-[var(--ds-color-warning-fg)]',
    value: 'text-[var(--ds-color-warning-fg)]',
    note: 'text-[color:var(--ds-color-warning-fg)]/88',
  },
  danger: {
    container:
      'border-[var(--ds-color-danger-border)] bg-[color:color-mix(in_srgb,var(--ds-color-danger-subtle)_84%,var(--component-card-bg-elevated)_16%)]',
    dot: 'bg-[var(--ds-color-danger)]',
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
        [
          'relative overflow-hidden rounded-[var(--ds-radius-xl)] border px-4 py-3.5',
          'shadow-[var(--component-card-shadow)]',
          "before:content-[''] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[var(--component-card-topline)]",
        ],
        styles.container,
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('h-2.5 w-2.5 rounded-full', styles.dot)} aria-hidden="true" />
        <p
          className={cn(
            'text-[10px] font-semibold uppercase tracking-[0.16em]',
            styles.label,
          )}
        >
          {label}
        </p>
      </div>
      <div
        className={cn(
          'mt-2.5 text-base font-semibold leading-tight break-words',
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
