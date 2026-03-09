import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-[var(--ds-radius-md)] font-semibold transition-all duration-[var(--ds-motion-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-color-bg-canvas)] disabled:pointer-events-none disabled:opacity-50 shadow-[var(--ds-shadow-sm)] active:translate-y-0',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-[var(--ds-color-action-primary)] to-[var(--primary-dark)] text-[var(--ds-color-action-primary-foreground)] hover:from-[var(--ds-color-action-primary-hover)] hover:to-[var(--ds-color-action-primary)] hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)]',
        primary:
          'bg-gradient-to-r from-[var(--ds-color-action-primary)] to-[var(--primary-dark)] text-[var(--ds-color-action-primary-foreground)] hover:from-[var(--ds-color-action-primary-hover)] hover:to-[var(--ds-color-action-primary)] hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)]',
        success:
          'bg-gradient-to-r from-[var(--ds-color-success)] to-[var(--ds-color-success-hover)] text-white hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)]',
        warning:
          'bg-gradient-to-r from-[var(--ds-color-warning)] to-[var(--ds-color-warning-hover)] text-[#111827] hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)]',
        secondary:
          'bg-[var(--ds-color-action-secondary)] text-[var(--ds-color-action-secondary-foreground)] hover:bg-[var(--ds-color-action-secondary-hover)] hover:border-[var(--ds-color-border-strong)]',
        destructive:
          'bg-gradient-to-r from-[var(--ds-color-danger)] to-[var(--ds-color-danger-hover)] text-white hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)]',
        ghost:
          'bg-transparent text-[var(--ds-color-text-secondary)] shadow-none hover:bg-[color:var(--ds-color-surface-muted)]/70 hover:text-[var(--ds-color-text-primary)]',
        outline:
          'border border-[var(--ds-color-border-strong)] bg-[color:var(--ds-color-surface-base)]/92 text-[var(--ds-color-text-primary)] hover:bg-[var(--ds-color-surface-elevated)] hover:border-[var(--ds-color-action-primary)] hover:text-[var(--ds-color-text-primary)]',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10 p-0',
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
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {!loading && leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span className="ml-2">{rightIcon}</span>}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
