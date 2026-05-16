import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildExtensionLadderTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'extension-ladder-topic-1',
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
      id: 'extension-ladder-topic-2',
      titulo: 'Integridade Estrutural',
      ordem: 2,
      itens: [
        {
          subitem: 'Montantes',
          item: 'Os montantes estão íntegros, sem trincas, amassamentos ou deformações?',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear o uso até substituição da escada danificada.',
        },
        {
          subitem: 'Degraus',
          item: 'Os degraus estão íntegros, firmes e sem desgaste crítico?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até substituição da escada danificada.',
        },
        {
          subitem: 'Sapatas',
          item: 'As sapatas ou pés antiderrapantes estão presentes e em bom estado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até recomposição das sapatas.',
        },
        {
          subitem: 'Corda e roldana',
          item: 'A corda, a roldana e o sistema de extensão estão íntegros e operantes?',
          criticidade: 'alto',
          acao: 'Regularizar o sistema de extensão antes do uso.',
        },
      ],
    },
    {
      id: 'extension-ladder-topic-3',
      titulo: 'Posicionamento e Uso Operacional Seguro',
      ordem: 3,
      itens: [
        {
          subitem: 'Apoio inferior',
          item: 'A base da escada está apoiada em superfície firme, nivelada e sem risco de escorregamento?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até definição de apoio seguro.',
        },
        {
          subitem: 'Apoio superior',
          item: 'O ponto de apoio superior é estável e compatível com a escada utilizada?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até definição de apoio superior seguro.',
        },
        {
          subitem: 'Inclinação',
          item: 'A inclinação da escada está adequada ao uso seguro?',
          criticidade: 'alto',
          acao: 'Reposicionar a escada antes da utilização.',
        },
        {
          subitem: 'Prolongamento superior',
          item: 'A escada ultrapassa o nível superior em no mínimo 1 m quando utilizada como meio de acesso?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até reposicionamento ou troca da escada.',
        },
      ],
    },
    {
      id: 'extension-ladder-topic-4',
      titulo: 'Controle da Atividade e Encerramento',
      ordem: 4,
      itens: [
        {
          subitem: 'Amarração ou estabilização',
          item: 'A escada está amarrada, estabilizada ou protegida contra deslocamento quando necessário?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até estabilização adequada da escada.',
        },
        {
          subitem: 'Área isolada',
          item: 'A área de uso está livre de interferências, circulação perigosa e riscos elétricos?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até eliminação das interferências perigosas.',
        },
        {
          subitem: 'EPI e comportamento seguro',
          item: 'O trabalhador utiliza EPI aplicável e mantém comportamento seguro durante o uso?',
          criticidade: 'alto',
          acao: 'Interromper a atividade e corrigir o método antes da continuidade.',
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
