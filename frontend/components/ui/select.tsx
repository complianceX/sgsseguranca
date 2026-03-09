import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const selectVariants = cva(
  'flex h-11 w-full appearance-none rounded-[var(--ds-radius-md)] border px-3.5 pr-10 text-sm font-medium transition-all duration-[var(--ds-motion-base)] outline-none disabled:cursor-not-allowed disabled:opacity-60',
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

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement>,
    VariantProps<typeof selectVariants> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, tone, children, ...props }, ref) => (
    <div className="relative w-full">
      <select ref={ref} className={cn(selectVariants({ tone }), className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
    </div>
  ),
);

Select.displayName = 'Select';

export { Select };
