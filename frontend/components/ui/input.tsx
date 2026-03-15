import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'flex h-10 w-full rounded-[var(--ds-radius-md)] border px-3 text-[13px] font-medium transition-all duration-[var(--ds-motion-base)] outline-none placeholder:text-[var(--component-field-placeholder)] disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      tone: {
        default:
          'border-[var(--component-field-border)] bg-[color:var(--ds-color-surface-muted)] text-[var(--component-field-text)] focus:border-[var(--component-field-border-focus)] focus:shadow-[var(--component-field-shadow-focus)]',
        subtle:
          'border-[var(--component-field-border-subtle)] bg-[color:var(--component-field-bg-subtle)] text-[var(--component-field-text)] focus:border-[var(--component-field-border-focus)] focus:shadow-[var(--component-field-shadow-focus)]',
      },
    },
    defaultVariants: {
      tone: 'default',
    },
  },
);

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, tone, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(inputVariants({ tone }), className)}
      {...props}
    />
  ),
);

Input.displayName = 'Input';

export { Input };
