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

export const CHECKLIST_ITEM_RESPONSE_TYPE_VALUES = [
  'sim_nao',
  'conforme',
  'texto',
  'foto',
  'sim_nao_na',
] as const;

export type ChecklistItemStatus =
  | boolean
  | (typeof CHECKLIST_ITEM_STATUS_VALUES)[number];

export type ChecklistItemResponseType =
  (typeof CHECKLIST_ITEM_RESPONSE_TYPE_VALUES)[number];

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
  ordem_topico?: number;
  ordem_item?: number;
  status?: ChecklistItemStatus;
  tipo_resposta?: ChecklistItemResponseType;
  obrigatorio?: boolean;
  peso?: number;
  resposta?: unknown;
  observacao?: string;
  fotos?: string[];
  subitens?: ChecklistSubitemValue[];
};

export type ChecklistTopicValue = {
  id?: string;
  titulo: string;
  ordem?: number;
  itens: ChecklistItemValue[];
};
