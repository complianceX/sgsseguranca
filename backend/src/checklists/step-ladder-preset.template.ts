import {
  ChecklistItemValue,
  ChecklistTopicValue,
} from './types/checklist-item.type';

export function buildStepLadderTopics(): ChecklistTopicValue[] {
  type StepLadderItemDefinition = {
    subitem: string;
    item: string;
    criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
    bloqueia?: boolean;
    observacaoObrigatoria?: boolean;
    fotoObrigatoria?: boolean;
    acao?: string;
  };

  const createTopicItems = (
    items: StepLadderItemDefinition[],
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
    itens: StepLadderItemDefinition[];
  }> = [
    {
      id: 'step-ladder-topic-1',
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
          item: 'Escada com marcação técnica aplicável contendo fabricante, rastreabilidade, peso, carga máxima e demais dados exigíveis',
          criticidade: 'alto',
          acao: 'Retirar de uso até regularização da marcação técnica aplicável.',
        },
        {
          subitem: 'Procedimento operacional',
          item: 'Procedimento operacional de uso e manutenção disponível e aplicável à escada de abrir',
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
      id: 'step-ladder-topic-2',
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
          item: 'Carga aplicada compatível com a capacidade máxima informada pelo fabricante ou projetista',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente e redimensionar a solução de acesso.',
        },
        {
          subitem: 'Comprimento máximo',
          item: 'Comprimento da escada dentro do limite normativo aplicável quando fechada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente e substituir por solução tecnicamente adequada.',
        },
      ],
    },
    {
      id: 'step-ladder-topic-3',
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
          item: 'Escada submetida à inspeção periódica conforme fabricante ou procedimento interno',
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
      id: 'step-ladder-topic-4',
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
          subitem: 'Articuladores e dobradiças',
          item: 'Articuladores, dobradiças, travas e limitadores em perfeito estado de conservação e funcionamento',
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
          subitem: 'Limpeza e contaminação',
          item: 'Escada limpa e sem óleo, graxa, tinta ou contaminantes que comprometam aderência, inspeção ou estabilidade',
          criticidade: 'alto',
          acao: 'Retirar de uso até limpeza adequada e reavaliação da condição de segurança.',
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
      id: 'step-ladder-topic-5',
      titulo: 'Estabilidade e Posicionamento',
      ordem: 5,
      itens: [
        {
          subitem: 'Limitadores de abertura',
          item: 'Limitadores de abertura operantes na abertura máxima',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a escada.',
        },
        {
          subitem: 'Posição de uso',
          item: 'Escada utilizada somente na abertura máxima e nas posições indicadas pelo fabricante',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente e corrigir o posicionamento ou retirar de uso.',
        },
        {
          subitem: 'Piso e base',
          item: 'Piso estável, nivelado e compatível com o uso',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente e reposicionar a escada em base segura.',
        },
        {
          subitem: 'Interferências do entorno',
          item: 'Escada posicionada sem interferência de portas, circulação, desníveis, obstáculos ou risco de impacto lateral',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente até eliminação das interferências e controle da área.',
        },
        {
          subitem: 'Ferramentas e materiais',
          item: 'Ferramentas e materiais não comprometem a estabilidade da escada',
          criticidade: 'alto',
          acao: 'Interromper a atividade e reconfigurar o método de trabalho.',
        },
        {
          subitem: 'Materiais apoiados',
          item: 'Materiais apoiados na escada protegidos contra queda acidental, quando aplicável',
          criticidade: 'alto',
          acao: 'Suspender a atividade até implantação de contenção ou retirada do material da escada.',
        },
      ],
    },
    {
      id: 'step-ladder-topic-6',
      titulo: 'Uso Operacional Seguro',
      ordem: 6,
      itens: [
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
        {
          subitem: 'Postura e alcance',
          item: 'Trabalhador executa a tarefa sem projeção excessiva do tronco, sem alcance lateral crítico e sem perder o equilíbrio',
          criticidade: 'alto',
          acao: 'Interromper a atividade e readequar posicionamento, método ou equipamento.',
        },
      ],
    },
    {
      id: 'step-ladder-topic-7',
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
      id: 'step-ladder-topic-8',
      titulo: 'Bloqueio, Interdição e Pós-Uso',
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
        {
          subitem: 'Armazenamento e transporte',
          item: 'Escada armazenada e transportada sem causar danos à estrutura e sem exposição a agentes agressivos',
          criticidade: 'medio',
          acao: 'Corrigir o acondicionamento e reinspecionar a escada antes do próximo uso.',
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
