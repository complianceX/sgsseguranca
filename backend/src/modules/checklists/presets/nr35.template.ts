import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildNr35OperationalTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'nr35-topic-1',
      titulo: 'Gestão Documental e Planejamento',
      ordem: 1,
      itens: [
        {
          subitem: 'Procedimento operacional',
          item: 'O procedimento de trabalho em altura está formalizado, aprovado e disponível para a atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização do procedimento aplicável.',
        },
        {
          subitem: 'Análise de risco',
          item: 'A análise de risco contempla acesso, permanência, deslocamento e resgate da atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até emissão ou revisão da análise de risco.',
        },
        {
          subitem: 'Permissão de trabalho',
          item: 'A permissão de trabalho foi emitida quando exigida e está disponível no local?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até emissão e validação formal da PT exigida.',
        },
        {
          subitem: 'Condições impeditivas',
          item: 'As condições impeditivas estão definidas, conhecidas e controladas pela equipe?',
          criticidade: 'alto',
          acao: 'Suspender a atividade até alinhamento formal das condições impeditivas.',
        },
      ],
    },
    {
      id: 'nr35-topic-2',
      titulo: 'Equipe, Aptidão e Supervisão',
      ordem: 2,
      itens: [
        {
          subitem: 'Capacitação',
          item: 'Os trabalhadores possuem treinamento NR-35 compatível e vigente?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até regularização da capacitação aplicável.',
        },
        {
          subitem: 'Autorização',
          item: 'Os trabalhadores estão formalmente autorizados para a atividade em altura?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até autorização formal dos envolvidos.',
        },
        {
          subitem: 'Aptidão',
          item: 'Os trabalhadores estão aptos para a atividade quando houver exigência ocupacional aplicável?',
          criticidade: 'alto',
          acao: 'Afastar o trabalhador da atividade até validação da aptidão aplicável.',
        },
        {
          subitem: 'Supervisão',
          item: 'A atividade conta com supervisão compatível com a complexidade e o risco?',
          criticidade: 'alto',
          acao: 'Reforçar a supervisão antes do início ou continuidade da atividade.',
        },
      ],
    },
    {
      id: 'nr35-topic-3',
      titulo: 'Sistema de Proteção Contra Quedas',
      ordem: 3,
      itens: [
        {
          subitem: 'Proteção coletiva',
          item: 'As proteções coletivas previstas foram implantadas antes do uso de soluções individuais?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até implantação das proteções coletivas aplicáveis.',
        },
        {
          subitem: 'Ancoragem',
          item: 'Os pontos de ancoragem são adequados, identificados e compatíveis com o sistema utilizado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até validação dos pontos de ancoragem.',
        },
        {
          subitem: 'Conexão contínua',
          item: 'O método de trabalho garante proteção contínua durante toda a exposição ao risco de queda?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a atividade até adequação do método de proteção contínua.',
        },
        {
          subitem: 'EPI',
          item: 'O cinturão, talabarte e conectores estão íntegros e compatíveis com a atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Substituir o EPI inadequado e impedir o início da atividade até regularização.',
        },
      ],
    },
    {
      id: 'nr35-topic-4',
      titulo: 'Local, Acesso e Condições Operacionais',
      ordem: 4,
      itens: [
        {
          subitem: 'Acesso seguro',
          item: 'O acesso ao ponto de trabalho ocorre por meio seguro e controlado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até adequação do acesso seguro.',
        },
        {
          subitem: 'Isolamento da área',
          item: 'A área inferior e de circulação está isolada e sinalizada contra queda de materiais ou pessoas?',
          criticidade: 'alto',
          acao: 'Isolar e sinalizar adequadamente a área antes da continuidade.',
        },
        {
          subitem: 'Condições climáticas',
          item: 'As condições climáticas e de visibilidade são seguras para a atividade em altura?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a atividade até restabelecimento das condições seguras.',
        },
        {
          subitem: 'Ferramentas e materiais',
          item: 'As ferramentas e materiais estão organizados e controlados para evitar queda de objetos?',
          criticidade: 'alto',
          acao: 'Organizar e controlar ferramentas e materiais antes da continuidade.',
        },
      ],
    },
    {
      id: 'nr35-topic-5',
      titulo: 'Emergência, Resgate e Encerramento',
      ordem: 5,
      itens: [
        {
          subitem: 'Plano de resgate',
          item: 'Existe plano de resgate compatível com a atividade e conhecido pela equipe?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até definição e comunicação do plano de resgate.',
        },
        {
          subitem: 'Meios de emergência',
          item: 'Os meios de emergência e comunicação estão disponíveis e funcionais?',
          criticidade: 'alto',
          acao: 'Adequar os meios de emergência antes do início da atividade.',
        },
        {
          subitem: 'Resposta da equipe',
          item: 'A equipe sabe acionar resgate, primeiros socorros e resposta a emergência?',
          criticidade: 'alto',
          acao: 'Reforçar treinamentos e alinhamentos antes da continuidade.',
        },
        {
          subitem: 'Encerramento seguro',
          item: 'A atividade é encerrada com retirada controlada dos sistemas e registro de desvios ou ocorrências?',
          criticidade: 'medio',
          acao: 'Formalizar o encerramento e registrar os desvios observados.',
        },
      ],
    },
  ]);
}
