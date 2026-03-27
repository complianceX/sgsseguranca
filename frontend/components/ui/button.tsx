import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--ds-radius-md)] border border-transparent text-[13px] font-semibold leading-none transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--ds-motion-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-color-bg-canvas)] disabled:pointer-events-none disabled:shadow-none',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--component-button-primary-bg)] text-[var(--component-button-primary-text)] hover:bg-[var(--component-button-primary-hover-bg)] active:bg-[var(--ds-color-action-primary-active)] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        primary:
          'bg-[var(--component-button-primary-bg)] text-[var(--component-button-primary-text)] hover:bg-[var(--component-button-primary-hover-bg)] active:bg-[var(--ds-color-action-primary-active)] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        secondary:
          'border-[var(--component-button-secondary-border)] bg-[var(--component-button-secondary-bg)] text-[var(--component-button-secondary-text)] hover:border-[var(--color-border-strong)] hover:bg-[var(--component-button-secondary-bg-hover)] active:bg-[var(--ds-color-action-secondary-active)] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        outline:
          'border-[var(--component-button-outline-border)] bg-transparent text-[var(--ds-color-text-primary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--ds-color-surface-muted)] active:bg-[var(--ds-color-bg-subtle)] disabled:border-[var(--disabled-border)] disabled:bg-transparent disabled:text-[var(--disabled-text)]',
        ghost:
          'bg-transparent text-[var(--component-button-ghost-text)] hover:bg-[var(--component-button-ghost-bg-hover)] hover:text-[var(--ds-color-text-primary)] active:bg-[var(--ds-color-primary-subtle-hover)] disabled:bg-transparent disabled:text-[var(--disabled-text)]',
        success:
          'bg-[var(--component-button-success-bg)] text-[var(--component-button-success-text)] hover:bg-[var(--ds-color-success-hover)] active:bg-[var(--ds-color-success-hover)] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        warning:
          'bg-[var(--component-button-warning-bg)] text-[var(--component-button-warning-text)] hover:bg-[var(--ds-color-warning-hover)] active:bg-[var(--ds-color-warning-hover)] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        info:
          'bg-[var(--component-button-info-bg,var(--ds-color-info))] text-[var(--component-button-info-text,var(--ds-color-text-inverse))] hover:bg-[var(--component-button-info-hover-bg,var(--ds-color-info-hover))] active:bg-[var(--component-button-info-active-bg,var(--ds-color-info-hover))] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        destructive:
          'bg-[var(--component-button-danger-bg)] text-[var(--component-button-danger-text)] hover:bg-[var(--ds-color-danger-hover)] active:bg-[var(--ds-color-danger-hover)] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        link:
          '!h-auto !rounded-none !border-transparent !bg-transparent !px-0 !py-0 text-[var(--ds-color-action-primary)] hover:text-[var(--ds-color-action-primary-hover)] hover:underline underline-offset-4 disabled:text-[var(--disabled-text)] disabled:no-underline',
      },
      size: {
        sm: 'h-8 px-2.5 text-[11px]',
        md: 'h-9 px-3.5 text-[13px]',
        lg: 'h-10 px-5 text-sm',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
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
  ({ className, variant, size, loading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    const isDisabled = loading || disabled;

    return (
      <button
        {...props}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
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
