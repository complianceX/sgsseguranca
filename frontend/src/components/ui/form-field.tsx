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
          <p id={htmlFor ? `${htmlFor}-description` : undefined} className="text-xs text-[var(--ds-color-text-muted)]">{description}</p>
        ) : null}
      </div>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            'aria-invalid': error ? 'true' : undefined,
            'aria-required': required ? 'true' : undefined,
            'aria-describedby': htmlFor
              ? [description && `${htmlFor}-description`, error && `${htmlFor}-error`]
                  .filter(Boolean)
                  .join(' ') || undefined
              : undefined,
          })
        : children}
      {error ? (
        <p
          id={htmlFor ? `${htmlFor}-error` : undefined}
          role="alert"
          aria-live="assertive"
          className="text-xs font-medium text-[var(--ds-color-danger)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
