'use client';

import { Laptop, Moon, SunMedium } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';

const options = [
  { value: 'light', label: 'Claro', icon: SunMedium },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Laptop },
] as const;

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-1 rounded-xl border border-[var(--component-navbar-border)] bg-[color:var(--component-navbar-chip-bg)] p-1 shadow-[var(--ds-shadow-sm)]">
      {options.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
              active
                ? 'bg-[color:var(--color-primary)]/14 text-[var(--color-text)]'
                : 'text-[var(--color-text-muted)] hover:bg-[color:var(--color-card-muted)]/70 hover:text-[var(--color-text)]',
            )}
            title={
              option.value === 'system'
                ? `Seguir sistema (${resolvedTheme})`
                : `Tema ${option.label.toLowerCase()}`
            }
            aria-label={option.label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
