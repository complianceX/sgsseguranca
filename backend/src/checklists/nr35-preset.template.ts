import {
  ChecklistItemValue,
  ChecklistTopicValue,
} from './types/checklist-item.type';

export function buildNr35OperationalTopics(): ChecklistTopicValue[] {
  type Nr35ItemDefinition = {
    subitem: string;
    item: string;
    criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
    bloqueia?: boolean;
    observacaoObrigatoria?: boolean;
    fotoObrigatoria?: boolean;
    acao?: string;
  };

  const createTopicItems = (
    items: Nr35ItemDefinition[],
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
    itens: Nr35ItemDefinition[];
  }> = [
    {
      id: 'nr35-topic-1',
      titulo: 'Gestão Documental e Planejamento',
      ordem: 1,
      itens: [
        {
          subitem: 'Procedimento operacional',
          item: 'Procedimento de trabalho em altura está formalizado, aprovado e disponível para a atividade',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização do procedimento aplicável.',
        },
        {
          subitem: 'Análise de risco',
          item: 'Análise de risco contempla tarefa, local, interferências, condições impeditivas e medidas de controle',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até emissão ou revisão da análise de risco.',
        },
        {
          subitem: 'Permissão de trabalho',
          item: 'Permissão de trabalho foi emitida para atividade não rotineira, quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até emissão da permissão de trabalho aplicável.',
        },
        {
          subitem: 'Escopo e método',
          item: 'Escopo, sequência de execução, acessos, duração e interface com outras atividades estão definidos',
          criticidade: 'alto',
          acao: 'Revisar o planejamento antes do início da atividade.',
        },
        {
          subitem: 'Condições impeditivas',
          item: 'Condições impeditivas como chuva, vento, iluminação insuficiente e instabilidade estrutural estão definidas e avaliadas',
          criticidade: 'alto',
          acao: 'Suspender a atividade até definição e avaliação das condições impeditivas.',
        },
      ],
    },
    {
      id: 'nr35-topic-2',
      titulo: 'Pessoas, Capacitação e Autorização',
      ordem: 2,
      itens: [
        {
          subitem: 'Trabalhador autorizado',
          item: 'Somente trabalhador autorizado executa a atividade em altura',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até substituição ou autorização formal do executante.',
        },
        {
          subitem: 'Capacitação NR-35',
          item: 'Trabalhador possui capacitação válida e compatível com a atividade em altura',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até comprovação da capacitação aplicável.',
        },
        {
          subitem: 'Aptidão ocupacional',
          item: 'Aptidão ocupacional do trabalhador para atividade em altura está válida e sem restrições incompatíveis',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade para trabalhador sem aptidão válida.',
        },
        {
          subitem: 'Supervisão',
          item: 'Supervisão está compatível com o risco, a complexidade e a criticidade da atividade',
          criticidade: 'alto',
          acao: 'Adequar a supervisão antes do início da atividade.',
        },
        {
          subitem: 'DDS e alinhamento',
          item: 'Equipe recebeu alinhamento prévio sobre riscos, método de execução, resgate e interface com outras frentes',
          criticidade: 'alto',
          acao: 'Realizar alinhamento formal da equipe antes da atividade.',
        },
      ],
    },
    {
      id: 'nr35-topic-3',
      titulo: 'Local, Estrutura e Acessos',
      ordem: 3,
      itens: [
        {
          subitem: 'Integridade da estrutura',
          item: 'Estrutura, cobertura, plataforma, piso, telhado ou elemento de apoio foi avaliado quanto à resistência e estabilidade',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até avaliação e liberação da estrutura.',
        },
        {
          subitem: 'Acesso seguro',
          item: 'Meio de acesso ao posto de trabalho é seguro, adequado e compatível com a tarefa',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização de acesso seguro.',
        },
        {
          subitem: 'Organização da área',
          item: 'Área de trabalho está organizada, limpa e sem obstáculos que aumentem o risco de queda ou tropeço',
          criticidade: 'alto',
          acao: 'Organizar e limpar a área antes da atividade.',
        },
        {
          subitem: 'Área inferior isolada',
          item: 'Área inferior e entorno estão isolados ou controlados contra circulação de pessoas expostas à queda de materiais',
          criticidade: 'alto',
          acao: 'Isolar a área inferior antes do início da atividade.',
        },
        {
          subitem: 'Iluminação e visibilidade',
          item: 'Condição de iluminação e visibilidade é suficiente para execução segura da atividade',
          criticidade: 'alto',
          acao: 'Adequar a iluminação antes de iniciar ou continuar a atividade.',
        },
      ],
    },
    {
      id: 'nr35-topic-4',
      titulo: 'Sistema de Proteção Contra Quedas',
      ordem: 4,
      itens: [
        {
          subitem: 'Seleção do sistema',
          item: 'Sistema de proteção contra quedas foi selecionado de acordo com a análise de risco e a geometria do local',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até seleção correta do sistema de proteção.',
        },
        {
          subitem: 'Proteção coletiva',
          item: 'Medidas de proteção coletiva foram implantadas antes da adoção exclusiva de proteção individual quando tecnicamente aplicável',
          criticidade: 'alto',
          acao: 'Implantar ou justificar formalmente a medida de proteção coletiva.',
        },
        {
          subitem: 'SPIQ/SPQ compatível',
          item: 'Componentes do sistema são compatíveis entre si e com a atividade executada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até correção da compatibilidade do sistema.',
        },
        {
          subitem: 'Zona livre de queda',
          item: 'Configuração adotada considera a zona livre de queda e impede impacto com nível inferior ou obstáculos',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até reconfiguração técnica do sistema.',
        },
        {
          subitem: 'Conexão contínua',
          item: 'Método de trabalho garante proteção contínua durante toda a exposição ao risco de queda',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até garantir conexão contínua e segura.',
        },
      ],
    },
    {
      id: 'nr35-topic-5',
      titulo: 'Ancoragem e Componentes do Sistema',
      ordem: 5,
      itens: [
        {
          subitem: 'Ponto de ancoragem',
          item: 'Ponto de ancoragem é resistente, estável, identificado e compatível com o sistema utilizado',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até validação do ponto de ancoragem.',
        },
        {
          subitem: 'Conectores',
          item: 'Conectores e elementos de ligação estão íntegros, travando corretamente e sem risco de carga transversal',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até substituição dos componentes defeituosos.',
        },
        {
          subitem: 'Absorção de energia',
          item: 'Elemento de ligação para retenção de queda possui absorvedor de energia quando exigível',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até adequação do sistema de retenção de queda.',
        },
        {
          subitem: 'Inspeção dos componentes',
          item: 'Componentes do sistema foram inspecionados antes do uso e não apresentam dano, desgaste ou contaminação',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade e substituir os componentes reprovados.',
        },
        {
          subitem: 'Improvisos',
          item: 'Não há nós, emendas, extensores improvisados ou conexões não previstas pelo fabricante',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade e eliminar os improvisos do sistema.',
        },
      ],
    },
    {
      id: 'nr35-topic-6',
      titulo: 'EPI, Ferramentas e Materiais',
      ordem: 6,
      itens: [
        {
          subitem: 'Cinturão e talabarte',
          item: 'Cinturão, talabarte, trava-quedas e demais EPIs estão adequados, identificados e em condição segura de uso',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até substituição ou aprovação formal dos EPIs.',
        },
        {
          subitem: 'Capacete e jugular',
          item: 'Capacete com jugular e demais EPIs complementares exigidos estão em uso correto',
          criticidade: 'alto',
          acao: 'Adequar o uso dos EPIs antes da atividade.',
        },
        {
          subitem: 'Ferramentas em altura',
          item: 'Ferramentas e materiais estão controlados contra queda acidental por amarração, bolsa ou sistema equivalente',
          criticidade: 'alto',
          acao: 'Controlar ferramentas e materiais antes do início da atividade.',
        },
        {
          subitem: 'Carga transportada',
          item: 'Transporte manual de materiais não compromete equilíbrio, postura e proteção contínua do trabalhador',
          criticidade: 'alto',
          acao: 'Rever o método de transporte de materiais antes da atividade.',
        },
        {
          subitem: 'Adornos e vestimentas',
          item: 'Não há uso de adornos, vestimentas soltas ou condições pessoais que aumentem o risco durante a atividade',
          criticidade: 'medio',
          acao: 'Regularizar a condição pessoal do trabalhador antes da atividade.',
        },
      ],
    },
    {
      id: 'nr35-topic-7',
      titulo: 'Execução da Atividade',
      ordem: 7,
      itens: [
        {
          subitem: 'Postura e posicionamento',
          item: 'Trabalhador executa a atividade em postura estável, sem alcance excessivo e sem exposição desnecessária à borda ou ao vazio',
          criticidade: 'alto',
          acao: 'Readequar o posicionamento e o método de execução.',
        },
        {
          subitem: 'Mudança de nível',
          item: 'Mudanças de nível, transposição de obstáculos e passagem por bordas são realizadas com método seguro e proteção contínua',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até correção do método de transposição.',
        },
        {
          subitem: 'Condição climática',
          item: 'Condições climáticas reais permanecem compatíveis com a execução segura da atividade durante toda a intervenção',
          criticidade: 'alto',
          acao: 'Suspender a atividade diante de condição climática adversa.',
        },
        {
          subitem: 'Interferência simultânea',
          item: 'Atividades simultâneas com risco de interferência foram controladas ou segregadas',
          criticidade: 'alto',
          acao: 'Segregar ou reprogramar as atividades interferentes.',
        },
        {
          subitem: 'Reavaliação dinâmica',
          item: 'Mudanças no cenário de risco geram parada e reavaliação formal da atividade',
          criticidade: 'alto',
          acao: 'Interromper a atividade e revisar a análise de risco.',
        },
      ],
    },
    {
      id: 'nr35-topic-8',
      titulo: 'Emergência, Resgate e Comunicação',
      ordem: 8,
      itens: [
        {
          subitem: 'Plano de resgate',
          item: 'Plano de emergência e resgate está definido, compatível com o local e conhecido pela equipe',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até implantação do plano de resgate aplicável.',
        },
        {
          subitem: 'Recursos de resgate',
          item: 'Recursos, equipamentos e meios de acesso para resgate estão disponíveis e operacionais',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização dos recursos de resgate.',
        },
        {
          subitem: 'Equipe de resposta',
          item: 'Equipe designada para resposta conhece o procedimento e está apta a atuar no tempo necessário',
          criticidade: 'alto',
          acao: 'Adequar a equipe de resposta antes do início da atividade.',
        },
        {
          subitem: 'Comunicação',
          item: 'Há meio de comunicação funcional entre executantes, supervisão e equipe de resposta',
          criticidade: 'alto',
          acao: 'Restabelecer meio de comunicação confiável antes da atividade.',
        },
        {
          subitem: 'Primeiros socorros',
          item: 'Recursos mínimos de primeiros socorros e fluxo de acionamento emergencial estão definidos',
          criticidade: 'medio',
          acao: 'Regularizar os recursos e o fluxo de emergência.',
        },
      ],
    },
    {
      id: 'nr35-topic-9',
      titulo: 'Sinalização, Isolamento e Controle do Entorno',
      ordem: 9,
      itens: [
        {
          subitem: 'Sinalização de risco',
          item: 'Sinalização de advertência está instalada e visível para impedir acesso indevido à área de risco',
          criticidade: 'alto',
          acao: 'Implantar a sinalização antes do início da atividade.',
        },
        {
          subitem: 'Controle de queda de objetos',
          item: 'Há medidas de retenção ou proteção contra queda de ferramentas, materiais e fragmentos',
          criticidade: 'alto',
          acao: 'Instalar proteção ou retenção contra queda de objetos.',
        },
        {
          subitem: 'Trânsito e circulação',
          item: 'Fluxos de pedestres, veículos e equipamentos próximos foram controlados para evitar exposição ao risco',
          criticidade: 'alto',
          acao: 'Controlar o trânsito e a circulação antes da atividade.',
        },
        {
          subitem: 'Interdição física',
          item: 'Barreiras físicas ou controles equivalentes impedem aproximação de pessoas não envolvidas na atividade',
          criticidade: 'alto',
          acao: 'Implantar barreiras físicas ou controle efetivo do entorno.',
        },
        {
          subitem: 'Sinalização noturna',
          item: 'Quando aplicável, a área possui sinalização complementar para condição noturna ou baixa visibilidade',
          criticidade: 'medio',
          acao: 'Reforçar a sinalização para condição de baixa visibilidade.',
        },
      ],
    },
    {
      id: 'nr35-topic-10',
      titulo: 'Desvios, Inspeção e Interdição',
      ordem: 10,
      itens: [
        {
          subitem: 'Inspeção prévia',
          item: 'Inspeção prévia da frente de serviço confirma que as medidas previstas estão implementadas e eficazes',
          criticidade: 'alto',
          acao: 'Executar a inspeção prévia antes da atividade.',
        },
        {
          subitem: 'Registro de desvios',
          item: 'Desvios, incidentes e quase acidentes são registrados e tratados com ação corretiva',
          criticidade: 'medio',
          acao: 'Formalizar o registro e a tratativa dos desvios identificados.',
        },
        {
          subitem: 'Interdição por falha grave',
          item: 'Atividade é interditada imediatamente diante de falha grave de proteção, ancoragem, estrutura ou resgate',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interditar imediatamente a atividade até eliminação da falha grave.',
        },
        {
          subitem: 'Liberação após correção',
          item: 'Retomada da atividade ocorre somente após correção, reinspeção e nova liberação formal quando aplicável',
          criticidade: 'alto',
          acao: 'Reinspecionar e formalizar a liberação antes da retomada.',
        },
        {
          subitem: 'Auditoria operacional',
          item: 'Atividades críticas em altura são auditadas periodicamente para verificação de aderência ao procedimento',
          criticidade: 'medio',
          acao: 'Implantar ou reforçar auditoria operacional das atividades em altura.',
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
