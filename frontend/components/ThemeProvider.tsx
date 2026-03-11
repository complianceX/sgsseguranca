'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type ThemePreference = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = 'gst.theme';
const LEGACY_STORAGE_KEY = 'compliancex.theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const resolveTheme = (theme: ThemePreference): ResolvedTheme =>
  theme === 'system' ? getSystemTheme() : theme;

const applyDarkLightClass = (resolvedTheme: ResolvedTheme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.classList.remove('theme-light', 'theme-dark');
  document.documentElement.classList.add(resolvedTheme === 'dark' ? 'theme-dark' : 'theme-light');
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const stored = (window.localStorage.getItem(STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_STORAGE_KEY)) as ThemePreference | null;
    const initialTheme = stored && ['light', 'dark', 'system'].includes(stored) ? stored : 'system';
    const initialResolved = resolveTheme(initialTheme);
    setThemeState(initialTheme);
    setResolvedTheme(initialResolved);
    applyDarkLightClass(initialResolved);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (
        initialTheme === 'system' ||
        window.localStorage.getItem(STORAGE_KEY) === 'system' ||
        window.localStorage.getItem(LEGACY_STORAGE_KEY) === 'system'
      ) {
        const next = getSystemTheme();
        setResolvedTheme(next);
        applyDarkLightClass(next);
      }
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const setTheme = useCallback((nextTheme: ThemePreference) => {
    const nextResolved = resolveTheme(nextTheme);
    setThemeState(nextTheme);
    setResolvedTheme(nextResolved);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    applyDarkLightClass(nextResolved);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [resolvedTheme, setTheme, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
