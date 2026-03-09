import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const textareaVariants = cva(
  'flex min-h-28 w-full rounded-[var(--ds-radius-md)] border px-3.5 py-3 text-sm font-medium transition-all duration-[var(--ds-motion-base)] outline-none placeholder:text-[var(--ds-color-text-muted)] disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      tone: {
        default:
          'border-[var(--ds-color-border-strong)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ds-color-bg-canvas)_78%,var(--ds-color-surface-base)_22%),color-mix(in_srgb,var(--ds-color-surface-base)_90%,transparent))] text-[var(--ds-color-text-primary)] shadow-[0_10px_24px_rgba(15,23,42,0.14)] focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]',
        subtle:
          'border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)]/92 text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]',
      },
    },
    defaultVariants: {
      tone: 'default',
    },
  },
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, tone, ...props }, ref) => (
    <textarea ref={ref} className={cn(textareaVariants({ tone }), className)} {...props} />
  ),
);

Textarea.displayName = 'Textarea';

export { Textarea };
