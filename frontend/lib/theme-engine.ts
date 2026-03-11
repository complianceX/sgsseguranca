import type { SystemThemeTokens } from '@/services/systemThemeService';

/** Mapeia os campos da API para CSS variables do design system */
const TOKEN_MAP: Record<keyof Omit<SystemThemeTokens, 'id' | 'updatedAt'>, string[]> = {
  backgroundColor: [
    '--ds-color-bg-canvas',
    '--ds-color-sidebar-bg',
  ],
  sidebarColor: [
    '--ds-color-sidebar-bg',
    '--ds-color-sidebar-bg-soft',
  ],
  cardColor: [
    '--ds-color-surface-elevated',
    '--ds-color-surface-base',
    '--ds-color-sidebar-surface',
  ],
  primaryColor: [
    '--ds-color-action-primary',
    '--ds-color-accent',
  ],
  secondaryColor: [
    '--ds-color-primary-subtle',
    '--ds-color-border-default',
  ],
  textPrimary: [
    '--ds-color-text-primary',
    '--ds-color-sidebar-text',
  ],
  textSecondary: [
    '--ds-color-text-secondary',
    '--ds-color-sidebar-muted',
  ],
  successColor: [
    '--ds-color-success-fg',
    '--ds-color-success-border',
  ],
  warningColor: [
    '--ds-color-warning-fg',
    '--ds-color-warning-border',
  ],
  dangerColor: [
    '--ds-color-danger-fg',
    '--ds-color-danger-border',
  ],
  infoColor: [
    '--ds-color-info-fg',
    '--ds-color-info-border',
  ],
};

/** Aplica os tokens do tema como CSS variables no :root */
export function applyTheme(theme: Partial<Omit<SystemThemeTokens, 'id' | 'updatedAt'>>): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  for (const [field, vars] of Object.entries(TOKEN_MAP)) {
    const value = theme[field as keyof typeof theme];
    if (!value) continue;
    for (const cssVar of vars) {
      root.style.setProperty(cssVar, value);
    }
  }
}

/** Remove os overrides e volta para os valores padrão do globals.css */
export function clearThemeOverrides(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const allVars = Object.values(TOKEN_MAP).flat();
  for (const cssVar of allVars) {
    root.style.removeProperty(cssVar);
  }
}
