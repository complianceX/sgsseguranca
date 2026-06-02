import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildPortableDrillTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'portable-drill-topic-1',
      titulo: 'Identificação, Documentação e Condição Geral',
      ordem: 1,
      itens: [
        {
          subitem: 'Identificação da ferramenta',
          item: 'A ferramenta está identificada por código, patrimônio, número de série ou controle interno?',
          criticidade: 'alto',
          acao: 'Regularizar a identificação física da ferramenta antes do uso.',
        },
        {
          subitem: 'Liberação',
          item: 'Existe evidência de inspeção ou liberação vigente para a ferramenta?',
          criticidade: 'alto',
          acao: 'Regularizar a inspeção e a liberação antes da operação.',
        },
        {
          subitem: 'Carcaça',
          item: 'A carcaça está íntegra, sem trincas, impactos severos ou improvisos?',
          criticidade: 'alto',
          acao: 'Retirar de uso até reparo ou substituição da ferramenta.',
        },
        {
          subitem: 'Acionamento',
          item: 'O gatilho, trava e reversão estão respondendo corretamente?',
          criticidade: 'alto',
          acao: 'Retirar de uso até correção do sistema de acionamento.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-2',
      titulo: 'Segurança Elétrica e Alimentação',
      ordem: 2,
      itens: [
        {
          subitem: 'Cabo elétrico',
          item: 'O cabo elétrico está sem emendas improvisadas, cortes ou exposição de condutores?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a ferramenta até substituição do cabo danificado.',
        },
        {
          subitem: 'Plugue',
          item: 'O plugue está íntegro e compatível com o ponto de alimentação utilizado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a ferramenta até regularização do plugue e do ponto de energia.',
        },
        {
          subitem: 'Tomada',
          item: 'O ponto de alimentação está em condição segura para uso da ferramenta?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até regularização do ponto de alimentação.',
        },
        {
          subitem: 'Aquecimento anormal',
          item: 'Não há aquecimento anormal, faíscas indevidas ou cheiro de queimado durante o teste funcional?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Retirar de uso imediatamente e encaminhar para avaliação elétrica.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-3',
      titulo: 'Mandril, Broca e Partes Móveis',
      ordem: 3,
      itens: [
        {
          subitem: 'Mandril',
          item: 'O mandril está íntegro, sem folga excessiva e com travamento adequado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a ferramenta até correção ou substituição do mandril.',
        },
        {
          subitem: 'Broca ou bit',
          item: 'A broca, o bit ou o acessório utilizado está íntegro e compatível com a atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até instalação de acessório adequado.',
        },
        {
          subitem: 'Fixação do acessório',
          item: 'O acessório está corretamente fixado no mandril?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até reaperto ou reinstalação correta do acessório.',
        },
        {
          subitem: 'Rotação e impacto',
          item: 'A rotação, reversão e função de impacto operam normalmente quando aplicáveis?',
          criticidade: 'alto',
          acao: 'Retirar de uso até correção das funções operacionais.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-4',
      titulo: 'Operação, Área e Pós-Uso',
      ordem: 4,
      itens: [
        {
          subitem: 'EPI',
          item: 'Os EPIs previstos para perfuração ou parafusamento estão íntegros e em uso adequado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até disponibilização e uso correto dos EPIs.',
        },
        {
          subitem: 'Peça ou superfície',
          item: 'A peça ou superfície de trabalho está estabilizada e segura para a operação?',
          criticidade: 'alto',
          acao: 'Estabilizar a peça ou revisar o método antes da continuidade.',
        },
        {
          subitem: 'Área de trabalho',
          item: 'A área está organizada, iluminada e sem interferências perigosas para o uso da ferramenta?',
          criticidade: 'alto',
          acao: 'Adequar a área antes da operação.',
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
