import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildNr24OperationalTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'nr24-topic-1',
      titulo: 'Aplicação e Dimensionamento',
      ordem: 1,
      itens: [
        {
          subitem: 'Dimensionamento',
          item: 'O dimensionamento considera o número de trabalhadores do turno de maior contingente?',
        },
        {
          subitem: 'Efetivo usuário',
          item: 'A estrutura disponível é compatível com o efetivo usuário das instalações?',
        },
        {
          subitem: 'Separação',
          item: 'Há separação por sexo das instalações quando exigida pela NR-24?',
        },
        {
          subitem: 'Acesso',
          item: 'Os trabalhadores conseguem utilizar as instalações sem restrição indevida durante a jornada?',
        },
      ],
    },
    {
      id: 'nr24-topic-2',
      titulo: 'Instalações Sanitárias',
      ordem: 2,
      itens: [
        {
          subitem: 'Disponibilidade',
          item: 'Existe instalação sanitária disponível no estabelecimento ou frente de trabalho?',
        },
        {
          subitem: 'Bacias sanitárias',
          item: 'As bacias sanitárias possuem assento, tampo e condição adequada de uso?',
        },
        {
          subitem: 'Privacidade',
          item: 'Os compartimentos sanitários garantem privacidade e fechamento adequado?',
        },
        {
          subitem: 'Conservação',
          item: 'As instalações sanitárias estão limpas, conservadas e em funcionamento?',
        },
      ],
    },
    {
      id: 'nr24-topic-3',
      titulo: 'Lavatórios e Chuveiros',
      ordem: 3,
      itens: [
        {
          subitem: 'Lavatórios',
          item: 'Há lavatórios em número compatível com os trabalhadores usuários?',
        },
        {
          subitem: 'Higienização das mãos',
          item: 'Existe material adequado para limpeza e secagem das mãos sem uso de toalha coletiva?',
        },
        {
          subitem: 'Chuveiros',
          item: 'Os chuveiros exigidos pela atividade estão disponíveis, íntegros e em funcionamento?',
        },
        {
          subitem: 'Área de banho',
          item: 'A área de banho possui piso, paredes, privacidade e conservação adequados?',
        },
      ],
    },
    {
      id: 'nr24-topic-4',
      titulo: 'Vestiários e Armários',
      ordem: 4,
      itens: [
        {
          subitem: 'Vestiário',
          item: 'Existe vestiário quando a atividade exige troca de roupa, uso de vestimenta especial ou chuveiro?',
        },
        {
          subitem: 'Estrutura do vestiário',
          item: 'O vestiário está limpo, ventilado e com circulação segura?',
        },
        {
          subitem: 'Assentos',
          item: 'Há assentos em número suficiente e em material lavável no vestiário?',
        },
        {
          subitem: 'Armários',
          item: 'Os armários individuais estão íntegros, permitem guarda adequada e possuem trancamento quando exigido?',
        },
      ],
    },
    {
      id: 'nr24-topic-5',
      titulo: 'Refeição e Água Potável',
      ordem: 5,
      itens: [
        {
          subitem: 'Local de refeição',
          item: 'Existe local de refeição compatível com o número de trabalhadores usuários?',
        },
        {
          subitem: 'Higiene do refeitório',
          item: 'O ambiente de refeição está limpo, ventilado e conservado?',
        },
        {
          subitem: 'Estrutura de apoio',
          item: 'Há mesas, assentos e meios adequados para aquecimento ou conservação dos alimentos quando exigidos?',
        },
        {
          subitem: 'Água potável',
          item: 'Há água potável disponível em condição segura para consumo dos trabalhadores?',
        },
      ],
    },
  ]);
}
