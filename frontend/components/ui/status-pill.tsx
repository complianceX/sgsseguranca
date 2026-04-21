import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const statusToneMap = {
  neutral:
    'border-[color:var(--component-status-pill-neutral-border)] bg-[color:var(--component-status-pill-neutral-bg)] text-[var(--component-status-pill-neutral-text)]',
  primary:
    'border-[color:var(--component-status-pill-primary-border,var(--ds-color-primary-border))] bg-[color:var(--component-status-pill-primary-bg,var(--ds-color-primary-subtle))] text-[var(--component-status-pill-primary-text,var(--ds-color-action-primary))]',
  info: 'border-[color:var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] text-[var(--ds-color-info-fg)]',
  success:
    'border-[color:var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success-fg)]',
  warning:
    'border-[color:var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning-fg)]',
  danger:
    'border-[color:var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--ds-color-danger-fg)]',
} as const;

const statusDotMap = {
  neutral: 'bg-[var(--component-status-pill-neutral-text)]',
  primary: 'bg-[var(--component-status-pill-primary-text,var(--ds-color-action-primary))]',
  info: 'bg-[var(--ds-color-info)]',
  success: 'bg-[var(--ds-color-success)]',
  warning: 'bg-[var(--ds-color-warning)]',
  danger: 'bg-[var(--ds-color-danger)]',
} as const;

const statusPillVariants = cva(
  [
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
    'text-xs font-semibold leading-none tracking-[0.01em]',
    'shadow-[var(--component-badge-shadow)]',
  ],
  {
    variants: {
      tone: statusToneMap,
      size: {
        sm: 'px-2.5 py-1 text-[11px]',
        md: 'px-3 py-1.5 text-xs',
      },
    },
    defaultVariants: {
      tone: 'neutral',
      size: 'sm',
    },
  },
);

const statusSelectVariants = cva(
  [
    'rounded-full border px-3 py-1 text-xs font-semibold outline-none',
    'shadow-[var(--component-badge-shadow)]',
    'transition-colors focus:border-[var(--ds-color-focus)]',
    'focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]',
  ],
  {
    variants: {
      tone: statusToneMap,
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusPillVariants> {}

interface StatusSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof statusSelectVariants> {}

export function StatusPill({
  className,
  tone,
  size,
  children,
  ...props
}: StatusPillProps) {
  const resolvedTone = tone ?? 'neutral';

  return (
    <span
      className={cn(statusPillVariants({ tone, size }), className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn('h-2 w-2 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.14)]', statusDotMap[resolvedTone])}
      />
      {children}
    </span>
  );
}

export function StatusSelect({
  className,
  tone,
  children,
  ...props
}: StatusSelectProps) {
  return (
    <select
      className={cn(statusSelectVariants({ tone }), className)}
      {...props}
    >
      {children}
    </select>
  );
}

export type StatusTone = keyof typeof statusToneMap;
