import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildGrinderTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'grinder-topic-1',
      titulo: 'Identificação e Condição Geral',
      ordem: 1,
      itens: [
        {
          subitem: 'Identificação',
          item: 'A lixadeira está identificada por patrimônio, código interno ou número de série?',
          criticidade: 'alto',
          acao: 'Regularizar a identificação física da ferramenta antes do uso.',
        },
        {
          subitem: 'Carcaça',
          item: 'A carcaça está íntegra, sem trincas, impactos severos ou improvisos?',
          criticidade: 'alto',
          acao: 'Retirar de uso até reparo ou substituição da ferramenta.',
        },
        {
          subitem: 'Ventilação',
          item: 'As entradas de ventilação estão limpas e desobstruídas?',
          criticidade: 'medio',
          acao: 'Realizar limpeza segura antes da operação.',
        },
        {
          subitem: 'Fixações externas',
          item: 'Parafusos, capas e componentes externos estão firmes e completos?',
          criticidade: 'alto',
          acao: 'Regularizar as fixações antes da liberação da ferramenta.',
        },
        {
          subitem: 'Gatilho',
          item: 'O gatilho ou acionamento retorna e responde corretamente?',
          criticidade: 'alto',
          acao: 'Retirar de uso até correção do sistema de acionamento.',
        },
      ],
    },
    {
      id: 'grinder-topic-2',
      titulo: 'Disco, Rebolo, Lixa e Acessórios',
      ordem: 2,
      itens: [
        {
          subitem: 'Compatibilidade do acessório',
          item: 'O disco, rebolo, lixa ou acessório é compatível com o modelo e a rotação da lixadeira?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até instalação de acessório compatível.',
        },
        {
          subitem: 'Integridade do acessório',
          item: 'O disco, rebolo ou acessório está sem trincas, deformações ou desgaste crítico?',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear a operação até substituição do acessório danificado.',
        },
        {
          subitem: 'Fixação do acessório',
          item: 'O acessório está corretamente fixado e apertado no eixo?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até reaperto ou reinstalação correta do acessório.',
        },
        {
          subitem: 'Flanges e porcas',
          item: 'Flanges, porcas e chave de aperto estão adequados e íntegros?',
          criticidade: 'alto',
          acao: 'Substituir ou regularizar os componentes de fixação antes do uso.',
        },
        {
          subitem: 'Sentido de montagem',
          item: 'O acessório foi montado conforme indicação do fabricante?',
          criticidade: 'alto',
          acao: 'Reinstalar o acessório conforme instrução técnica antes da operação.',
        },
      ],
    },
    {
      id: 'grinder-topic-3',
      titulo: 'Proteções, Empunhadura e Segurança Elétrica',
      ordem: 3,
      itens: [
        {
          subitem: 'Guarda de proteção',
          item: 'A guarda de proteção está instalada, íntegra e corretamente posicionada?',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a ferramenta até recomposição da guarda de proteção.',
        },
        {
          subitem: 'Empunhadura lateral',
          item: 'A empunhadura lateral está instalada, íntegra e firme quando aplicável?',
          criticidade: 'alto',
          acao: 'Instalar ou substituir a empunhadura antes do uso.',
        },
        {
          subitem: 'Cabo elétrico',
          item: 'O cabo elétrico está sem emendas improvisadas, cortes ou exposição de condutores?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a ferramenta até substituição do cabo danificado.',
        },
        {
          subitem: 'Plugue',
          item: 'O plugue está íntegro e compatível com a alimentação utilizada?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a ferramenta até regularização do plugue e do ponto de energia.',
        },
        {
          subitem: 'Aquecimento ou cheiro',
          item: 'Não há sinais de aquecimento anormal, faíscas indevidas ou cheiro de queimado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Retirar de uso imediatamente e encaminhar para avaliação elétrica.',
        },
      ],
    },
    {
      id: 'grinder-topic-4',
      titulo: 'Área de Trabalho, Operação e Pós-Uso',
      ordem: 4,
      itens: [
        {
          subitem: 'Isolamento da área',
          item: 'A área está sinalizada e protegida contra projeção de partículas e acesso indevido?',
          criticidade: 'alto',
          acao: 'Isolar e sinalizar adequadamente a área antes da operação.',
        },
        {
          subitem: 'Inflamáveis',
          item: 'Não há materiais inflamáveis expostos sem controle no entorno da atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até eliminação ou controle dos inflamáveis.',
        },
        {
          subitem: 'EPI',
          item: 'Os EPIs previstos para corte ou desbaste estão íntegros e em uso adequado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até disponibilização e uso correto dos EPIs.',
        },
        {
          subitem: 'Posicionamento operacional',
          item: 'O operador utiliza a ferramenta com postura, pegada e direcionamento seguros?',
          criticidade: 'alto',
          acao: 'Interromper a atividade e corrigir a forma de operação antes da continuidade.',
        },
        {
          subitem: 'Encerramento',
          item: 'A ferramenta é desligada, desenergizada e armazenada de forma segura após o uso?',
          criticidade: 'medio',
          acao: 'Regularizar o encerramento seguro após a atividade.',
        },
      ],
    },
  ]);
}
