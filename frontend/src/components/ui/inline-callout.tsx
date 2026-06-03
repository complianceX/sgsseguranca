import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type InlineCalloutTone = 'info' | 'warning' | 'danger' | 'success';

const toneStyles: Record<
  InlineCalloutTone,
  { shell: string; icon: string; title: string; description: string }
> = {
  info: {
    shell:
      'border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)]/72 text-[var(--ds-color-text-primary)]',
    icon:
      'border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info)]/12 text-[var(--ds-color-info)]',
    title: 'text-[var(--ds-color-text-primary)]',
    description: 'text-[var(--ds-color-text-secondary)]',
  },
  warning: {
    shell:
      'border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)]/76 text-[var(--ds-color-text-primary)]',
    icon:
      'border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning)]/12 text-[var(--ds-color-warning)]',
    title: 'text-[var(--ds-color-text-primary)]',
    description: 'text-[var(--ds-color-text-secondary)]',
  },
  danger: {
    shell:
      'border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)]/72 text-[var(--ds-color-text-primary)]',
    icon:
      'border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger)]/12 text-[var(--ds-color-danger)]',
    title: 'text-[var(--ds-color-text-primary)]',
    description: 'text-[var(--ds-color-text-secondary)]',
  },
  success: {
    shell:
      'border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)]/72 text-[var(--ds-color-text-primary)]',
    icon:
      'border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success)]/12 text-[var(--ds-color-success)]',
    title: 'text-[var(--ds-color-text-primary)]',
    description: 'text-[var(--ds-color-text-secondary)]',
  },
};

interface InlineCalloutProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: InlineCalloutTone;
  action?: ReactNode;
  className?: string;
}

export function InlineCallout({
  title,
  description,
  icon,
  tone = 'info',
  action,
  className,
}: InlineCalloutProps) {
  const styles = toneStyles[tone];

  return (
    <div
      className={cn(
        'mx-4 mt-4 flex flex-wrap items-start justify-between gap-3 rounded-[var(--ds-radius-lg)] border px-4 py-3.5',
        styles.shell,
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon ? (
          <div
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
              styles.icon,
            )}
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold', styles.title)}>{title}</p>
          {description ? (
            <div className={cn('mt-1 text-sm leading-6', styles.description)}>
              {description}
            </div>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
