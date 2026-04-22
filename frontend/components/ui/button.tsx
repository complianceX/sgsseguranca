import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border text-[13px] font-semibold leading-none shadow-none transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-color-bg-canvas)] disabled:pointer-events-none disabled:shadow-none',
  {
    variants: {
      variant: {
        default:
          'border-[var(--component-button-primary-bg)] bg-[var(--component-button-primary-bg)] text-[var(--component-button-primary-text)] hover:bg-[var(--component-button-primary-bg)] hover:border-[var(--component-button-primary-bg)] active:bg-[var(--component-button-primary-bg)] active:border-[var(--component-button-primary-bg)] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        primary:
          'border-[var(--component-button-primary-bg)] bg-[var(--component-button-primary-bg)] text-[var(--component-button-primary-text)] hover:bg-[var(--component-button-primary-bg)] hover:border-[var(--component-button-primary-bg)] active:bg-[var(--component-button-primary-bg)] active:border-[var(--component-button-primary-bg)] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        secondary:
          'border-[var(--component-button-secondary-border)] bg-[var(--component-button-secondary-bg)] text-[var(--component-button-secondary-text)] hover:border-[var(--component-button-secondary-border)] hover:bg-[var(--component-button-secondary-bg)] active:bg-[var(--component-button-secondary-bg)] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        outline:
          'border-[var(--component-button-outline-border)] bg-transparent text-[var(--ds-color-text-primary)] hover:border-[var(--component-button-outline-border)] hover:bg-transparent active:bg-transparent disabled:border-[var(--disabled-border)] disabled:bg-transparent disabled:text-[var(--disabled-text)]',
        ghost:
          'bg-transparent text-[var(--component-button-ghost-text)] hover:bg-transparent hover:text-[var(--component-button-ghost-text)] active:bg-transparent disabled:bg-transparent disabled:text-[var(--disabled-text)]',
        success:
          'border-[var(--component-button-success-bg)] bg-[var(--component-button-success-bg)] text-[var(--component-button-success-text)] hover:bg-[var(--component-button-success-bg)] hover:border-[var(--component-button-success-bg)] active:bg-[var(--component-button-success-bg)] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        warning:
          'border-[var(--component-button-warning-bg)] bg-[var(--component-button-warning-bg)] text-[var(--component-button-warning-text)] hover:bg-[var(--component-button-warning-bg)] hover:border-[var(--component-button-warning-bg)] active:bg-[var(--component-button-warning-bg)] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        info:
          'border-[var(--component-button-info-bg,var(--ds-color-info))] bg-[var(--component-button-info-bg,var(--ds-color-info))] text-[var(--component-button-info-text,var(--ds-color-text-inverse))] hover:bg-[var(--component-button-info-bg,var(--ds-color-info))] hover:border-[var(--component-button-info-bg,var(--ds-color-info))] active:bg-[var(--component-button-info-bg,var(--ds-color-info))] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        destructive:
          'border-[var(--component-button-danger-bg)] bg-[var(--component-button-danger-bg)] text-[var(--component-button-danger-text)] hover:bg-[var(--component-button-danger-bg)] hover:border-[var(--component-button-danger-bg)] active:bg-[var(--component-button-danger-bg)] disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
        link:
          '!h-auto !rounded-none !border-transparent !bg-transparent !px-0 !py-0 text-[var(--ds-color-action-primary)] hover:text-[var(--ds-color-action-primary)] disabled:text-[var(--disabled-text)] disabled:no-underline',
      },
      size: {
        sm: 'h-8 px-3 text-[11px]',
        md: 'h-9 px-4 text-[13px]',
        lg: 'h-10 px-5 text-sm',
        icon: 'h-9 w-9 rounded-[10px] p-0',
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
        {loading && <Loader2 className="h-4 w-4" />}
        {!loading && leftIcon && <span>{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span>{rightIcon}</span>}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
