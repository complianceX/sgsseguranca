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
    <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
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
                ? 'bg-white/12 text-white'
                : 'text-[var(--ds-color-text-muted)] hover:bg-white/8 hover:text-white',
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
