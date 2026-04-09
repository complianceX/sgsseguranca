import { ChecklistItemValue, ChecklistTopicValue } from './types/checklist-item.type';

export function buildGrinderTopics(): ChecklistTopicValue[] {
  type GrinderItemDefinition = {
    subitem: string;
    item: string;
    criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
    bloqueia?: boolean;
    observacaoObrigatoria?: boolean;
    fotoObrigatoria?: boolean;
    acao?: string;
  };

  const createTopicItems = (
    items: GrinderItemDefinition[],
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
    itens: GrinderItemDefinition[];
  }> = [
    {
      id: 'grinder-topic-1',
      titulo: 'Identificação e Documentação',
      ordem: 1,
      itens: [
        {
          subitem: 'Identificação da ferramenta',
          item: 'Lixadeira identificada por patrimônio, número de série, tag ou controle interno rastreável',
          criticidade: 'alto',
          acao: 'Regularizar a identificação da lixadeira antes do uso.',
        },
        {
          subitem: 'Manual do fabricante',
          item: 'Manual do fabricante ou instrução operacional está disponível para consulta',
          criticidade: 'medio',
          acao: 'Disponibilizar a instrução técnica aplicável antes da liberação.',
        },
        {
          subitem: 'Especificação técnica',
          item: 'Tensão, potência, rotação nominal e diâmetro máximo do acessório estão legíveis',
          criticidade: 'alto',
          acao: 'Suspender a liberação até restabelecer a identificação técnica mínima da ferramenta.',
        },
        {
          subitem: 'Registro de inspeção',
          item: 'Registro de inspeção periódica e manutenção está disponível',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a ferramenta até execução e registro da inspeção aplicável.',
        },
      ],
    },
    {
      id: 'grinder-topic-2',
      titulo: 'Condição Geral da Ferramenta',
      ordem: 2,
      itens: [
        {
          subitem: 'Carcaça',
          item: 'Carcaça da lixadeira íntegra, sem trincas, deformações ou partes soltas',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a lixadeira e encaminhar para manutenção ou substituição.',
        },
        {
          subitem: 'Empunhadura principal',
          item: 'Empunhadura principal firme, íntegra e sem folgas',
          criticidade: 'alto',
          acao: 'Retirar de uso até correção da empunhadura principal.',
        },
        {
          subitem: 'Limpeza',
          item: 'Ferramenta limpa e sem acúmulo excessivo de pó, óleo, graxa ou resíduos abrasivos',
          criticidade: 'medio',
          acao: 'Limpar a ferramenta antes do uso e reinspecionar sua condição.',
        },
        {
          subitem: 'Ventilação',
          item: 'Aberturas de ventilação desobstruídas e sem sinais de superaquecimento',
          criticidade: 'alto',
          acao: 'Desobstruir as aberturas e avaliar a condição térmica antes da operação.',
        },
        {
          subitem: 'Danos aparentes',
          item: 'Ausência de amassamentos, impactos, improvisos ou sinais de reparo inadequado',
          criticidade: 'alto',
          fotoObrigatoria: true,
          acao: 'Retirar de uso e submeter a ferramenta à avaliação técnica.',
        },
      ],
    },
    {
      id: 'grinder-topic-3',
      titulo: 'Cabo, Plugue, Bateria e Alimentação',
      ordem: 3,
      itens: [
        {
          subitem: 'Cabo de alimentação',
          item: 'Cabo de alimentação íntegro e sem emendas improvisadas, cortes ou exposição de condutores',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a ferramenta e substituir o cabo por componente adequado.',
        },
        {
          subitem: 'Plugue',
          item: 'Plugue em bom estado, sem pinos danificados, aquecimento ou folga',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Retirar de uso imediatamente e substituir o plugue conforme padrão aplicável.',
        },
        {
          subitem: 'Isolação elétrica',
          item: 'Isolação elétrica sem danos aparentes e sem contato exposto com partes energizadas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a ferramenta até correção elétrica e nova inspeção.',
        },
        {
          subitem: 'Extensão elétrica',
          item: 'Extensão utilizada está em boas condições e adequada à carga da lixadeira',
          criticidade: 'alto',
          acao: 'Proibir o uso da extensão inadequada e substituir por extensão compatível.',
        },
        {
          subitem: 'Bateria e carregador',
          item: 'Quando aplicável, bateria e carregador estão íntegros, sem trincas, vazamentos ou superaquecimento',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a ferramenta e segregar bateria ou carregador defeituoso para avaliação.',
        },
      ],
    },
    {
      id: 'grinder-topic-4',
      titulo: 'Disco, Rebolo, Lixa e Acessórios',
      ordem: 4,
      itens: [
        {
          subitem: 'Compatibilidade do acessório',
          item: 'Disco, rebolo, lixa ou acessório compatível com o modelo e a rotação da lixadeira',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a ferramenta até instalação de acessório compatível com o equipamento.',
        },
        {
          subitem: 'Integridade do acessório',
          item: 'Disco, rebolo, lixa ou acessório sem trinca, lasca, empeno, umidade ou desgaste incompatível',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a lixadeira e substituir o acessório reprovado.',
        },
        {
          subitem: 'Validade e armazenamento',
          item: 'Acessórios abrasivos estão dentro da validade aplicável e foram armazenados corretamente',
          criticidade: 'alto',
          acao: 'Substituir o acessório inadequado e revisar o armazenamento.',
        },
        {
          subitem: 'Sentido de montagem',
          item: 'Acessório está montado no sentido correto e de acordo com a orientação do fabricante',
          criticidade: 'alto',
          acao: 'Desmontar e reinstalar corretamente o acessório antes da operação.',
        },
        {
          subitem: 'Chave de aperto',
          item: 'Chave de aperto e acessórios de montagem estão disponíveis e em boas condições',
          criticidade: 'medio',
          acao: 'Disponibilizar ferramenta de montagem adequada antes da liberação.',
        },
      ],
    },
    {
      id: 'grinder-topic-5',
      titulo: 'Proteções e Empunhaduras',
      ordem: 5,
      itens: [
        {
          subitem: 'Guarda de proteção',
          item: 'Guarda de proteção instalada, íntegra e corretamente posicionada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a lixadeira até reinstalação ou substituição da guarda de proteção.',
        },
        {
          subitem: 'Empunhadura auxiliar',
          item: 'Empunhadura auxiliar instalada e firme quando exigida pela operação ou pelo fabricante',
          criticidade: 'alto',
          acao: 'Instalar ou corrigir a empunhadura auxiliar antes do uso.',
        },
        {
          subitem: 'Flanges e porca',
          item: 'Flanges, porca de fixação e superfícies de apoio estão íntegros, limpos e compatíveis com o acessório',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a ferramenta até correção ou substituição dos componentes de fixação.',
        },
        {
          subitem: 'Proteção removível',
          item: 'Não há retirada indevida, improviso ou adaptação na proteção original da ferramenta',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a ferramenta e restabelecer a configuração original de proteção.',
        },
      ],
    },
    {
      id: 'grinder-topic-6',
      titulo: 'Gatilho, Comandos e Funcionamento',
      ordem: 6,
      itens: [
        {
          subitem: 'Gatilho',
          item: 'Gatilho de acionamento funciona corretamente, sem travamento indevido ou acionamento involuntário',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a ferramenta até reparo e reteste funcional.',
        },
        {
          subitem: 'Trava de segurança',
          item: 'Trava de segurança ou sistema equivalente funciona conforme previsto no equipamento',
          criticidade: 'alto',
          acao: 'Retirar de uso até correção do sistema de segurança do acionamento.',
        },
        {
          subitem: 'Partida e rotação',
          item: 'Partida ocorre sem oscilação excessiva, ruído anormal ou vibração incompatível',
          criticidade: 'alto',
          acao: 'Interromper o uso e encaminhar para avaliação técnica.',
        },
        {
          subitem: 'Parada do acessório',
          item: 'Acessório desacelera e para de forma compatível, sem desprendimento ou instabilidade',
          criticidade: 'alto',
          acao: 'Retirar a ferramenta de uso até diagnóstico do conjunto rotativo.',
        },
        {
          subitem: 'Ruído e vibração',
          item: 'Ausência de ruído anormal, vibração excessiva ou batimento durante o funcionamento',
          criticidade: 'alto',
          acao: 'Retirar a lixadeira de uso até correção da condição anormal.',
        },
      ],
    },
    {
      id: 'grinder-topic-7',
      titulo: 'Segurança Elétrica e Condições do Local',
      ordem: 7,
      itens: [
        {
          subitem: 'Ponto de alimentação',
          item: 'Ponto de alimentação elétrica está em condição segura e compatível com a ferramenta',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até correção do ponto de alimentação.',
        },
        {
          subitem: 'Atmosfera e inflamáveis',
          item: 'Local não apresenta condição com inflamáveis, explosivos ou poeiras combustíveis incompatíveis com faísca do processo',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até eliminação ou controle da condição perigosa do ambiente.',
        },
        {
          subitem: 'Faíscas e projeções',
          item: 'Direção de faíscas e partículas está controlada para não atingir pessoas, cabos, recipientes ou materiais sensíveis',
          criticidade: 'alto',
          acao: 'Reposicionar a atividade ou implantar barreiras e proteção do entorno.',
        },
        {
          subitem: 'Base e apoio da peça',
          item: 'Peça ou material a ser trabalhado está apoiado ou fixado de forma estável',
          criticidade: 'alto',
          acao: 'Fixar corretamente a peça antes do início da operação.',
        },
        {
          subitem: 'Interferências do entorno',
          item: 'Trânsito de pessoas, cabos no piso e obstáculos do entorno estão controlados',
          criticidade: 'alto',
          acao: 'Organizar e isolar o entorno antes da operação.',
        },
      ],
    },
    {
      id: 'grinder-topic-8',
      titulo: 'Operação Segura e Inspeção Pré-Uso',
      ordem: 8,
      itens: [
        {
          subitem: 'Inspeção pré-uso',
          item: 'Inspeção pré-uso foi realizada antes do início da atividade e não identificou condição impeditiva',
          criticidade: 'alto',
          acao: 'Realizar a inspeção pré-uso antes da operação.',
        },
        {
          subitem: 'Operador autorizado',
          item: 'Operador está orientado, autorizado e apto a utilizar a lixadeira',
          criticidade: 'alto',
          acao: 'Regularizar a qualificação e autorização do operador.',
        },
        {
          subitem: 'Uso compatível',
          item: 'Ferramenta está sendo utilizada somente para a aplicação prevista e com acessório correto',
          criticidade: 'alto',
          acao: 'Interromper o uso inadequado e selecionar ferramenta e acessório compatíveis.',
        },
        {
          subitem: 'Força de aplicação',
          item: 'Operação não exige força excessiva nem pressão incompatível sobre o acessório abrasivo',
          criticidade: 'medio',
          acao: 'Reorientar a técnica de trabalho antes de prosseguir.',
        },
        {
          subitem: 'Partida protegida',
          item: 'Partida é realizada com ferramenta estável, sem contato indevido do acessório com a peça ou superfícies adjacentes',
          criticidade: 'alto',
          acao: 'Corrigir o procedimento de partida antes da operação.',
        },
      ],
    },
    {
      id: 'grinder-topic-9',
      titulo: 'Manutenção, Bloqueio e Liberação',
      ordem: 9,
      itens: [
        {
          subitem: 'Manutenção periódica',
          item: 'Manutenção preventiva ou corretiva está dentro da rotina definida para a ferramenta',
          criticidade: 'medio',
          acao: 'Regularizar a manutenção da lixadeira conforme plano definido.',
        },
        {
          subitem: 'Bloqueio por defeito',
          item: 'Ferramenta com defeito, dano elétrico, falha funcional ou proteção ausente está segregada e identificada como inapta',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a ferramenta defeituosa e retirar de circulação.',
        },
        {
          subitem: 'Liberação após reparo',
          item: 'Ferramenta reparada somente retorna ao uso após inspeção e liberação formal',
          criticidade: 'alto',
          acao: 'Reinspecionar e liberar formalmente antes do retorno ao uso.',
        },
        {
          subitem: 'Improvisos e adaptações',
          item: 'Não há adaptações improvisadas, pontes, gambiarras ou peças incompatíveis instaladas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a ferramenta e remover as adaptações indevidas.',
        },
      ],
    },
    {
      id: 'grinder-topic-10',
      titulo: 'Pós-Uso, Transporte e Armazenamento',
      ordem: 10,
      itens: [
        {
          subitem: 'Desligamento ao final',
          item: 'Ferramenta é desligada e desenergizada ao final da atividade ou em interrupções prolongadas',
          criticidade: 'alto',
          acao: 'Desligar e desenergizar corretamente a ferramenta ao encerrar a atividade.',
        },
        {
          subitem: 'Acessório após uso',
          item: 'Disco, rebolo ou acessório é removido, inspecionado ou mantido em condição segura após o uso',
          criticidade: 'medio',
          acao: 'Acondicionar corretamente o acessório após o uso.',
        },
        {
          subitem: 'Transporte',
          item: 'Transporte é realizado sem impactos, arraste pelo cabo ou dano às proteções e acessórios',
          criticidade: 'medio',
          acao: 'Corrigir o método de transporte da ferramenta.',
        },
        {
          subitem: 'Armazenamento',
          item: 'Lixadeira e acessórios são armazenados em local seco, protegido e organizado',
          criticidade: 'medio',
          acao: 'Adequar o local e a forma de armazenamento da ferramenta.',
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
