import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  description?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Tamanho do label — padrão é `md` */
  labelSize?: 'sm' | 'md';
  /** Oculta o label visualmente mas mantém para leitores de tela */
  labelSrOnly?: boolean;
}

export function FormField({
  label,
  htmlFor,
  error,
  description,
  required,
  className,
  children,
  labelSize = 'md',
  labelSrOnly = false,
}: FormFieldProps) {
  const hasError = Boolean(error);
  const descriptionId = htmlFor && description ? `${htmlFor}-description` : undefined;
  const errorId = htmlFor && hasError ? `${htmlFor}-error` : undefined;

  const describedBy =
    htmlFor
      ? [descriptionId, errorId].filter(Boolean).join(' ') || undefined
      : undefined;

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="space-y-1">
        <label
          htmlFor={htmlFor}
          className={cn(
            'font-semibold tracking-[-0.01em] text-[var(--ds-color-text-secondary)]',
            labelSize === 'sm' ? 'text-xs' : 'text-sm',
            labelSrOnly && 'sr-only',
          )}
        >
          {label}
          {required ? (
            <span className="ml-1 text-[var(--ds-color-danger)]" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {description ? (
          <p
            id={descriptionId}
            className="text-xs text-[var(--ds-color-text-muted)]"
          >
            {description}
          </p>
        ) : null}
      </div>

      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: htmlFor ?? (children as React.ReactElement<Record<string, unknown>>).props.id,
            'aria-invalid': hasError ? 'true' : undefined,
            'aria-required': required ? 'true' : undefined,
            'aria-describedby': describedBy,
            // Propaga hasError para Input/Textarea/Select que o suportam
            ...(hasError ? { hasError: true } : {}),
          })
        : children}

      {hasError ? (
        <p
          id={errorId}
          role="alert"
          aria-live="assertive"
          className="flex items-center gap-1 text-xs font-medium text-[var(--ds-color-danger)]"
        >
          <span aria-hidden="true" className="text-[0.625rem]">
            ✕
          </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
