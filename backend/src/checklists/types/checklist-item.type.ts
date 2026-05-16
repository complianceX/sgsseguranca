// Shared checklist contracts used by DTOs, entity persistence, service
// normalization and preset builders.
export const CHECKLIST_ITEM_STATUS_VALUES = [
  'ok',
  'nok',
  'na',
  'sim',
  'nao',
  'Pendente',
  'Conforme',
  'Não Conforme',
] as const;

export const CHECKLIST_STATUS_VALUES = [
  'Pendente',
  'Conforme',
  'Não Conforme',
] as const;

export const CHECKLIST_ITEM_RESPONSE_TYPE_VALUES = [
  'sim_nao',
  'conforme',
  'texto',
  'foto',
  'sim_nao_na',
] as const;

export const CHECKLIST_BARRIER_TYPE_VALUES = [
  'humana',
  'fisica',
  'documental',
  'isolamento',
  'procedimental',
  'organizacional',
] as const;

export const CHECKLIST_BARRIER_STATUS_VALUES = [
  'integra',
  'degradada',
  'rompida',
] as const;

export const CHECKLIST_ITEM_CRITICALITY_VALUES = [
  'critico',
  'alto',
  'medio',
  'baixo',
] as const;

export type ChecklistItemStatus =
  | boolean
  | (typeof CHECKLIST_ITEM_STATUS_VALUES)[number];

export type ChecklistItemResponseType =
  (typeof CHECKLIST_ITEM_RESPONSE_TYPE_VALUES)[number];

export type ChecklistStatus = (typeof CHECKLIST_STATUS_VALUES)[number];

export type ChecklistBarrierType =
  (typeof CHECKLIST_BARRIER_TYPE_VALUES)[number];

export type ChecklistBarrierStatus =
  (typeof CHECKLIST_BARRIER_STATUS_VALUES)[number];

export type ChecklistItemCriticality =
  (typeof CHECKLIST_ITEM_CRITICALITY_VALUES)[number];

export type ChecklistSubitemValue = {
  id?: string;
  texto: string;
  ordem?: number;
  status?: ChecklistItemStatus;
  resposta?: unknown;
  observacao?: string;
};

export type ChecklistItemValue = {
  id?: string;
  item: string;
  topico_id?: string;
  topico_titulo?: string;
  topico_descricao?: string;
  ordem_topico?: number;
  ordem_item?: number;
  barreira_tipo?: ChecklistBarrierType;
  peso_barreira?: number;
  limite_ruptura?: number;
  status?: ChecklistItemStatus;
  tipo_resposta?: ChecklistItemResponseType;
  obrigatorio?: boolean;
  peso?: number;
  criticidade?: ChecklistItemCriticality;
  bloqueia_operacao_quando_nc?: boolean;
  exige_foto_quando_nc?: boolean;
  exige_observacao_quando_nc?: boolean;
  acao_corretiva_imediata?: string;
  resposta?: unknown;
  observacao?: string;
  fotos?: string[];
  subitens?: ChecklistSubitemValue[];
};

export type ChecklistTopicValue = {
  id?: string;
  titulo: string;
  descricao?: string;
  ordem?: number;
  barreira_tipo?: ChecklistBarrierType;
  peso_barreira?: number;
  limite_ruptura?: number;
  status_barreira?: ChecklistBarrierStatus;
  controles_rompidos?: number;
  controles_degradados?: number;
  controles_pendentes?: number;
  bloqueia_operacao?: boolean;
  itens: ChecklistItemValue[];
};
