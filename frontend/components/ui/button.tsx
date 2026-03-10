import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[var(--ds-radius-md)] text-[13px] font-semibold leading-none transition-all duration-[var(--ds-motion-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-color-bg-canvas)] disabled:pointer-events-none disabled:opacity-50 shadow-[var(--ds-shadow-sm)] active:translate-y-0',
  {
    variants: {
      variant: {
        default:
          'bg-[image:var(--ds-gradient-brand)] text-[var(--ds-color-action-primary-foreground)] hover:-translate-y-px hover:brightness-105 hover:shadow-[var(--ds-shadow-md)]',
        primary:
          'bg-[image:var(--ds-gradient-brand)] text-[var(--ds-color-action-primary-foreground)] hover:-translate-y-px hover:brightness-105 hover:shadow-[var(--ds-shadow-md)]',
        success:
          'bg-gradient-to-r from-[var(--ds-color-success)] to-[color:color-mix(in_srgb,var(--ds-color-success-hover)_78%,#0f766e_22%)] text-white hover:-translate-y-px hover:brightness-105 hover:shadow-[var(--ds-shadow-md)]',
        warning:
          'bg-gradient-to-r from-[var(--ds-color-warning)] to-[color:color-mix(in_srgb,var(--ds-color-warning-hover)_76%,#c2410c_24%)] text-white hover:-translate-y-px hover:brightness-105 hover:shadow-[var(--ds-shadow-md)]',
        secondary:
          'border border-[var(--ds-color-border-subtle)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ds-color-surface-elevated)_84%,white_16%),color-mix(in_srgb,var(--ds-color-surface-base)_95%,transparent))] text-[var(--ds-color-text-primary)] hover:-translate-y-px hover:border-[var(--ds-color-border-strong)] hover:bg-[var(--ds-color-action-secondary-hover)]/65',
        destructive:
          'bg-gradient-to-r from-[var(--ds-color-danger)] to-[color:color-mix(in_srgb,var(--ds-color-danger-hover)_84%,#7f1d1d_16%)] text-white hover:-translate-y-px hover:brightness-105 hover:shadow-[var(--ds-shadow-md)]',
        ghost:
          'bg-transparent text-[var(--ds-color-text-secondary)] shadow-none hover:bg-[var(--ds-color-primary-subtle)] hover:text-[var(--ds-color-text-primary)]',
        outline:
          'border border-[var(--ds-color-border-strong)] bg-[color:var(--ds-color-surface-base)]/92 text-[var(--ds-color-text-primary)] hover:bg-[var(--ds-color-surface-elevated)] hover:border-[var(--ds-color-action-primary)] hover:text-[var(--ds-color-action-primary)]',
      },
      size: {
        sm: 'h-8 px-2.5 text-[11px]',
        md: 'h-9 px-3.5 text-[13px]',
        lg: 'h-10 px-5 text-sm',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, leftIcon, rightIcon, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!loading && leftIcon && <span>{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span>{rightIcon}</span>}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
