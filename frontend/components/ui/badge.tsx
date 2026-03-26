import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const VARIANT_ICONS: Record<string, string> = {
  success: '✓',
  warning: '⚠',
  danger: '✕',
  info: 'ℹ',
};

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium',
  {
    variants: {
      variant: {
        primary: 'bg-[color:var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]',
        accent: 'bg-[color:var(--ds-color-accent-subtle)] text-[var(--ds-color-accent)]',
        success: 'bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success-fg)]',
        warning: 'bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning-fg)]',
        danger: 'bg-[color:var(--ds-color-danger-subtle)] text-[var(--ds-color-danger-fg)]',
        info: 'bg-[color:var(--ds-color-info-subtle)] text-[var(--ds-color-info-fg)]',
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
    VariantProps<typeof badgeVariants> {
  /** Exibe ícone semântico antes do texto (✓ ⚠ ✕ ℹ). Melhora acessibilidade para daltônicos. */
  showIcon?: boolean;
}

export function Badge({ className, variant, showIcon = false, children, ...props }: BadgeProps) {
  const icon = variant && showIcon ? VARIANT_ICONS[variant] : null;

  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
