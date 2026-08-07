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
        <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground',
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
