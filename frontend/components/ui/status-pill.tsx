import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const statusToneMap = {
  neutral:
    'border-[color:var(--component-status-pill-neutral-border,#5A7A9E)] bg-[color:var(--ds-color-surface-muted)]/32 text-[var(--ds-color-text-secondary)]',
  primary:
    'border-[color:var(--ds-color-action-primary)]/20 bg-[color:var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]',
  info: 'border-[color:var(--ds-color-info)]/18 bg-[color:var(--ds-color-info-subtle)] text-[var(--ds-color-info)]',
  success:
    'border-[color:var(--ds-color-success)]/20 bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success)]',
  warning:
    'border-[color:var(--ds-color-warning)]/20 bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]',
  danger:
    'border-[color:var(--ds-color-danger)]/20 bg-[color:var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]',
} as const;

const statusPillVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none tracking-[0.01em]',
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
  'rounded-full border px-3 py-1 text-xs font-semibold outline-none transition-colors focus:border-[var(--ds-color-focus)] focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]',
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
  ...props
}: StatusPillProps) {
  return (
    <span
      className={cn(statusPillVariants({ tone, size }), className)}
      {...props}
    />
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
