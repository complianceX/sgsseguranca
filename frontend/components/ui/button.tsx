import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[var(--ds-radius-md)] text-[13px] font-semibold leading-none transition-all duration-[var(--ds-motion-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] disabled:pointer-events-none disabled:opacity-50 shadow-[var(--ds-shadow-sm)] active:translate-y-0',
  {
    variants: {
      variant: {
        default:
          'bg-[image:var(--component-button-primary-bg)] text-[var(--component-button-primary-text)] hover:-translate-y-px hover:brightness-105 hover:shadow-[var(--ds-shadow-md)]',
        primary:
          'bg-[image:var(--component-button-primary-bg)] text-[var(--component-button-primary-text)] hover:-translate-y-px hover:brightness-105 hover:shadow-[var(--ds-shadow-md)]',
        success:
          'bg-[image:var(--component-button-success-bg)] text-[var(--component-button-success-text)] hover:-translate-y-px hover:brightness-105 hover:shadow-[var(--ds-shadow-md)]',
        warning:
          'bg-[image:var(--component-button-warning-bg)] text-[var(--component-button-warning-text)] hover:-translate-y-px hover:brightness-105 hover:shadow-[var(--ds-shadow-md)]',
        secondary:
          'border border-[var(--component-button-secondary-border)] bg-[image:var(--component-button-secondary-bg)] text-[var(--component-button-secondary-text)] hover:-translate-y-px hover:border-[var(--color-border-strong)] hover:bg-[color:var(--component-button-secondary-bg-hover)]',
        destructive:
          'bg-[image:var(--component-button-danger-bg)] text-[var(--component-button-danger-text)] hover:-translate-y-px hover:brightness-105 hover:shadow-[var(--ds-shadow-md)]',
        ghost:
          'bg-transparent text-[var(--component-button-ghost-text)] shadow-none hover:bg-[color:var(--component-button-ghost-bg-hover)] hover:text-[var(--color-text)]',
        outline:
          'border border-[var(--color-border-strong)] bg-[color:var(--color-surface)]/92 text-[var(--color-text)] hover:bg-[color:var(--color-surface-elevated)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
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
