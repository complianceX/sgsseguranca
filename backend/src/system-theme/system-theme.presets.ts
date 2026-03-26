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
      backgroundColor: '#F5F5F4',
      sidebarColor: '#2F2B28',
      cardColor: '#FFFFFF',
      primaryColor: '#4A443F',
      secondaryColor: '#6C6661',
      textPrimary: '#2F2B28',
      textSecondary: '#66615B',
      successColor: '#18895B',
      warningColor: '#B9771E',
      dangerColor: '#C84A4A',
      infoColor: '#6E6862',
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
      cardColor: '#24211F',
      primaryColor: '#4A443F',
      secondaryColor: '#8B847E',
      textPrimary: '#F4F1ED',
      textSecondary: '#D6CFC8',
      successColor: '#31A56E',
      warningColor: '#D39B36',
      dangerColor: '#E56C6C',
      infoColor: '#8B847E',
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
      primaryColor: '#2F2B28',
      secondaryColor: '#57514C',
      textPrimary: '#000000',
      textSecondary: '#202020',
      successColor: '#0f7a2f',
      warningColor: '#9a4d00',
      dangerColor: '#b00020',
      infoColor: '#43403C',
    },
  },
};

export const DEFAULT_THEME = SYSTEM_THEME_PRESETS.default.tokens;
