export const PHOTO_CONDITIONS = [
  'EPIs em uso pelos trabalhadores',
  'Área devidamente sinalizada',
  'Procedimentos seguidos corretamente',
  'Risco identificado na imagem',
  'Conformidade com NR aplicável',
] as const;

export type PhotoCondition = (typeof PHOTO_CONDITIONS)[number];

export const CONDITION_CLASSIFICATION_OPTIONS = [
  { value: 'Satisfatória', color: 'green', label: 'Satisfatória' },
  { value: 'Muito satisfatória', color: 'blue', label: 'Muito satisfatória' },
  {
    value: 'Ponto de atenção preventivo',
    color: 'yellow',
    label: 'Preventiva',
  },
  { value: 'Atenção necessária', color: 'red', label: 'Atenção' },
] as const;

export type ClassificationValue =
  (typeof CONDITION_CLASSIFICATION_OPTIONS)[number]['value'];

export const SHIFT_OPTIONS = ['Diurno', 'Noturno', 'Integral'] as const;
export type ShiftOption = (typeof SHIFT_OPTIONS)[number];

export const TONE_OPTIONS = ['Positivo', 'Técnico', 'Preventivo'] as const;
export type ToneOption = (typeof TONE_OPTIONS)[number];

export const AREA_STATUS_OPTIONS = [
  'Loja aberta',
  'Loja fechada',
  'Área controlada',
  'Área isolada',
] as const;
export type AreaStatusOption = (typeof AREA_STATUS_OPTIONS)[number];
