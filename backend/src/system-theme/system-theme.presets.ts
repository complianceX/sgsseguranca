import type { UpdateSystemThemeDto } from './dto/update-system-theme.dto';

export type SystemThemePresetId =
  | 'default'
  | 'dark'
  | 'industrial'
  | 'high-contrast';

export interface SystemThemePreset {
  id: SystemThemePresetId;
  label: string;
  description: string;
  tokens: Required<UpdateSystemThemeDto>;
}

export const SYSTEM_THEME_PRESETS: Record<SystemThemePresetId, SystemThemePreset> = {
  default: {
    id: 'default',
    label: 'Safety Green',
    description: 'Tema SST profissional — Safety Green enterprise clean. Paleta normalizada ANSI Z535 / ISO 3864.',
    tokens: {
      backgroundColor: '#f7f8fa',
      sidebarColor: '#183a2c',
      cardColor: '#ffffff',
      primaryColor: '#1e6b43',
      secondaryColor: '#274c77',
      textPrimary: '#111827',
      textSecondary: '#5f6b79',
      successColor: '#2e7d32',
      warningColor: '#b7791f',
      dangerColor: '#c0392b',
      infoColor: '#3b6b93',
    },
  },
  dark: {
    id: 'dark',
    label: 'Escuro',
    description: 'Tema noturno premium com superficies profundas e contraste controlado.',
    tokens: {
      backgroundColor: '#0f1720',
      sidebarColor: '#091018',
      cardColor: '#16212b',
      primaryColor: '#3b82f6',
      secondaryColor: '#14b8a6',
      textPrimary: '#e7eef3',
      textSecondary: '#a9b8c5',
      successColor: '#22c55e',
      warningColor: '#f59e0b',
      dangerColor: '#ef4444',
      infoColor: '#38bdf8',
    },
  },
  industrial: {
    id: 'industrial',
    label: 'Industrial',
    description: 'Mais robusto para operacao em campo, com contraste forte e acentos de seguranca.',
    tokens: {
      backgroundColor: '#122318',
      sidebarColor: '#0b1710',
      cardColor: '#183224',
      primaryColor: '#22c55e',
      secondaryColor: '#16a34a',
      textPrimary: '#e2e8f0',
      textSecondary: '#b8c5d8',
      successColor: '#4ade80',
      warningColor: '#facc15',
      dangerColor: '#f87171',
      infoColor: '#60a5fa',
    },
  },
  'high-contrast': {
    id: 'high-contrast',
    label: 'Alto Contraste',
    description: 'Leitura maxima para sol forte, tablets e operacao critica em campo.',
    tokens: {
      backgroundColor: '#ffffff',
      sidebarColor: '#0a0a0a',
      cardColor: '#ffffff',
      primaryColor: '#0039cc',
      secondaryColor: '#005a5a',
      textPrimary: '#000000',
      textSecondary: '#202020',
      successColor: '#0f7a2f',
      warningColor: '#9a4d00',
      dangerColor: '#b00020',
      infoColor: '#005ea2',
    },
  },
};

export const DEFAULT_THEME = SYSTEM_THEME_PRESETS.default.tokens;
