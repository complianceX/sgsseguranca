'use client';

import { useEffect } from 'react';
import { buildApiUrl } from '@/lib/api';
import {
  stripThemeMetadata,
  systemThemeService,
  type SystemThemeTokens,
} from '@/services/systemThemeService';
import {
  applyAdaptiveFallbackTheme,
  applyStoredTheme,
  applyTheme,
  readStoredTheme,
  subscribeToAdaptiveThemePreference,
  storeTheme,
  subscribeToThemeRuntime,
} from '@/lib/theme-engine';

const THEME_REFRESH_INTERVAL_MS = 60_000;

/**
 * Carrega o tema do sistema na inicialização e aplica as CSS variables.
 * Deve ser montado uma vez no layout raiz, fora de qualquer autenticação.
 */
export function SystemThemeLoader() {
  useEffect(() => {
    let hasRemoteTheme = false;
    const storedTheme = applyStoredTheme();

    if (!storedTheme) {
      applyAdaptiveFallbackTheme();
    }

    const applyRemoteTheme = (rawTheme: unknown) => {
      if (!rawTheme || typeof rawTheme !== 'object') return;

      const theme = stripThemeMetadata(rawTheme as SystemThemeTokens);
      hasRemoteTheme = true;
      applyTheme(theme);
      storeTheme(theme);
    };

    const refreshTheme = async () => {
      try {
        const theme = await systemThemeService.getTheme();
        applyRemoteTheme(theme);
      } catch {
        /* falha silenciosa — globals.css e cache local definem o fallback */
      }
    };

    void refreshTheme();

    const unsubscribe = subscribeToThemeRuntime((theme) => {
      applyTheme(theme);
    });
    const unsubscribeAdaptiveTheme = subscribeToAdaptiveThemePreference((theme) => {
      if (hasRemoteTheme || readStoredTheme()) {
        return;
      }

      applyTheme(theme);
    });

    const streamUrl = buildApiUrl('/system-theme/stream');
    let eventSource: EventSource | null = null;

    if (streamUrl && typeof window !== 'undefined') {
      eventSource = new EventSource(streamUrl);
      eventSource.addEventListener('theme', ((event: MessageEvent<string>) => {
        try {
          applyRemoteTheme(JSON.parse(event.data));
        } catch {
          /* ignora mensagens malformadas do stream */
        }
      }) as EventListener);
    }

    const intervalId = window.setInterval(() => {
      void refreshTheme();
    }, THEME_REFRESH_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshTheme();
      }
    };

    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribe();
      unsubscribeAdaptiveTheme();
      eventSource?.close();
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return null;
}
