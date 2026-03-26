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

export const LEGACY_DEFAULT_THEME: Required<UpdateSystemThemeDto> = {
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
};

export const LEGACY_DARK_THEME: Required<UpdateSystemThemeDto> = {
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
};

export const SYSTEM_THEME_PRESETS: Record<
  SystemThemePresetId,
  SystemThemePreset
> = {
  default: {
    id: 'default',
    label: 'Graphite Ledger',
    description:
      'Tema principal com superfícies claras, graphite neutro e foco em leitura objetiva.',
    tokens: {
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
    },
  },
  dark: {
    id: 'dark',
    label: 'Graphite Ops',
    description:
      'Tema escuro em graphite com contraste firme e sem acentos azuis.',
    tokens: {
      backgroundColor: '#171412',
      sidebarColor: '#110F0E',
      cardColor: '#24201D',
      primaryColor: '#3E3935',
      secondaryColor: '#67615B',
      textPrimary: '#F6F5F3',
      textSecondary: '#DED6CF',
      successColor: '#46A26A',
      warningColor: '#D2932B',
      dangerColor: '#E17870',
      infoColor: '#C9C0B8',
    },
  },
  industrial: {
    id: 'industrial',
    label: 'Industrial',
    description:
      'Mais robusto para operação em campo, com contraste forte e neutros minerais.',
    tokens: {
      backgroundColor: '#1F1D1A',
      sidebarColor: '#171513',
      cardColor: '#2A2623',
      primaryColor: '#665F59',
      secondaryColor: '#8A837B',
      textPrimary: '#F1ECE7',
      textSecondary: '#C7BEB6',
      successColor: '#4ade80',
      warningColor: '#facc15',
      dangerColor: '#f87171',
      infoColor: '#B5ADA5',
    },
  },
  'high-contrast': {
    id: 'high-contrast',
    label: 'Alto Contraste',
    description:
      'Leitura máxima para sol forte, tablets e operação crítica em campo.',
    tokens: {
      backgroundColor: '#ffffff',
      sidebarColor: '#111111',
      cardColor: '#ffffff',
      primaryColor: '#25221F',
      secondaryColor: '#5C5650',
      textPrimary: '#000000',
      textSecondary: '#202020',
      successColor: '#0f7a2f',
      warningColor: '#9a4d00',
      dangerColor: '#b00020',
      infoColor: '#57534E',
    },
  },
};

export const DEFAULT_THEME = SYSTEM_THEME_PRESETS.default.tokens;
