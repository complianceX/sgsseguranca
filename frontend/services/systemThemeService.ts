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

// SST Professional "Compliance Blue" — ANSI Z535 · ISO 3864 · OSHA
export const DEFAULT_THEME: Omit<SystemThemeTokens, 'id' | 'updatedAt'> = {
  backgroundColor: '#f4f7fa',
  sidebarColor: '#091624',
  cardColor: '#ffffff',
  primaryColor: '#0052b4',
  secondaryColor: '#0b8a52',
  textPrimary: '#101828',
  textSecondary: '#344054',
  successColor: '#157347',
  warningColor: '#d97706',
  dangerColor: '#d92d20',
  infoColor: '#0369a1',
};

// SST Dark — deep navy, high contrast for field/low-light use
export const DARK_THEME: Omit<SystemThemeTokens, 'id' | 'updatedAt'> = {
  backgroundColor: '#090f1c',
  sidebarColor: '#040a14',
  cardColor: '#111c2c',
  primaryColor: '#4d94e0',
  secondaryColor: '#1ab870',
  textPrimary: '#f0f4f8',
  textSecondary: '#c8d6e4',
  successColor: '#22a65e',
  warningColor: '#f59e0b',
  dangerColor: '#ef4444',
  infoColor: '#38a6e0',
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
