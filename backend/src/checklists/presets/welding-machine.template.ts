import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildWeldingMachineTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'welding-topic-1',
      titulo: 'Identificação, Documentação e Condição Geral',
      ordem: 1,
      itens: [
        {
          subitem: 'Identificação',
          item: 'A máquina está identificada por patrimônio, código interno ou número de série?',
          criticidade: 'alto',
          acao: 'Regularizar a identificação física do equipamento antes do uso.',
        },
        {
          subitem: 'Liberação',
          item: 'Existe evidência de inspeção ou liberação vigente para o equipamento?',
          criticidade: 'alto',
          acao: 'Regularizar a inspeção e a liberação antes da operação.',
        },
        {
          subitem: 'Carcaça',
          item: 'A carcaça, alças e estrutura estão íntegras e sem danos que comprometam a segurança?',
          criticidade: 'alto',
          acao: 'Retirar de uso até reparo estrutural do equipamento.',
        },
        {
          subitem: 'Ventilação do equipamento',
          item: 'As entradas de ventilação estão desobstruídas e em condição segura?',
          criticidade: 'medio',
          acao: 'Realizar limpeza segura antes da operação.',
        },
        {
          subitem: 'Fixação de componentes',
          item: 'Os componentes externos estão firmes e sem improvisos?',
          criticidade: 'alto',
          acao: 'Regularizar os componentes soltos antes da liberação.',
        },
      ],
    },
    {
      id: 'welding-topic-2',
      titulo: 'Alimentação Elétrica e Aterramento',
      ordem: 2,
      itens: [
        {
          subitem: 'Cabo de alimentação',
          item: 'O cabo de alimentação está sem emendas improvisadas, cortes ou exposição de condutores?',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear a máquina até substituição do cabo danificado.',
        },
        {
          subitem: 'Plugue e tomada',
          item: 'O plugue e a tomada estão íntegros e compatíveis com a corrente da máquina?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até regularização do ponto de alimentação.',
        },
        {
          subitem: 'Aterramento',
          item: 'O aterramento da máquina está presente e em condição segura?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até validação do aterramento.',
        },
        {
          subitem: 'Painel e chave geral',
          item: 'O painel, a chave geral e os comandos elétricos estão funcionando corretamente?',
          criticidade: 'alto',
          acao: 'Corrigir o sistema elétrico antes do uso.',
        },
        {
          subitem: 'Aquecimento anormal',
          item: 'Não há sinais de aquecimento anormal, cheiro de queimado ou faíscas indevidas?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Retirar de uso imediatamente e encaminhar para avaliação elétrica.',
        },
      ],
    },
    {
      id: 'welding-topic-3',
      titulo: 'Acessórios e Circuito de Soldagem',
      ordem: 3,
      itens: [
        {
          subitem: 'Porta-eletrodo ou tocha',
          item: 'O porta-eletrodo ou a tocha estão íntegros e adequados ao processo utilizado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Substituir o acessório inadequado antes da operação.',
        },
        {
          subitem: 'Cabo de solda',
          item: 'O cabo de solda está íntegro e sem danos na isolação?',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear a operação até substituição do cabo danificado.',
        },
        {
          subitem: 'Garra de retorno',
          item: 'A garra de retorno está íntegra, com pressão adequada e contato firme com a peça ou bancada?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Substituir ou regularizar a garra de retorno antes da atividade.',
        },
        {
          subitem: 'Conexões',
          item: 'As conexões do circuito de soldagem estão firmes e sem aquecimento ou improvisos?',
          criticidade: 'alto',
          acao: 'Apertar ou substituir conexões inadequadas antes do uso.',
        },
        {
          subitem: 'Consumíveis',
          item: 'Os consumíveis estão adequados ao processo e armazenados em condição segura?',
          criticidade: 'medio',
          acao: 'Regularizar os consumíveis antes da operação.',
        },
      ],
    },
    {
      id: 'welding-topic-4',
      titulo: 'Área de Trabalho, Operação e Pós-Uso',
      ordem: 4,
      itens: [
        {
          subitem: 'Isolamento da área',
          item: 'A área de solda está isolada, sinalizada e protegida contra exposição de terceiros?',
          criticidade: 'alto',
          acao: 'Isolar e sinalizar adequadamente a área antes da operação.',
        },
        {
          subitem: 'Combustíveis e inflamáveis',
          item: 'Não há materiais inflamáveis expostos sem controle adequado no entorno da solda?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até eliminação ou controle dos inflamáveis.',
        },
        {
          subitem: 'Ventilação local',
          item: 'A ventilação ou exaustão local está adequada para o processo executado?',
          criticidade: 'alto',
          acao: 'Adequar a ventilação antes da continuidade da atividade.',
        },
        {
          subitem: 'EPI do soldador',
          item: 'Os EPIs do soldador estão íntegros e compatíveis com o processo executado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização e uso correto dos EPIs.',
        },
        {
          subitem: 'Encerramento',
          item: 'O equipamento é desligado, resfriado e armazenado de forma segura ao final do uso?',
          criticidade: 'medio',
          acao: 'Regularizar o encerramento seguro após a atividade.',
        },
      ],
    },
  ]);
}
