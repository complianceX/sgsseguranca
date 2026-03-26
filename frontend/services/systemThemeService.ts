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

// Tema padrão (claro): Atlas Command — institucional, premium e estável
export const DEFAULT_THEME: Omit<SystemThemeTokens, 'id' | 'updatedAt'> = {
  backgroundColor: '#F6F5F3',
  sidebarColor: '#2C2825',
  cardColor: '#FFFFFF',
  primaryColor: '#3E3935',
  secondaryColor: '#67615B',
  textPrimary: '#25221F',
  textSecondary: '#5C5650',
  successColor: '#1D6B43',
  warningColor: '#9A5A00',
  dangerColor: '#B3261E',
  infoColor: '#57534E',
};

// Tema escuro: graphite command center com destaque limpo para operação contínua
export const DARK_THEME: Omit<SystemThemeTokens, 'id' | 'updatedAt'> = {
  backgroundColor: '#171412',
  sidebarColor: '#110F0E',
  cardColor: '#24201D',
  primaryColor: '#3E3935',
  secondaryColor: '#67615B',
  textPrimary: '#F6F5F3',
  textSecondary: '#DED6CF',
  successColor: '#1D6B43',
  warningColor: '#9A5A00',
  dangerColor: '#B3261E',
  infoColor: '#57534E',
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
