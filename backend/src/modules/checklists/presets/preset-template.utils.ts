import {
  ChecklistItemValue,
  ChecklistTopicValue,
} from '../types/checklist-item.type';

export type PresetChecklistItemDefinition = {
  subitem: string;
  item: string;
  criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
  bloqueia?: boolean;
  observacaoObrigatoria?: boolean;
  fotoObrigatoria?: boolean;
  acao?: string;
};

export type PresetChecklistTopicDefinition = {
  id: string;
  titulo: string;
  ordem: number;
  itens: PresetChecklistItemDefinition[];
};

const normalizeQuestionText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.endsWith('?') ? trimmed : `${trimmed}?`;
};

export const buildPresetTopicItems = (
  items: PresetChecklistItemDefinition[],
): ChecklistItemValue[] =>
  items.map((definition) => ({
    item: `${definition.subitem} - ${normalizeQuestionText(definition.item)}`,
    tipo_resposta: 'sim_nao_na',
    obrigatorio: true,
    criticidade: definition.criticidade,
    bloqueia_operacao_quando_nc: definition.bloqueia,
    exige_observacao_quando_nc:
      definition.observacaoObrigatoria !== undefined
        ? definition.observacaoObrigatoria
        : definition.bloqueia
          ? true
          : undefined,
    exige_foto_quando_nc: definition.fotoObrigatoria,
    acao_corretiva_imediata: definition.acao,
  }));

export const buildPresetTopics = (
  topics: PresetChecklistTopicDefinition[],
): ChecklistTopicValue[] =>
  topics.map((topic) => ({
    id: topic.id,
    titulo: topic.titulo,
    ordem: topic.ordem,
    itens: buildPresetTopicItems(topic.itens),
  }));
