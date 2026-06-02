import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildSafetyLanyardTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'lanyard-topic-1',
      titulo: 'Identificação, CA e Documentação',
      ordem: 1,
      itens: [
        {
          subitem: 'Identificação do EPI',
          item: 'O talabarte está identificado por marca, modelo, lote, número de série ou código interno?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até regularização da identificação do EPI.',
        },
        {
          subitem: 'CA',
          item: 'O CA está legível e válido para o equipamento utilizado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até validação do CA aplicável.',
        },
        {
          subitem: 'Rastreabilidade',
          item: 'Existe rastreabilidade de inspeção e controle do talabarte?',
          criticidade: 'alto',
          acao: 'Regularizar a rastreabilidade de inspeção antes da liberação.',
        },
        {
          subitem: 'Compatibilidade',
          item: 'O talabarte é compatível com o cinturão e com o sistema de ancoragem da atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até adequação do sistema de proteção contra quedas.',
        },
      ],
    },
    {
      id: 'lanyard-topic-2',
      titulo: 'Fitas, Costuras e Absorvedor',
      ordem: 2,
      itens: [
        {
          subitem: 'Fitas',
          item: 'As fitas estão sem cortes, abrasão, queima, desfiamento ou contaminação crítica?',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear o uso e substituir imediatamente o talabarte danificado.',
        },
        {
          subitem: 'Costuras',
          item: 'As costuras estão íntegras e sem soltura de pontos?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso e substituir o equipamento.',
        },
        {
          subitem: 'Absorvedor de energia',
          item: 'O absorvedor de energia está íntegro, sem acionamento prévio ou dano aparente?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso e substituir o talabarte imediatamente.',
        },
        {
          subitem: 'Indicadores de queda',
          item: 'Os indicadores de acionamento ou queda estão íntegros quando existentes?',
          criticidade: 'alto',
          acao: 'Retirar de uso o equipamento até validação técnica.',
        },
      ],
    },
    {
      id: 'lanyard-topic-3',
      titulo: 'Conectores, Regulagem e Uso',
      ordem: 3,
      itens: [
        {
          subitem: 'Mosquetões e conectores',
          item: 'Os mosquetões e conectores estão íntegros, com travamento automático ou manual funcionando corretamente?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso e substituir imediatamente o componente defeituoso.',
        },
        {
          subitem: 'Regulagem',
          item: 'Os pontos de regulagem e ajustes estão funcionando e sem soltura indevida?',
          criticidade: 'alto',
          acao: 'Regularizar ou substituir o equipamento antes do uso.',
        },
        {
          subitem: 'Comprimento adequado',
          item: 'O comprimento e a configuração do talabarte são adequados ao risco da atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até adequação do sistema de retenção.',
        },
        {
          subitem: 'Conexão correta',
          item: 'O talabarte está conectado ao ponto correto de ancoragem durante a atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper a atividade imediatamente e reconectar conforme orientação técnica.',
        },
      ],
    },
    {
      id: 'lanyard-topic-4',
      titulo: 'Resgate, Conservação e Descarte',
      ordem: 4,
      itens: [
        {
          subitem: 'Resgate',
          item: 'Existe procedimento de emergência e resgate compatível com a atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até definição e comunicação do plano de resgate.',
        },
        {
          subitem: 'Armazenamento',
          item: 'O talabarte está armazenado em condição limpa, seca e protegida de agentes agressivos?',
          criticidade: 'medio',
          acao: 'Regularizar o armazenamento do equipamento.',
        },
        {
          subitem: 'Higienização',
          item: 'A higienização do talabarte segue procedimento compatível com o fabricante?',
          criticidade: 'medio',
          acao: 'Regularizar a higienização conforme instrução técnica.',
        },
        {
          subitem: 'Descarte ou interdição',
          item: 'O equipamento é interditado e descartado quando apresenta dano, acionamento ou vencimento aplicável?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Retirar de uso imediatamente e formalizar a interdição do EPI.',
        },
      ],
    },
  ]);
}
