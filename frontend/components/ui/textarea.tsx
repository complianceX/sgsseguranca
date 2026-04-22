import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const textareaVariants = cva(
  'flex min-h-24 w-full rounded-[var(--ds-radius-md)] border px-3 py-2.5 text-[13px] font-semibold outline-none placeholder:text-[var(--component-field-placeholder)] disabled:cursor-not-allowed disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)] disabled:placeholder:text-[var(--disabled-text)] disabled:shadow-none',
  {
    variants: {
      tone: {
        default:
          'border-[var(--component-field-border)] bg-[color:var(--component-field-bg)] text-[var(--component-field-text)] shadow-[var(--component-field-shadow)] focus:border-[var(--component-field-border-focus)] focus:shadow-[var(--component-field-shadow-focus)]',
        subtle:
          'border-[var(--component-field-border-subtle)] bg-[color:var(--component-field-bg-subtle)] text-[var(--component-field-text)] focus:border-[var(--component-field-border-focus)] focus:shadow-[var(--component-field-shadow-focus)]',
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
