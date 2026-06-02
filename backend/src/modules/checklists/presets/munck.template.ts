import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildMunckTruckTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'munck-topic-1',
      titulo: 'Documentação, Identificação e Liberação',
      ordem: 1,
      itens: [
        {
          subitem: 'Tabela de carga',
          item: 'A tabela ou diagrama de carga do fabricante está disponível, legível e compatível com o equipamento?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até disponibilização da tabela de carga aplicável.',
        },
        {
          subitem: 'Identificação',
          item: 'O caminhão munck está identificado por placa, patrimônio ou número de série?',
          criticidade: 'alto',
          acao: 'Regularizar a identificação física do equipamento antes do uso.',
        },
        {
          subitem: 'Inspeção e liberação',
          item: 'Existe registro de inspeção e liberação vigente para o equipamento?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Executar a inspeção pendente e manter o equipamento bloqueado até aprovação.',
        },
        {
          subitem: 'Procedimento',
          item: 'O procedimento operacional da atividade está disponível para consulta pela equipe?',
          criticidade: 'alto',
          acao: 'Disponibilizar o procedimento aplicável antes do início da operação.',
        },
      ],
    },
    {
      id: 'munck-topic-2',
      titulo: 'Patolas, Estabilizadores e Nivelamento',
      ordem: 2,
      itens: [
        {
          subitem: 'Solo de apoio',
          item: 'O solo ou a base está sem risco de recalque, afundamento ou deslizamento sob as patolas?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até definição de base segura para patolamento.',
        },
        {
          subitem: 'Patolas',
          item: 'As patolas estão íntegras, sem vazamentos e operando corretamente?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até correção do sistema de patolamento.',
        },
        {
          subitem: 'Calços e apoios',
          item: 'Os calços, pranchas ou apoios previstos estão disponíveis e corretamente posicionados?',
          criticidade: 'alto',
          acao: 'Regularizar os apoios antes do içamento.',
        },
        {
          subitem: 'Nivelamento',
          item: 'O equipamento está nivelado e estável antes do içamento?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até restabelecimento da estabilidade e nivelamento.',
        },
      ],
    },
    {
      id: 'munck-topic-3',
      titulo: 'Braço, Cabos e Acessórios de Içamento',
      ordem: 3,
      itens: [
        {
          subitem: 'Estrutura do braço',
          item: 'O braço, lanças e articulações estão sem trincas, deformações ou danos críticos?',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Retirar o equipamento de operação e encaminhar para avaliação estrutural.',
        },
        {
          subitem: 'Cabos e moitão',
          item: 'Os cabos, moitão, ganchos e roldanas estão íntegros e adequados ao içamento previsto?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até substituição dos componentes inadequados.',
        },
        {
          subitem: 'Travamento do gancho',
          item: 'O gancho possui trava de segurança íntegra e funcional?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até recomposição da trava do gancho.',
        },
        {
          subitem: 'Cintas e acessórios',
          item: 'As cintas, manilhas e acessórios de içamento estão inspecionados e compatíveis com a carga?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o içamento até substituição ou adequação dos acessórios.',
        },
      ],
    },
    {
      id: 'munck-topic-4',
      titulo: 'Comandos, Área e Regras de Içamento',
      ordem: 4,
      itens: [
        {
          subitem: 'Comandos',
          item: 'Os comandos do equipamento respondem corretamente e sem movimentos anormais?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interditar o equipamento até correção e reteste funcional.',
        },
        {
          subitem: 'Parada de emergência',
          item: 'O sistema de parada ou bloqueio de emergência está operante quando aplicável?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o equipamento até reparo e validação.',
        },
        {
          subitem: 'Área isolada',
          item: 'A área de içamento está isolada, sinalizada e sem pessoas não autorizadas?',
          criticidade: 'alto',
          acao: 'Isolar e sinalizar adequadamente a área antes da operação.',
        },
        {
          subitem: 'Carga suspensa',
          item: 'Não há pessoas sob carga suspensa ou em trajetória de queda potencial?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender imediatamente a operação e desocupar a área de risco.',
        },
      ],
    },
    {
      id: 'munck-topic-5',
      titulo: 'Operador, Planejamento e Encerramento',
      ordem: 5,
      itens: [
        {
          subitem: 'Operador',
          item: 'O operador está capacitado e formalmente autorizado para o caminhão munck?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Impedir a operação por esse trabalhador até regularização formal.',
        },
        {
          subitem: 'Sinaleiro ou apoio',
          item: 'Existe apoio operacional compatível para comunicação e controle do içamento quando necessário?',
          criticidade: 'alto',
          acao: 'Reforçar o apoio operacional antes da continuidade do içamento.',
        },
        {
          subitem: 'Planejamento da carga',
          item: 'A carga está identificada, amarrada e dentro dos limites operacionais do equipamento?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o içamento até replanejamento da carga.',
        },
        {
          subitem: 'Encerramento',
          item: 'O equipamento é recolhido, estabilizado e desligado de forma segura após o uso?',
          criticidade: 'medio',
          acao: 'Regularizar o encerramento seguro após a atividade.',
        },
      ],
    },
  ]);
}
