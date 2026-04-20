'use client';

import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'sgs.theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);
  html.classList.remove('theme-light', 'theme-dark');
  html.classList.add(`theme-${theme}`);
}

// Aplica tema antes da primeira pintura para evitar flash (executado inline no <head>)
if (typeof window !== 'undefined') {
  applyTheme(getInitialTheme());
}

export function useTheme() {
  // Inicializa direto com o valor correto para evitar renderização com tema errado
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window !== 'undefined' ? getInitialTheme() : 'light',
  );

  // Sincroniza com preferência do SO quando muda dinamicamente (ex: modo noturno automático)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return; // usuário tem preferência explícita

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const next: Theme = e.matches ? 'dark' : 'light';
      setThemeState(next);
      applyTheme(next);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === 'light' ? 'dark' : 'light';
      applyTheme(next);
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggle, isDark: theme === 'dark' };
}
