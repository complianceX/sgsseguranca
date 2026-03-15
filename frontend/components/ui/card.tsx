import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  'rounded-[var(--ds-radius-lg)] border transition-all duration-[var(--ds-motion-base)]',
  {
    variants: {
      tone: {
        default:
          'border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] shadow-[var(--ds-shadow-xs)]',
        elevated:
          'border-[var(--component-card-border)] bg-[color:var(--ds-color-surface-base)] shadow-[var(--ds-shadow-sm)]',
        muted:
          'border-[var(--component-card-border)] bg-[color:var(--ds-color-surface-muted)] shadow-none',
        accent:
          'border-[var(--component-card-border)] bg-[color:var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)] border-l-[3px] border-l-[var(--color-primary)]',
        ghost:
          'border-[var(--component-card-border)]/60 bg-transparent shadow-none',
        stat:
          'border-[var(--component-card-border)] bg-[color:var(--ds-color-surface-base)] shadow-none',
      },
      interactive: {
        true: [
          'cursor-pointer select-none',
          'hover:border-[var(--color-primary)]/35',
          'hover:shadow-[var(--ds-shadow-sm)]',
        ],
        false: '',
      },
      padding: {
        none: '',
        xs: 'p-3',
        sm: 'p-4',
        md: 'p-5',
        lg: 'p-6',
        xl: 'p-8',
      },
    },
    defaultVariants: {
      tone: 'default',
      interactive: false,
      padding: 'sm',
    },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, tone, interactive, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ tone, interactive, padding }), className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

/** Cabeçalho do card — suporta layout coluna (padrão) ou linha (md:flex-row) */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col gap-1.5', className)}
      {...props}
    />
  ),
);
CardHeader.displayName = 'CardHeader';

/** Eyebrow — label de contexto acima do título (ex: "COCKPIT OPERACIONAL") */
const CardEyebrow = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        'text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-primary)]',
        className,
      )}
      {...props}
    />
  ),
);
CardEyebrow.displayName = 'CardEyebrow';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        'text-[1rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-text-primary)]',
        className,
      )}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-[0.8125rem] leading-[1.45] text-[var(--color-text-muted)]', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mt-4', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

/** Divisor interno — separa seções dentro do card */
const CardDivider = React.forwardRef<HTMLHRElement, React.HTMLAttributes<HTMLHRElement>>(
  ({ className, ...props }, ref) => (
    <hr
      ref={ref}
      className={cn('my-4 border-0 border-t border-[var(--color-border-subtle)]', className)}
      {...props}
    />
  ),
);
CardDivider.displayName = 'CardDivider';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'mt-5 flex items-center gap-2.5 border-t border-[var(--color-border-subtle)] pt-4',
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export {
  Card,
  CardHeader,
  CardEyebrow,
  CardTitle,
  CardDescription,
  CardContent,
  CardDivider,
  CardFooter,
};
