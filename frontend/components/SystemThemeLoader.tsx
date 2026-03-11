'use client';

import { useEffect } from 'react';
import { systemThemeService } from '@/services/systemThemeService';
import { applyTheme } from '@/lib/theme-engine';

/**
 * Carrega o tema do sistema na inicialização e aplica as CSS variables.
 * Deve ser montado uma vez no layout raiz, fora de qualquer autenticação.
 */
export function SystemThemeLoader() {
  useEffect(() => {
    systemThemeService
      .getTheme()
      .then(applyTheme)
      .catch(() => {
        /* falha silenciosa — globals.css define o tema padrão */
      });
  }, []);

  return null;
}
