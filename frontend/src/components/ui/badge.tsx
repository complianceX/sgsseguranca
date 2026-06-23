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
        /** Alias de `neutral` — para novos usos prefira `neutral` */
        default:
          'border-[color:var(--component-badge-neutral-border)] bg-[color:var(--component-badge-neutral-bg)] text-[var(--component-badge-neutral-text)]',
        neutral:
          'border-[color:var(--component-badge-neutral-border)] bg-[color:var(--component-badge-neutral-bg)] text-[var(--component-badge-neutral-text)]',
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
        /** Variante outline — fundo transparente, apenas borda */
        outline:
          'border-[color:var(--ds-color-border-default)] bg-transparent text-[var(--ds-color-text-secondary)] shadow-none',
        /** Variante outline colorida por slot adicional — ver `outlineTone` */
        'outline-primary':
          'border-[var(--ds-color-action-primary)] bg-transparent text-[var(--ds-color-action-primary)] shadow-none',
        'outline-success':
          'border-[var(--ds-color-success-border)] bg-transparent text-[var(--ds-color-success-fg)] shadow-none',
        'outline-warning':
          'border-[var(--ds-color-warning-border)] bg-transparent text-[var(--ds-color-warning-fg)] shadow-none',
        'outline-danger':
          'border-[var(--ds-color-danger-border)] bg-transparent text-[var(--ds-color-danger-fg)] shadow-none',
        'outline-info':
          'border-[var(--ds-color-info-border)] bg-transparent text-[var(--ds-color-info-fg)] shadow-none',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-2.5 py-1 text-[11px]',
        lg: 'px-3 py-1.5 text-xs',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'md',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Exibe ícone semântico antes do texto (✓ ⚠ ✕ ℹ). Melhora acessibilidade para daltônicos. */
  showIcon?: boolean;
}

export function Badge({
  className,
  variant,
  size,
  showIcon = false,
  children,
  ...props
}: BadgeProps) {
  const icon =
    variant && showIcon && variant in VARIANT_ICONS
      ? VARIANT_ICONS[variant as string]
      : null;

  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {icon ? (
        <span aria-hidden="true" className="text-[0.625rem] leading-none opacity-80">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
