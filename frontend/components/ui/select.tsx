import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const selectVariants = cva(
  'flex h-10 w-full appearance-none rounded-[var(--ds-radius-md)] border px-3 pr-9 text-[13px] font-medium transition-all duration-[var(--ds-motion-base)] outline-none disabled:cursor-not-allowed disabled:opacity-60',
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

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement>,
    VariantProps<typeof selectVariants> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, tone, children, ...props }, ref) => (
    <div className="relative w-full">
      <select ref={ref} className={cn(selectVariants({ tone }), className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
    </div>
  ),
);

Select.displayName = 'Select';

export { Select };
