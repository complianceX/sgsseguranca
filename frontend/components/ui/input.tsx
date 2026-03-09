import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'flex h-11 w-full rounded-[var(--ds-radius-md)] border px-3.5 text-sm font-medium transition-all duration-[var(--ds-motion-base)] outline-none placeholder:text-[var(--ds-color-text-muted)] disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      tone: {
        default:
          'border-[var(--ds-color-border-default)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ds-color-surface-elevated)_84%,white_16%),color-mix(in_srgb,var(--ds-color-surface-base)_96%,transparent))] text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-sm)] focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]',
        subtle:
          'border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)]/96 text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]',
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
