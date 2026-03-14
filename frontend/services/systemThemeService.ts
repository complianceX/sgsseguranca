import api from '@/lib/api';

export interface SystemThemeTokens {
  id: string;
  backgroundColor: string;
  sidebarColor: string;
  cardColor: string;
  primaryColor: string;
  secondaryColor: string;
  textPrimary: string;
  textSecondary: string;
  successColor: string;
  warningColor: string;
  dangerColor: string;
  infoColor: string;
  updatedAt: string;
}

export type UpdateSystemThemeDto = Partial<Omit<SystemThemeTokens, 'id' | 'updatedAt'>>;
export type SystemThemePresetId = 'default' | 'dark' | 'industrial' | 'high-contrast';

export interface SystemThemePreset {
  id: SystemThemePresetId;
  label: string;
  description: string;
  tokens: Omit<SystemThemeTokens, 'id' | 'updatedAt'>;
}

// SST Professional "Safety Green" — ANSI Z535 · ISO 3864 · ABNT NBR ISO 3864
export const DEFAULT_THEME: Omit<SystemThemeTokens, 'id' | 'updatedAt'> = {
  backgroundColor: '#f4f7fa',
  sidebarColor: '#0d3d1f',
  cardColor: '#ffffff',
  primaryColor: '#16a34a',
  secondaryColor: '#0052b4',
  textPrimary: '#101828',
  textSecondary: '#344054',
  successColor: '#15803d',
  warningColor: '#d97706',
  dangerColor: '#d92d20',
  infoColor: '#0369a1',
};

// SST Dark — deep forest green, high contrast for field/low-light use
export const DARK_THEME: Omit<SystemThemeTokens, 'id' | 'updatedAt'> = {
  backgroundColor: '#091a0f',
  sidebarColor: '#061209',
  cardColor: '#112218',
  primaryColor: '#4ade80',
  secondaryColor: '#60a5fa',
  textPrimary: '#f0f4f8',
  textSecondary: '#c8d6e4',
  successColor: '#22c55e',
  warningColor: '#f59e0b',
  dangerColor: '#ef4444',
  infoColor: '#38bdf8',
};

export const ADAPTIVE_THEME_PRESETS = {
  light: DEFAULT_THEME,
  dark: DARK_THEME,
} as const;

export function stripThemeMetadata(
  theme: SystemThemeTokens,
): Omit<SystemThemeTokens, 'id' | 'updatedAt'> {
  const tokens = { ...theme } as Partial<SystemThemeTokens>;
  delete tokens.id;
  delete tokens.updatedAt;
  return tokens as Omit<SystemThemeTokens, 'id' | 'updatedAt'>;
}

export const systemThemeService = {
  async getTheme(): Promise<SystemThemeTokens> {
    const { data } = await api.get<SystemThemeTokens>('/system-theme');
    return data;
  },

  async getPresets(): Promise<SystemThemePreset[]> {
    const { data } = await api.get<SystemThemePreset[]>('/system-theme/presets');
    return data;
  },

  async updateTheme(dto: UpdateSystemThemeDto): Promise<SystemThemeTokens> {
    const { data } = await api.patch<SystemThemeTokens>('/system-theme', dto);
    return data;
  },

  async applyPreset(presetId: SystemThemePresetId): Promise<SystemThemeTokens> {
    const { data } = await api.post<SystemThemeTokens>(`/system-theme/presets/${presetId}/apply`);
    return data;
  },

  async resetTheme(): Promise<SystemThemeTokens> {
    const { data } = await api.post<SystemThemeTokens>('/system-theme/reset');
    return data;
  },
};
