import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildLotoOperationalTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'loto-topic-1',
      titulo: 'Gestão, Escopo e Documentação',
      ordem: 1,
      itens: [
        {
          subitem: 'Procedimento LOTO',
          item: 'O procedimento de bloqueio e etiquetagem está formalizado, aprovado e disponível para a atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização do procedimento LOTO aplicável.',
        },
        {
          subitem: 'Escopo',
          item: 'O escopo da intervenção e os equipamentos envolvidos estão claramente identificados?',
          criticidade: 'alto',
          acao: 'Revisar e delimitar formalmente o escopo antes da intervenção.',
        },
        {
          subitem: 'Inventário de energias',
          item: 'As fontes de energia perigosa estão identificadas e mapeadas para o equipamento?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até identificação formal das fontes de energia.',
        },
        {
          subitem: 'Permissão',
          item: 'A intervenção possui autorização formal quando exigida pelo processo local?',
          criticidade: 'alto',
          acao: 'Regularizar a autorização antes da execução.',
        },
      ],
    },
    {
      id: 'loto-topic-2',
      titulo: 'Equipe, Dispositivos e Preparação',
      ordem: 2,
      itens: [
        {
          subitem: 'Equipe autorizada',
          item: 'Somente pessoas autorizadas participam do bloqueio e da intervenção?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até definição e controle dos autorizados.',
        },
        {
          subitem: 'Treinamento',
          item: 'Os envolvidos possuem treinamento compatível com o programa de bloqueio aplicável?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até regularização dos treinamentos aplicáveis.',
        },
        {
          subitem: 'Dispositivos de bloqueio',
          item: 'Os cadeados, travas e dispositivos de bloqueio estão disponíveis e íntegros?',
          criticidade: 'alto',
          acao: 'Disponibilizar e substituir os dispositivos inadequados antes da atividade.',
        },
        {
          subitem: 'Etiquetas',
          item: 'As etiquetas de bloqueio identificam responsável, data e motivo da intervenção?',
          criticidade: 'alto',
          acao: 'Regularizar a identificação das etiquetas antes da execução.',
        },
      ],
    },
    {
      id: 'loto-topic-3',
      titulo: 'Isolamento e Aplicação do Bloqueio',
      ordem: 3,
      itens: [
        {
          subitem: 'Desligamento',
          item: 'O equipamento foi desligado de forma controlada antes do bloqueio?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção até desligamento controlado do equipamento.',
        },
        {
          subitem: 'Isolamento',
          item: 'Todas as fontes de energia foram isoladas nos pontos corretos?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até isolamento completo das fontes de energia.',
        },
        {
          subitem: 'Aplicação do cadeado',
          item: 'Cada responsável aplicou seu próprio cadeado ou controle equivalente no ponto de bloqueio?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até aplicação correta dos dispositivos individuais.',
        },
        {
          subitem: 'Energias residuais',
          item: 'As energias residuais foram dissipadas, neutralizadas ou contidas antes da intervenção?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até eliminação segura das energias residuais.',
        },
      ],
    },
    {
      id: 'loto-topic-4',
      titulo: 'Verificação de Energia Zero',
      ordem: 4,
      itens: [
        {
          subitem: 'Tentativa de partida',
          item: 'A tentativa controlada de partida confirmou a condição de energia zero quando aplicável?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até verificação formal da condição de energia zero.',
        },
        {
          subitem: 'Instrumentos',
          item: 'Os instrumentos de verificação são adequados e estão em condição segura de uso?',
          criticidade: 'alto',
          acao: 'Substituir ou regularizar os instrumentos antes da verificação.',
        },
        {
          subitem: 'Confirmação da condição segura',
          item: 'A condição segura foi confirmada antes de iniciar a intervenção?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção até confirmação formal da condição segura.',
        },
        {
          subitem: 'Sinalização da intervenção',
          item: 'A área e o equipamento permanecem sinalizados enquanto durar a intervenção?',
          criticidade: 'alto',
          acao: 'Restabelecer a sinalização antes da continuidade da atividade.',
        },
      ],
    },
    {
      id: 'loto-topic-5',
      titulo: 'Retorno à Operação e Auditoria',
      ordem: 5,
      itens: [
        {
          subitem: 'Liberação da área',
          item: 'A área foi inspecionada e liberada antes da retirada dos bloqueios?',
          criticidade: 'alto',
          acao: 'Inspecionar a área e formalizar a liberação antes da retirada dos bloqueios.',
        },
        {
          subitem: 'Retirada dos cadeados',
          item: 'Os bloqueios foram retirados somente pelos responsáveis autorizados ou conforme exceção formal controlada?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Impedir o retorno até correção da retirada indevida dos bloqueios.',
        },
        {
          subitem: 'Comunicação do retorno',
          item: 'Os envolvidos foram comunicados antes da reenergização ou retorno à operação?',
          criticidade: 'alto',
          acao: 'Comunicar formalmente o retorno antes da reenergização.',
        },
        {
          subitem: 'Registro e aprendizado',
          item: 'A intervenção foi registrada e os desvios do processo de bloqueio foram tratados?',
          criticidade: 'medio',
          acao: 'Registrar a intervenção e tratar os desvios observados.',
        },
      ],
    },
  ]);
}
