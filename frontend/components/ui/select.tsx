import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const selectVariants = cva(
  'peer flex h-10 w-full appearance-none rounded-[var(--ds-radius-md)] border px-3 pr-9 text-[13px] font-semibold outline-none disabled:cursor-not-allowed disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)] disabled:shadow-none',
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

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement>,
    VariantProps<typeof selectVariants> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, tone, children, style, ...props }, ref) => (
    <div className="relative w-full">
      <select
        ref={ref}
        style={{ ...style, backgroundImage: 'none' }}
        className={cn(selectVariants({ tone }), className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--component-field-placeholder)] peer-disabled:text-[var(--disabled-text)]" />
    </div>
  ),
);

Select.displayName = 'Select';

export { Select };
