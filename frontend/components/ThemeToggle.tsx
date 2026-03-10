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
    <div className="flex items-center gap-1 rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-elevated)]/78 p-1 shadow-[var(--ds-shadow-sm)]">
      {options.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors',
              active
                ? 'bg-[color:var(--ds-color-action-primary)]/14 text-[var(--ds-color-text-primary)]'
                : 'text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-surface-muted)]/70 hover:text-[var(--ds-color-text-primary)]',
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
