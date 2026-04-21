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
  [
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
    'text-[11px] font-semibold leading-none tracking-[0.01em]',
    'shadow-[var(--component-badge-shadow)]',
  ],
  {
    variants: {
      variant: {
        primary:
          'border-[color:var(--component-badge-primary-border)] bg-[color:var(--component-badge-primary-bg,var(--ds-color-primary-subtle))] text-[var(--component-badge-primary-text,var(--ds-color-action-primary))]',
        accent:
          'border-[var(--ds-color-accent-border)] bg-[color:var(--ds-color-accent-subtle)] text-[var(--ds-color-accent)]',
        success:
          'border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success-fg)]',
        warning:
          'border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning-fg)]',
        danger:
          'border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--ds-color-danger-fg)]',
        info:
          'border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] text-[var(--ds-color-info-fg)]',
        neutral:
          'border-[color:var(--component-badge-neutral-border)] bg-[color:var(--component-badge-neutral-bg)] text-[var(--component-badge-neutral-text)]',
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
      {icon && (
        <span aria-hidden="true" className="text-[0.625rem] leading-none opacity-80">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
