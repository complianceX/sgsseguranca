import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  'rounded-[var(--ds-radius-lg)] border shadow-[var(--ds-shadow-sm)] transition-all duration-[var(--ds-motion-base)] backdrop-blur-sm',
  {
    variants: {
      tone: {
        default:
          'border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)]',
        elevated:
          'border-[color:var(--ds-color-border-strong)]/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ds-color-surface-elevated)_88%,white_12%),color-mix(in_srgb,var(--ds-color-surface-base)_98%,transparent))] shadow-[var(--ds-shadow-md)]',
        muted:
          'border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/38',
      },
      interactive: {
        true: 'hover:-translate-y-px hover:border-[var(--ds-color-action-primary)]/45 hover:shadow-[var(--ds-shadow-md)]',
        false: '',
      },
      padding: {
        none: '',
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-5',
      },
    },
    defaultVariants: {
      tone: 'default',
      interactive: false,
      padding: 'md',
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

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        'text-[0.95rem] font-semibold tracking-[-0.02em] text-[var(--ds-color-text-primary)]',
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
    className={cn('text-[13px] leading-5 text-[var(--ds-color-text-muted)]', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mt-3', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'mt-4 flex items-center gap-2.5 border-t border-[var(--ds-color-border-subtle)] pt-3',
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
