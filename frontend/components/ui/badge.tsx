import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium tracking-[0.01em]',
  {
    variants: {
      variant: {
        primary: 'bg-[color:var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]',
        accent: 'bg-[color:var(--ds-color-accent-subtle)] text-[var(--ds-color-accent)]',
        success: 'bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success)]',
        warning: 'bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]',
        danger: 'bg-[color:var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]',
        info: 'bg-[color:var(--ds-color-info-subtle)] text-[var(--ds-color-info)]',
        neutral:
          'bg-[color:var(--component-badge-neutral-bg)] text-[var(--component-badge-neutral-text)]',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
