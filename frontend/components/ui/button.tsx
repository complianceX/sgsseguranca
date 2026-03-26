import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[var(--ds-radius-md)] text-[13px] font-semibold leading-none transition-all duration-[var(--ds-motion-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--ds-color-action-primary)] text-[var(--component-button-primary-text)] hover:bg-[var(--ds-color-action-primary-hover)]',
        primary:
          'bg-[var(--ds-color-action-primary)] text-[var(--component-button-primary-text)] hover:bg-[var(--ds-color-action-primary-hover)]',
        success:
          'bg-[var(--ds-color-success)] text-[var(--component-button-success-text)] hover:bg-[var(--ds-color-success-hover)]',
        warning:
          'bg-[var(--ds-color-warning)] text-[var(--component-button-warning-text)] hover:bg-[var(--ds-color-warning-hover)]',
        secondary:
          'border border-[var(--component-button-secondary-border)] bg-[var(--ds-color-surface-base)] text-[var(--component-button-secondary-text)] hover:border-[var(--color-border-strong)] hover:bg-[color:var(--component-button-secondary-bg-hover)]',
        destructive:
          'bg-[var(--ds-color-danger)] text-[var(--component-button-danger-text)] hover:bg-[var(--ds-color-danger-hover)]',
        ghost:
          'bg-transparent text-[var(--component-button-ghost-text)] hover:bg-[color:var(--component-button-ghost-bg-hover)] hover:text-[var(--color-text)]',
        outline:
          'border border-[color:var(--component-button-outline-border,#9CAEC2)] bg-[color:var(--color-surface)] text-[var(--color-text)] hover:bg-[color:var(--color-surface-elevated)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
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
