import { ChecklistItemValue, ChecklistTopicValue } from './types/checklist-item.type';

export function buildNr33OperationalTopics(): ChecklistTopicValue[] {
  type Nr33ItemDefinition = {
    subitem: string;
    item: string;
    criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
    bloqueia?: boolean;
    observacaoObrigatoria?: boolean;
    fotoObrigatoria?: boolean;
    acao?: string;
  };

  const createTopicItems = (
    items: Nr33ItemDefinition[],
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
    itens: Nr33ItemDefinition[];
  }> = [
    {
      id: 'nr33-topic-1',
      titulo: 'Gestão, Cadastro e Planejamento',
      ordem: 1,
      itens: [
        {
          subitem: 'Cadastro do espaço',
          item: 'Espaço confinado está cadastrado, identificado e com perigos conhecidos formalmente',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até cadastro e identificação formal do espaço confinado.',
        },
        {
          subitem: 'Procedimento operacional',
          item: 'Procedimento de entrada, trabalho e saída está formalizado e disponível para a equipe',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização do procedimento aplicável.',
        },
        {
          subitem: 'Análise de risco',
          item: 'Análise de risco contempla atmosfera, energias perigosas, soterramento, inundação, aprisionamento e resgate',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até emissão ou revisão da análise de risco.',
        },
        {
          subitem: 'Condições impeditivas',
          item: 'Condições impeditivas para entrada e permanência foram definidas e avaliadas antes do início da atividade',
          criticidade: 'alto',
          acao: 'Suspender a atividade até definição e avaliação das condições impeditivas.',
        },
        {
          subitem: 'Compatibilização de frentes',
          item: 'Interfaces com outras atividades, utilidades e processos do entorno foram avaliadas e controladas',
          criticidade: 'alto',
          acao: 'Compatibilizar as interfaces antes do início da atividade.',
        },
      ],
    },
    {
      id: 'nr33-topic-2',
      titulo: 'PET e Controle Formal da Entrada',
      ordem: 2,
      itens: [
        {
          subitem: 'Permissão de entrada e trabalho',
          item: 'PET foi emitida, aprovada e está disponível no local da atividade',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até emissão e aprovação da PET.',
        },
        {
          subitem: 'Escopo da PET',
          item: 'PET descreve serviço, local, equipe, período, riscos, controles e critérios de cancelamento',
          criticidade: 'alto',
          acao: 'Revisar e complementar a PET antes da entrada.',
        },
        {
          subitem: 'Validade da PET',
          item: 'PET está dentro da validade e compatível com as condições reais do serviço',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até emissão de PET válida e compatível.',
        },
        {
          subitem: 'Cancelamento por mudança',
          item: 'Mudanças de escopo, condição atmosférica ou operacional geram cancelamento e reemissão da PET',
          criticidade: 'alto',
          acao: 'Cancelar a PET e reavaliar a atividade diante de mudança de condição.',
        },
        {
          subitem: 'Encerramento formal',
          item: 'Saída dos trabalhadores e encerramento da PET são formalizados ao término da atividade',
          criticidade: 'medio',
          acao: 'Regularizar o encerramento formal da PET ao fim da atividade.',
        },
      ],
    },
    {
      id: 'nr33-topic-3',
      titulo: 'Pessoas, Papéis e Capacitação',
      ordem: 3,
      itens: [
        {
          subitem: 'Supervisor de entrada',
          item: 'Supervisor de entrada está designado, capacitado e acompanha o cumprimento dos requisitos da PET',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até designação de supervisor de entrada capacitado.',
        },
        {
          subitem: 'Vigia',
          item: 'Vigia permanece dedicado ao monitoramento externo, sem acúmulo indevido de função durante a entrada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até disponibilização de vigia exclusivo.',
        },
        {
          subitem: 'Trabalhadores autorizados',
          item: 'Entrantes estão autorizados, capacitados e cientes dos riscos, sinais de alerta e procedimentos de saída',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até regularização da autorização e capacitação dos entrantes.',
        },
        {
          subitem: 'Aptidão ocupacional',
          item: 'Equipe possui aptidão ocupacional válida e compatível com trabalho em espaço confinado',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada para trabalhadores sem aptidão válida.',
        },
        {
          subitem: 'Alinhamento prévio',
          item: 'Equipe realizou alinhamento prévio sobre riscos, sequência de trabalho, comunicação e resgate',
          criticidade: 'alto',
          acao: 'Realizar alinhamento formal antes da entrada.',
        },
      ],
    },
    {
      id: 'nr33-topic-4',
      titulo: 'Isolamento, Bloqueio e Controle de Energias',
      ordem: 4,
      itens: [
        {
          subitem: 'Isolamento de energias',
          item: 'Fontes de energia elétrica, mecânica, pneumática, hidráulica, térmica e outras foram isoladas de forma segura',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até isolamento completo das energias perigosas.',
        },
        {
          subitem: 'Bloqueio e etiquetagem',
          item: 'Pontos de bloqueio estão identificados, bloqueados e etiquetados conforme procedimento aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até aplicação correta do bloqueio e etiquetagem.',
        },
        {
          subitem: 'Linhas e tubulações',
          item: 'Linhas, vasos, dutos e conexões com potencial de ingresso de produto, vapor ou fluido estão isolados, cegados ou desconectados',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até neutralização do risco de ingresso indevido.',
        },
        {
          subitem: 'Partes móveis',
          item: 'Partes móveis, agitadores, transportadores e mecanismos internos estão travados ou neutralizados',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até neutralização dos movimentos perigosos.',
        },
        {
          subitem: 'Verificação do isolamento',
          item: 'Efetividade do isolamento foi verificada antes da autorização para entrada',
          criticidade: 'alto',
          acao: 'Executar e registrar a verificação do isolamento antes da entrada.',
        },
      ],
    },
    {
      id: 'nr33-topic-5',
      titulo: 'Avaliação Atmosférica e Ventilação',
      ordem: 5,
      itens: [
        {
          subitem: 'Teste atmosférico inicial',
          item: 'Atmosfera interna foi testada antes da entrada com instrumento adequado e calibrado',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até realização do teste atmosférico inicial.',
        },
        {
          subitem: 'Faixas aceitáveis',
          item: 'Resultados de oxigênio, inflamáveis e contaminantes tóxicos estão dentro dos limites seguros definidos',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até restabelecimento de atmosfera segura.',
        },
        {
          subitem: 'Monitoramento contínuo',
          item: 'Há monitoramento contínuo ou periódico da atmosfera conforme risco e procedimento',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até implantação do monitoramento exigido.',
        },
        {
          subitem: 'Ventilação',
          item: 'Ventilação natural ou forçada é suficiente para manter atmosfera segura durante toda a atividade',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até adequação da ventilação.',
        },
        {
          subitem: 'Posicionamento da ventilação',
          item: 'Captação, insuflamento e exaustão estão posicionados de forma eficaz e sem recircular contaminantes',
          criticidade: 'alto',
          acao: 'Reposicionar ou corrigir o sistema de ventilação antes da continuidade.',
        },
      ],
    },
    {
      id: 'nr33-topic-6',
      titulo: 'Acesso, Permanência e Comunicação',
      ordem: 6,
      itens: [
        {
          subitem: 'Meio de acesso',
          item: 'Meio de acesso e saída do espaço confinado é seguro, desobstruído e compatível com a atividade e o resgate',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até adequação do acesso e da saída.',
        },
        {
          subitem: 'Controle de entrada e saída',
          item: 'Controle nominal de entrantes e horário de entrada/saída está ativo e atualizado',
          criticidade: 'alto',
          acao: 'Regularizar o controle de entrada e saída antes da continuidade.',
        },
        {
          subitem: 'Comunicação vigia-equipe',
          item: 'Há meio de comunicação funcional e contínuo entre vigia, entrantes e supervisor',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até restabelecimento da comunicação confiável.',
        },
        {
          subitem: 'Quantidade de pessoas',
          item: 'Número de entrantes é compatível com o espaço, a atividade, a ventilação e a capacidade de resgate',
          criticidade: 'alto',
          acao: 'Readequar a quantidade de pessoas autorizadas na entrada.',
        },
        {
          subitem: 'Ordem e limpeza',
          item: 'Interior e entorno do espaço estão organizados, sem obstruções e sem acúmulo indevido de materiais',
          criticidade: 'medio',
          acao: 'Organizar o interior e o entorno antes da continuidade da atividade.',
        },
      ],
    },
    {
      id: 'nr33-topic-7',
      titulo: 'EPI, EPC e Ferramentas',
      ordem: 7,
      itens: [
        {
          subitem: 'EPI adequado',
          item: 'EPIs necessários estão definidos, disponíveis, inspecionados e em uso correto',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até adequação dos EPIs exigidos.',
        },
        {
          subitem: 'Proteção respiratória',
          item: 'Proteção respiratória adequada está definida e implantada quando requerida pela análise de risco',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até adequação da proteção respiratória.',
        },
        {
          subitem: 'Ferramental',
          item: 'Ferramentas, iluminação e equipamentos utilizados são compatíveis com o risco do espaço confinado',
          criticidade: 'alto',
          acao: 'Substituir ou adequar o ferramental antes da continuidade.',
        },
        {
          subitem: 'Risco de ignição',
          item: 'Fontes de ignição foram eliminadas ou controladas quando houver risco de inflamáveis ou atmosfera explosiva',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até eliminação ou controle das fontes de ignição.',
        },
        {
          subitem: 'Queda de materiais',
          item: 'Ferramentas e materiais estão controlados para evitar queda, travamento ou obstrução do acesso e da saída',
          criticidade: 'alto',
          acao: 'Controlar ferramentas e materiais antes da continuidade.',
        },
      ],
    },
    {
      id: 'nr33-topic-8',
      titulo: 'Execução, Mudanças e Trabalhos Associados',
      ordem: 8,
      itens: [
        {
          subitem: 'Mudança de condição',
          item: 'Qualquer mudança de processo, atmosfera, escopo ou comportamento gera parada e reavaliação da entrada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper a atividade e reavaliar a entrada diante de mudança de condição.',
        },
        {
          subitem: 'Trabalho a quente associado',
          item: 'Quando houver trabalho a quente, controles adicionais foram implantados e compatibilizados com a PET',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até implantação dos controles adicionais para trabalho a quente.',
        },
        {
          subitem: 'Produtos perigosos',
          item: 'Uso de produtos químicos, limpeza, pintura ou outras atividades com emissão de vapores foi avaliado e controlado',
          criticidade: 'alto',
          acao: 'Adequar os controles para emissão de vapores e contaminantes.',
        },
        {
          subitem: 'Acompanhamento do vigia',
          item: 'Vigia mantém monitoramento ativo da atividade e aciona resposta imediata em caso de desvio ou emergência',
          criticidade: 'alto',
          acao: 'Reforçar o monitoramento do vigia antes da continuidade.',
        },
        {
          subitem: 'Tempo de exposição',
          item: 'Tempo de permanência e pausas foram definidos conforme risco, esforço e condição térmica do ambiente',
          criticidade: 'medio',
          acao: 'Reavaliar o tempo de permanência e pausas da equipe.',
        },
      ],
    },
    {
      id: 'nr33-topic-9',
      titulo: 'Emergência, Resgate e Prontidão',
      ordem: 9,
      itens: [
        {
          subitem: 'Plano de resgate',
          item: 'Plano de emergência e resgate é específico para o espaço confinado e está disponível no local',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até implantação do plano de resgate específico.',
        },
        {
          subitem: 'Equipe de resgate',
          item: 'Equipe de resposta está definida, capacitada e apta para atendimento do cenário previsto',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até disponibilização de equipe de resposta apta.',
        },
        {
          subitem: 'Recursos de resgate',
          item: 'Tripé, guincho, maca, linha de vida, respiradores e demais recursos necessários estão disponíveis e operacionais quando aplicáveis',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até disponibilização dos recursos de resgate exigidos.',
        },
        {
          subitem: 'Acesso ao resgate',
          item: 'Configuração do local permite retirada segura do trabalhador em caso de emergência',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até adequação do acesso para resgate.',
        },
        {
          subitem: 'Fluxo de acionamento',
          item: 'Fluxo de acionamento emergencial, comunicação e suporte médico está definido e conhecido pela equipe',
          criticidade: 'alto',
          acao: 'Formalizar e comunicar o fluxo de acionamento antes da entrada.',
        },
      ],
    },
    {
      id: 'nr33-topic-10',
      titulo: 'Encerramento, Inspeção e Interdição',
      ordem: 10,
      itens: [
        {
          subitem: 'Inspeção pré-entrada',
          item: 'Checklist pré-entrada confirma implantação dos controles antes da autorização para acesso ao espaço',
          criticidade: 'alto',
          acao: 'Executar a inspeção pré-entrada antes da liberação.',
        },
        {
          subitem: 'Interdição por desvio grave',
          item: 'Entrada é imediatamente interditada diante de falha grave atmosférica, estrutural, de comunicação ou de resgate',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interditar imediatamente a entrada até eliminação da falha grave.',
        },
        {
          subitem: 'Registro de desvios',
          item: 'Desvios, incidentes, alarmes e quase acidentes são registrados e tratados formalmente',
          criticidade: 'medio',
          acao: 'Formalizar o registro e a tratativa dos desvios identificados.',
        },
        {
          subitem: 'Retorno à condição segura',
          item: 'Espaço é deixado em condição segura, isolamentos são tratados conforme procedimento e a área é entregue formalmente',
          criticidade: 'alto',
          acao: 'Regularizar o encerramento e a entrega segura da área.',
        },
        {
          subitem: 'Auditoria operacional',
          item: 'Entradas em espaços confinados são auditadas periodicamente quanto à aderência ao procedimento e à PET',
          criticidade: 'medio',
          acao: 'Implantar ou reforçar auditoria periódica das entradas em espaço confinado.',
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
