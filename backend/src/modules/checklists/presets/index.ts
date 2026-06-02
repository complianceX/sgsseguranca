import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildElevatingPlatformTopics } from './elevating-platform.template';
import { buildExtensionLadderTopics } from './extension-ladder.template';
import { buildGrinderTopics } from './grinder.template';
import { buildLotoOperationalTopics } from './loto.template';
import { buildMunckTruckTopics } from './munck.template';
import { buildNr10OperationalTopics } from './nr10.template';
import { buildNr12OperationalTopics } from './nr12.template';
import { buildNr24OperationalTopics } from './nr24.template';
import { buildNr33OperationalTopics } from './nr33.template';
import { buildNr35OperationalTopics } from './nr35.template';
import { buildPemtTopics } from './pemt.template';
import { buildPortableDrillTopics } from './portable-drill.template';
import { buildSafetyLanyardTopics } from './safety-lanyard.template';
import { buildStepLadderTopics } from './step-ladder.template';
import { buildWeldingMachineTopics } from './welding-machine.template';

export type ChecklistPresetSeedKey =
  | 'nr24'
  | 'nr10'
  | 'nr12'
  | 'loto'
  | 'nr35'
  | 'nr33'
  | 'welding-machine'
  | 'grinder'
  | 'pemt'
  | 'elevating-platform'
  | 'munck'
  | 'portable-drill'
  | 'safety-lanyard'
  | 'extension-ladder'
  | 'step-ladder';

export type ChecklistPresetSeedDefinition = {
  key: ChecklistPresetSeedKey;
  titulo: string;
  aliases?: string[];
  descricao: string;
  categoria: string;
  periodicidade: string;
  nivel_risco_padrao: string;
  equipamento?: string;
  maquina?: string;
  foto_equipamento?: string;
  buildTopics: () => ChecklistTopicValue[];
};

export const CHECKLIST_PRESET_SEEDS: ChecklistPresetSeedDefinition[] = [
  {
    key: 'nr24',
    titulo: 'Checklist Operacional - NR24',
    descricao:
      'Modelo padrão do sistema para verificação de condições de vivência e higiene ocupacional conforme NR24.',
    categoria: 'Operacional',
    periodicidade: 'Conforme rotina',
    nivel_risco_padrao: 'Médio',
    buildTopics: buildNr24OperationalTopics,
  },
  {
    key: 'nr10',
    titulo: 'Checklist Operacional - NR10',
    descricao:
      'Modelo padrão do sistema para verificação operacional de conformidade em segurança com instalações e serviços em eletricidade conforme NR-10.',
    categoria: 'Operacional',
    periodicidade: 'Por atividade',
    nivel_risco_padrao: 'Alto',
    buildTopics: buildNr10OperationalTopics,
  },
  {
    key: 'nr12',
    titulo: 'Checklist Operacional - NR12',
    descricao:
      'Modelo padrão do sistema para verificação operacional de conformidade em segurança no trabalho em máquinas e equipamentos conforme NR-12.',
    categoria: 'Operacional',
    periodicidade: 'Por atividade',
    nivel_risco_padrao: 'Alto',
    buildTopics: buildNr12OperationalTopics,
  },
  {
    key: 'loto',
    titulo: 'Checklist Operacional - LOTO',
    descricao:
      'Modelo padrão do sistema para verificação operacional de bloqueio e etiquetagem de energias perigosas.',
    categoria: 'Operacional',
    periodicidade: 'Por intervenção',
    nivel_risco_padrao: 'Alto',
    buildTopics: buildLotoOperationalTopics,
  },
  {
    key: 'nr35',
    titulo: 'Checklist Operacional - NR35',
    descricao:
      'Modelo padrão do sistema para verificação operacional de conformidade em trabalho em altura conforme NR-35.',
    categoria: 'Operacional',
    periodicidade: 'Por atividade',
    nivel_risco_padrao: 'Alto',
    buildTopics: buildNr35OperationalTopics,
  },
  {
    key: 'nr33',
    titulo: 'Checklist Operacional - NR33',
    descricao:
      'Modelo padrão do sistema para verificação operacional de conformidade em entrada e trabalho em espaço confinado conforme NR-33.',
    categoria: 'Operacional',
    periodicidade: 'Por atividade',
    nivel_risco_padrao: 'Alto',
    buildTopics: buildNr33OperationalTopics,
  },
  {
    key: 'welding-machine',
    titulo: 'Checklist - Máquina de Solda',
    aliases: ['Checklist de Máquina de Solda'],
    descricao:
      'Modelo padrão do sistema para inspeção pré-uso, integridade, segurança elétrica, operação, bloqueio e pós-uso de máquina de solda.',
    categoria: 'Equipamento',
    periodicidade: 'Pré-uso diário',
    nivel_risco_padrao: 'Alto',
    equipamento: 'Máquina de Solda',
    buildTopics: buildWeldingMachineTopics,
  },
  {
    key: 'grinder',
    titulo: 'Checklist - Lixadeira',
    descricao:
      'Modelo padrão do sistema para inspeção pré-uso, integridade, segurança elétrica, operação, bloqueio e pós-uso de lixadeira.',
    categoria: 'Equipamento',
    periodicidade: 'Pré-uso diário',
    nivel_risco_padrao: 'Alto',
    equipamento: 'Lixadeira',
    buildTopics: buildGrinderTopics,
  },
  {
    key: 'pemt',
    titulo: 'Checklist - Plataforma Elevatória Elétrica (PEMT)',
    descricao:
      'Modelo padrão do sistema para inspeção pré-uso, liberação, operação segura, manutenção e bloqueio de plataforma elevatória elétrica.',
    categoria: 'Equipamento',
    periodicidade: 'Pré-uso diário',
    nivel_risco_padrao: 'Alto',
    equipamento: 'Plataforma Elevatória Elétrica (PEMT)',
    buildTopics: buildPemtTopics,
  },
  {
    key: 'elevating-platform',
    titulo: 'Checklist - Plataforma Elevatória',
    descricao:
      'Modelo padrão do sistema para inspeção pré-uso, liberação, operação segura, emergência/resgate e pós-uso de plataforma elevatória (tesoura, articulada, telescópica, mastro; elétrica ou combustão).',
    categoria: 'Equipamento',
    periodicidade: 'Pré-uso diário',
    nivel_risco_padrao: 'Alto',
    equipamento: 'Plataforma Elevatória',
    buildTopics: buildElevatingPlatformTopics,
  },
  {
    key: 'munck',
    titulo: 'Checklist - Caminhão Munck',
    descricao:
      'Modelo padrão do sistema para inspeção pré-uso, patolamento, içamento, operação segura, bloqueio e pós-uso de caminhão munck/guindauto.',
    categoria: 'Equipamento',
    periodicidade: 'Pré-uso diário',
    nivel_risco_padrao: 'Alto',
    equipamento: 'Caminhão Munck',
    buildTopics: buildMunckTruckTopics,
  },
  {
    key: 'portable-drill',
    titulo: 'Checklist - Furadeira/Parafusadeira Portátil',
    descricao:
      'Modelo padrão do sistema para inspeção pré-uso, liberação, uso seguro, controle de risco elétrico, manutenção, bloqueio e pós-uso de furadeira/parafusadeira portátil.',
    categoria: 'Equipamento',
    periodicidade: 'Pré-uso diário',
    nivel_risco_padrao: 'Alto',
    equipamento: 'Furadeira/Parafusadeira Portátil',
    buildTopics: buildPortableDrillTopics,
  },
  {
    key: 'safety-lanyard',
    titulo: 'Checklist - Talabarte de Segurança',
    descricao:
      'Modelo padrão do sistema para inspeção pré-uso, liberação, uso seguro, compatibilidade, conservação, higienização, bloqueio e descarte de talabarte de segurança.',
    categoria: 'EPI',
    periodicidade: 'Pré-uso diário',
    nivel_risco_padrao: 'Alto',
    equipamento: 'Talabarte de Segurança',
    buildTopics: buildSafetyLanyardTopics,
  },
  {
    key: 'extension-ladder',
    titulo: 'Checklist - Escada Extensível',
    descricao:
      'Modelo padrão do sistema para inspeção pré-uso, integridade, uso seguro, acesso temporário, bloqueio e interdição de escada extensível de uso individual.',
    categoria: 'Equipamento',
    periodicidade: 'Pré-uso diário',
    nivel_risco_padrao: 'Alto',
    equipamento: 'Escada Extensível',
    buildTopics: buildExtensionLadderTopics,
  },
  {
    key: 'step-ladder',
    titulo: 'Checklist - Escada de Abrir',
    descricao:
      'Modelo padrão do sistema para inspeção pré-uso, integridade, estabilidade, uso seguro, bloqueio e interdição de escada de abrir de uso individual.',
    categoria: 'Equipamento',
    periodicidade: 'Pré-uso diário',
    nivel_risco_padrao: 'Alto',
    equipamento: 'Escada de Abrir',
    buildTopics: buildStepLadderTopics,
  },
];

export const getChecklistPresetSeedByKey = (
  key: ChecklistPresetSeedKey,
): ChecklistPresetSeedDefinition | undefined =>
  CHECKLIST_PRESET_SEEDS.find((seed) => seed.key === key);
