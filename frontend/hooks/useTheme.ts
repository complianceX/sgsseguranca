'use client';

import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'sgs.theme';

function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // armazenamento indisponível ou bloqueado: cair para preferência do sistema
  }

  return null;
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function resolveTheme(): Theme {
  return readStoredTheme() ?? getSystemTheme();
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') {
    return;
  }

  const html = document.documentElement;
  html.setAttribute('data-theme', theme);
  html.classList.remove('theme-light', 'theme-dark');
  html.classList.add(`theme-${theme}`);
}

function persistTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // best effort
  }
}

export function useTheme() {
  // Mantém a primeira renderização estável entre SSR e cliente. O tema real
  // é sincronizado no effect após a hidratação.
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const nextTheme = resolveTheme();
    setThemeState(nextTheme);
    applyTheme(nextTheme);

    const storedTheme = readStoredTheme();
    if (storedTheme) {
      return;
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const next: Theme = e.matches ? 'dark' : 'light';
      setThemeState(next);
      applyTheme(next);
    };

    mq.addEventListener('change', handler);
    if (mq.matches !== (nextTheme === 'dark')) {
      const next: Theme = mq.matches ? 'dark' : 'light';
      setThemeState(next);
      applyTheme(next);
    }

    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    persistTheme(next);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === 'light' ? 'dark' : 'light';
      applyTheme(next);
      persistTheme(next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggle, isDark: theme === 'dark' };
}
