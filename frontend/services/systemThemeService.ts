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

// Navy Safety — paleta profissional SST (Intelex · SafetyCulture · ISO 45001)
export const DEFAULT_THEME: Omit<SystemThemeTokens, 'id' | 'updatedAt'> = {
  backgroundColor: '#f0f4f8',
  sidebarColor: '#0c1b2e',
  cardColor: '#ffffff',
  primaryColor: '#1046a0',
  secondaryColor: '#0c7a5c',
  textPrimary: '#0c1b2e',
  textSecondary: '#3d5168',
  successColor: '#15763a',
  warningColor: '#c47a0a',
  dangerColor: '#c4281c',
  infoColor: '#0b5fa5',
};

// Navy Safety Dark — deep navy base, high contrast
export const DARK_THEME: Omit<SystemThemeTokens, 'id' | 'updatedAt'> = {
  backgroundColor: '#0a1424',
  sidebarColor: '#060e1c',
  cardColor: '#131e2e',
  primaryColor: '#4d8edf',
  secondaryColor: '#1aad7a',
  textPrimary: '#e8f0f8',
  textSecondary: '#a0b4c8',
  successColor: '#24a85a',
  warningColor: '#e8920e',
  dangerColor: '#e03a30',
  infoColor: '#3a9ee0',
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
