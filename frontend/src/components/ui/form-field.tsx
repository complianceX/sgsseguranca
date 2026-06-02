import * as React from 'react';
import { cn } from '@/lib/utils';

export function FormField({
  label,
  htmlFor,
  error,
  description,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  description?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="space-y-1">
        <label
          htmlFor={htmlFor}
          className="text-sm font-semibold tracking-[-0.01em] text-[var(--ds-color-text-secondary)]"
        >
          {label}
          {required ? (
            <span className="ml-1 text-[var(--ds-color-danger)]" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {description ? (
          <p className="text-xs text-[var(--ds-color-text-muted)]">{description}</p>
        ) : null}
      </div>
      {children}
      {error ? <p className="text-xs font-medium text-[var(--ds-color-danger)]">{error}</p> : null}
    </div>
  );
}
