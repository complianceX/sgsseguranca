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

export const SYSTEM_THEME_PRESETS: Record<
  SystemThemePresetId,
  SystemThemePreset
> = {
  default: {
    id: 'default',
    label: 'Claro Corporativo',
    description:
      'Tema principal: fundo branco com cards azuis para leitura clara e aparência executiva.',
    tokens: {
      backgroundColor: '#ffffff',
      sidebarColor: '#0e2a4a',
      cardColor: '#f4f8ff',
      primaryColor: '#1f5fe0',
      secondaryColor: '#2f5e99',
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
    description:
      'Tema escuro em azul com cards brancos para contraste e leitura em operação.',
    tokens: {
      backgroundColor: '#0f2745',
      sidebarColor: '#081d39',
      cardColor: '#ffffff',
      primaryColor: '#1f5fe0',
      secondaryColor: '#2f5e99',
      textPrimary: '#0f172a',
      textSecondary: '#334155',
      successColor: '#22c55e',
      warningColor: '#f59e0b',
      dangerColor: '#ef4444',
      infoColor: '#38bdf8',
    },
  },
  industrial: {
    id: 'industrial',
    label: 'Industrial',
    description:
      'Mais robusto para operacao em campo, com contraste forte e acentos de seguranca.',
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
    description:
      'Leitura maxima para sol forte, tablets e operacao critica em campo.',
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
