import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildStepLadderTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'step-ladder-topic-1',
      titulo: 'Identificação e Documentação',
      ordem: 1,
      itens: [
        {
          subitem: 'Identificação',
          item: 'A escada possui identificação visível do fabricante, modelo e elemento de rastreabilidade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até regularização da identificação da escada.',
        },
        {
          subitem: 'Capacidade',
          item: 'A capacidade de carga e as orientações básicas de uso estão legíveis?',
          criticidade: 'alto',
          acao: 'Regularizar a identificação da capacidade antes da liberação.',
        },
        {
          subitem: 'Inspeção pré-uso',
          item: 'Existe evidência de inspeção pré-uso ou rotina de controle da escada?',
          criticidade: 'alto',
          acao: 'Regularizar a inspeção antes da utilização.',
        },
        {
          subitem: 'Compatibilidade de uso',
          item: 'A escada é adequada para o tipo de atividade e altura de acesso pretendidos?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até seleção de equipamento compatível.',
        },
      ],
    },
    {
      id: 'step-ladder-topic-2',
      titulo: 'Integridade Estrutural',
      ordem: 2,
      itens: [
        {
          subitem: 'Montantes e degraus',
          item: 'Os montantes e degraus estão íntegros, firmes e sem deformações?',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear o uso até substituição da escada danificada.',
        },
        {
          subitem: 'Articuladores e dobradiças',
          item: 'Os articuladores, dobradiças, travas e limitadores estão em perfeito estado de conservação e funcionamento?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até correção dos componentes estruturais.',
        },
        {
          subitem: 'Sapatas',
          item: 'As sapatas ou pés antiderrapantes estão presentes e em bom estado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até recomposição das sapatas.',
        },
        {
          subitem: 'Plataforma ou topo',
          item: 'A plataforma superior ou o topo da escada está íntegro e sem danos críticos?',
          criticidade: 'alto',
          acao: 'Retirar de uso até correção estrutural da escada.',
        },
      ],
    },
    {
      id: 'step-ladder-topic-3',
      titulo: 'Estabilidade e Posicionamento',
      ordem: 3,
      itens: [
        {
          subitem: 'Limitadores de abertura',
          item: 'Os limitadores de abertura estão operantes na abertura máxima?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até correção dos limitadores de abertura.',
        },
        {
          subitem: 'Abertura completa',
          item: 'A escada é utilizada totalmente aberta e travada na posição correta?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até posicionamento correto da escada.',
        },
        {
          subitem: 'Base de apoio',
          item: 'A base da escada está apoiada em superfície firme, nivelada e sem risco de escorregamento?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até definição de apoio seguro.',
        },
        {
          subitem: 'Interferências',
          item: 'A escada está posicionada sem interferências perigosas de circulação, portas ou redes elétricas?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até eliminação das interferências perigosas.',
        },
      ],
    },
    {
      id: 'step-ladder-topic-4',
      titulo: 'Uso Operacional Seguro e Encerramento',
      ordem: 4,
      itens: [
        {
          subitem: 'Comportamento seguro',
          item: 'O trabalhador mantém três pontos de contato e não utiliza a escada de forma improvisada?',
          criticidade: 'alto',
          acao: 'Interromper a atividade e corrigir o método antes da continuidade.',
        },
        {
          subitem: 'EPI',
          item: 'O trabalhador utiliza EPI aplicável e compatível com a atividade executada?',
          criticidade: 'alto',
          acao: 'Regularizar o uso de EPI antes da continuidade.',
        },
        {
          subitem: 'Ferramentas e materiais',
          item: 'As ferramentas e materiais estão controlados sem comprometer o equilíbrio durante o uso?',
          criticidade: 'alto',
          acao: 'Reorganizar as ferramentas e revisar o método antes da continuidade.',
        },
        {
          subitem: 'Pós-uso',
          item: 'A escada é retirada de uso, armazenada e interditada quando houver dano ou não conformidade?',
          criticidade: 'medio',
          acao: 'Regularizar o encerramento e a interdição da escada quando necessário.',
        },
      ],
    },
  ]);
}
