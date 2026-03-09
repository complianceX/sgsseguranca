import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  'rounded-[var(--ds-radius-lg)] border shadow-[var(--ds-shadow-sm)] transition-all duration-[var(--ds-motion-base)] backdrop-blur-sm',
  {
    variants: {
      tone: {
        default:
          'border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)]/96',
        elevated:
          'border-[color:var(--ds-color-border-strong)]/80 bg-gradient-to-b from-[color:var(--ds-color-surface-elevated)] to-[color:var(--ds-color-surface-base)] shadow-[var(--ds-shadow-md)]',
        muted:
          'border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/45',
      },
      interactive: {
        true: 'hover:-translate-y-px hover:border-[var(--ds-color-action-primary)]/60 hover:shadow-[var(--ds-shadow-md)]',
        false: '',
      },
      padding: {
        none: '',
        sm: 'p-4',
        md: 'p-5',
        lg: 'p-6',
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
    <div ref={ref} className={cn('flex flex-col gap-1.5', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        'text-base font-semibold tracking-[-0.02em] text-[var(--ds-color-text-primary)]',
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
    className={cn('text-sm leading-6 text-[var(--ds-color-text-muted)]', className)}
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

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'mt-5 flex items-center gap-3 border-t border-[var(--ds-color-border-subtle)] pt-4',
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
