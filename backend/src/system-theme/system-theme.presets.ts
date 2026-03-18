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
      'Tema principal com azul executivo, superfícies claras suaves e contraste mais elegante para uso diário.',
    tokens: {
      backgroundColor: '#F4F7FB',
      sidebarColor: '#0E1F33',
      cardColor: '#FFFFFF',
      primaryColor: '#2563EB',
      secondaryColor: '#355372',
      textPrimary: '#102033',
      textSecondary: '#5A6C82',
      successColor: '#1E8A52',
      warningColor: '#B7791F',
      dangerColor: '#C43D3D',
      infoColor: '#1B6F94',
    },
  },
  dark: {
    id: 'dark',
    label: 'Escuro',
    description:
      'Tema escuro mais equilibrado, com superfícies azul-petróleo e leitura confortável para operação contínua.',
    tokens: {
      backgroundColor: '#071423',
      sidebarColor: '#06111D',
      cardColor: '#102235',
      primaryColor: '#4C8DFF',
      secondaryColor: '#355372',
      textPrimary: '#E8F1FC',
      textSecondary: '#C3D3E8',
      successColor: '#2FB36B',
      warningColor: '#D39A33',
      dangerColor: '#E16666',
      infoColor: '#53A4D0',
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
