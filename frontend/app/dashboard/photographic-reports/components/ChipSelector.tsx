'use client';

interface ChipSelectorProps<T extends string> {
  options: readonly T[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  disabled?: boolean;
  label?: string;
}

export function ChipSelector<T extends string>({
  options,
  value,
  onChange,
  disabled,
  label,
}: ChipSelectorProps<T>) {
  return (
    <div>
      {label && (
        <p className="mb-1.5 text-xs font-medium text-[var(--ds-color-text-muted)] uppercase tracking-wide">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt)}
              className={[
                'px-3 py-1.5 rounded-full text-sm font-medium transition-all border',
                active
                  ? 'bg-[var(--ds-color-action-primary)] text-[var(--ds-color-action-primary-foreground)] border-[var(--ds-color-action-primary)] shadow-sm'
                  : 'bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-muted)] border-[var(--ds-color-border-subtle)] hover:border-[var(--ds-color-action-primary)]/60 hover:text-[var(--ds-color-text-primary)]',
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
