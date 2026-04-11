import {
  ChecklistItemValue,
  ChecklistTopicValue,
} from './types/checklist-item.type';

export function buildExtensionLadderTopics(): ChecklistTopicValue[] {
  type ExtensionLadderItemDefinition = {
    subitem: string;
    item: string;
    criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
    bloqueia?: boolean;
    observacaoObrigatoria?: boolean;
    fotoObrigatoria?: boolean;
    acao?: string;
  };

  const createTopicItems = (
    items: ExtensionLadderItemDefinition[],
  ): ChecklistItemValue[] =>
    items.map((definition) => ({
      item: `${definition.subitem} - ${definition.item}`,
      tipo_resposta: 'sim_nao_na',
      obrigatorio: true,
      criticidade: definition.criticidade,
      bloqueia_operacao_quando_nc: definition.bloqueia,
      exige_observacao_quando_nc:
        definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
      exige_foto_quando_nc: definition.fotoObrigatoria,
      acao_corretiva_imediata: definition.acao,
    }));

  const topics: Array<{
    id: string;
    titulo: string;
    ordem: number;
    itens: ExtensionLadderItemDefinition[];
  }> = [
    {
      id: 'extension-ladder-topic-1',
      titulo: 'Identificação e Documentação',
      ordem: 1,
      itens: [
        {
          subitem: 'Identificação',
          item: 'Escada com identificação visível do fabricante, modelo e elemento de rastreabilidade',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a escada até identificação formal e rastreável do equipamento.',
        },
        {
          subitem: 'Marcação técnica',
          item: 'Escada com marcação técnica aplicável contendo fabricante, rastreabilidade, carga máxima e demais dados exigíveis',
          criticidade: 'alto',
          acao: 'Retirar de uso até regularização da marcação técnica aplicável.',
        },
        {
          subitem: 'Procedimento operacional',
          item: 'Procedimento operacional de uso e manutenção disponível e aplicável à escada extensível',
          criticidade: 'alto',
          acao: 'Suspender a utilização até disponibilização e divulgação do procedimento operacional.',
        },
        {
          subitem: 'Conteúdo do procedimento',
          item: 'Procedimento contempla orientações básicas, número máximo de usuários, carga máxima e limitações de uso',
          criticidade: 'alto',
          acao: 'Revisar o procedimento antes da liberação da escada para uso operacional.',
        },
        {
          subitem: 'Conformidade técnica',
          item: 'Escada certificada, fabricada ou projetada em conformidade com normas técnicas nacionais vigentes',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente até validação técnica documental da escada.',
        },
      ],
    },
    {
      id: 'extension-ladder-topic-2',
      titulo: 'Uso e Aplicação',
      ordem: 2,
      itens: [
        {
          subitem: 'Finalidade de uso',
          item: 'Uso restrito a serviços de pequeno porte e acessos temporários',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o uso e substituir por equipamento de acesso adequado.',
        },
        {
          subitem: 'Seleção do equipamento',
          item: 'Seleção da escada compatível com a tarefa e com execução segura',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a atividade e redefinir o meio de acesso ou posto de trabalho mais seguro.',
        },
        {
          subitem: 'Número de usuários',
          item: 'Uso por uma pessoa por vez, salvo previsão expressa do fabricante ou projetista',
          criticidade: 'alto',
          acao: 'Interromper imediatamente o uso compartilhado e restabelecer a condição segura.',
        },
        {
          subitem: 'Carga aplicada',
          item: 'Escada selecionada considerando o peso do trabalhador, equipamentos e materiais',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente e redimensionar a solução de acesso.',
        },
      ],
    },
    {
      id: 'extension-ladder-topic-3',
      titulo: 'Inspeção e Liberação',
      ordem: 3,
      itens: [
        {
          subitem: 'Inspeção inicial',
          item: 'Escada inspecionada no recebimento ou na liberação inicial para uso',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente até execução da inspeção inicial e formalização da liberação.',
        },
        {
          subitem: 'Inspeção pré-uso',
          item: 'Escada inspecionada antes de cada uso',
          criticidade: 'alto',
          acao: 'Suspender a atividade até realização da inspeção pré-uso.',
        },
        {
          subitem: 'Inspeção periódica',
          item: 'Escada submetida à inspeção periódica conforme fabricante ou projetista',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente até nova inspeção periódica válida.',
        },
        {
          subitem: 'Liberação após reparo',
          item: 'Escada reparada liberada somente após nova inspeção do responsável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente até reinspeção e nova liberação formal.',
        },
      ],
    },
    {
      id: 'extension-ladder-topic-4',
      titulo: 'Integridade Estrutural',
      ordem: 4,
      itens: [
        {
          subitem: 'Montantes',
          item: 'Montantes íntegros, sem trincas, empenos, corrosão, deformações ou danos mecânicos',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente e retirar a escada de uso.',
        },
        {
          subitem: 'Degraus',
          item: 'Degraus íntegros, firmes, alinhados e sem danos',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente e retirar a escada de uso.',
        },
        {
          subitem: 'Sapatas antiderrapantes',
          item: 'Sapatas ou dispositivos antiderrapantes íntegros e funcionais',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente até substituição do componente.',
        },
        {
          subitem: 'Improvisos',
          item: 'Ausência de improvisos, remendos, soldas indevidas, amarrações ou reparos não autorizados',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a escada e encaminhar para avaliação técnica.',
        },
      ],
    },
    {
      id: 'extension-ladder-topic-5',
      titulo: 'Estabilidade, Travamento e Fixação',
      ordem: 5,
      itens: [
        {
          subitem: 'Guias e travas',
          item: 'Guias e travas asseguram o travamento entre os lances deslizantes',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente e retirar a escada de uso.',
        },
        {
          subitem: 'Limitador de curso',
          item: 'Escada dotada de dispositivo limitador de curso no posicionamento exigido',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a escada.',
        },
        {
          subitem: 'Sobreposição mínima',
          item: 'Mecanismo assegura sobreposição mínima de 1 m entre os lances quando totalmente estendida',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a escada até adequação.',
        },
        {
          subitem: 'Fixação em mais de um ponto',
          item: 'Escada fixada em mais de um ponto quando a condição operacional permitir',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o uso até fixação adequada ou revisão formal do método.',
        },
        {
          subitem: 'Fixação mínima alternativa',
          item: 'Na impossibilidade de fixação em mais de um ponto, escada fixada em pelo menos um ponto resistente e estável, preferencialmente no nível superior',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente até correção da fixação.',
        },
        {
          subitem: 'Situação especial sem fixação',
          item: 'Em situação especial sem fixação, há medida que impeça deslocamento da escada e trabalhador permanece conectado a SPIQ independente',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade até restabelecimento das medidas de prevenção.',
        },
        {
          subitem: 'Piso e base',
          item: 'Apoio em piso ou base estável, regular e compatível com a carga',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente e reposicionar a escada em base segura.',
        },
      ],
    },
    {
      id: 'extension-ladder-topic-6',
      titulo: 'Uso Operacional Seguro',
      ordem: 6,
      itens: [
        {
          subitem: 'Portas e circulação',
          item: 'Escada não posicionada próxima a portas, circulação, aberturas ou vãos sem medidas de prevenção',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente até implementação das medidas de prevenção.',
        },
        {
          subitem: 'Prolongamento superior',
          item: 'Escada ultrapassa o nível superior em no mínimo 1 m quando utilizada como meio de acesso',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente até ajuste da posição ou substituição da escada.',
        },
        {
          subitem: 'Três pontos de contato',
          item: 'Trabalhador mantém 3 pontos de contato na subida e na descida',
          criticidade: 'alto',
          acao: 'Interromper imediatamente a atividade, orientar o trabalhador e reavaliar o método.',
        },
        {
          subitem: 'Posto de trabalho',
          item: 'Escada utilizada como posto de trabalho somente quando a tarefa pode ser executada com segurança',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente e substituir por meio de acesso ou posto de trabalho compatível.',
        },
        {
          subitem: 'Proteção contra quedas',
          item: 'Quando não for possível manter 3 pontos de contato no posto de trabalho, há sistema de proteção contra quedas compatível',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade.',
        },
      ],
    },
    {
      id: 'extension-ladder-topic-7',
      titulo: 'Gestão da Atividade',
      ordem: 7,
      itens: [
        {
          subitem: 'Análise de risco',
          item: 'AR elaborada contemplando o uso da escada, o tipo de acesso mais adequado e as condições impeditivas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade até emissão ou revisão da análise de risco.',
        },
        {
          subitem: 'Permissão de trabalho',
          item: 'PT emitida para atividade não rotineira, quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade até emissão da PT.',
        },
        {
          subitem: 'Trabalhador autorizado',
          item: 'Trabalhador formalmente autorizado para atividade em altura com escada de uso individual',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade e substituir o executante.',
        },
        {
          subitem: 'Capacitação',
          item: 'Trabalhador capacitado em NR-35 e orientado quanto ao uso seguro da escada de uso individual',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade até capacitação adequada.',
        },
        {
          subitem: 'Aptidão',
          item: 'Trabalhador com aptidão ocupacional compatível com trabalho em altura, quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade para o trabalhador não apto.',
        },
        {
          subitem: 'Condições impeditivas',
          item: 'Condições impeditivas definidas no procedimento e na análise de risco e conhecidas pela equipe',
          criticidade: 'alto',
          acao: 'Suspender a atividade até revisão documental e alinhamento da equipe.',
        },
        {
          subitem: 'Plano de emergência e resgate',
          item: 'Atividade possui plano de emergência e resgate compatível, quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade até implantação do plano de emergência e resgate.',
        },
      ],
    },
    {
      id: 'extension-ladder-topic-8',
      titulo: 'Bloqueio e Interdição',
      ordem: 8,
      itens: [
        {
          subitem: 'Retirada de uso por defeito',
          item: 'Escada é retirada de uso ao apresentar defeitos ou imperfeições que comprometam o desempenho',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente e segregar fisicamente a escada.',
        },
        {
          subitem: 'Identificação de interdição',
          item: 'Escada interditada identificada de forma visível como inapta ao uso',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Aplicar bloqueio e identificação visível de interdição imediatamente.',
        },
      ],
    },
  ];

  return topics.map((topic) => ({
    id: topic.id,
    titulo: topic.titulo,
    ordem: topic.ordem,
    itens: createTopicItems(topic.itens),
  }));
}
