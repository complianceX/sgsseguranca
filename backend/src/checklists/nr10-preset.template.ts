import {
  ChecklistItemValue,
  ChecklistTopicValue,
} from './types/checklist-item.type';

export function buildNr10OperationalTopics(): ChecklistTopicValue[] {
  type Nr10ItemDefinition = {
    subitem: string;
    item: string;
    criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
    bloqueia?: boolean;
    observacaoObrigatoria?: boolean;
    fotoObrigatoria?: boolean;
    acao?: string;
  };

  const createTopicItems = (
    items: Nr10ItemDefinition[],
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
    itens: Nr10ItemDefinition[];
  }> = [
    {
      id: 'nr10-topic-1',
      titulo: 'Gestão Documental e Técnica',
      ordem: 1,
      itens: [
        {
          subitem: 'Prontuário',
          item: 'Prontuário de Instalações Elétricas disponível e atualizado quando exigível',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização e atualização do prontuário aplicável.',
        },
        {
          subitem: 'Diagrama unifilar',
          item: 'Esquema unifilar atualizado disponível com especificação do aterramento e dispositivos de proteção',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização do diagrama unifilar atualizado.',
        },
        {
          subitem: 'Procedimentos',
          item: 'Procedimentos de trabalho específicos, padronizados e aprovados estão disponíveis no local',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a atividade até disponibilização dos procedimentos aplicáveis.',
        },
        {
          subitem: 'Ordem de serviço',
          item: 'Serviço precedido por ordem de serviço específica com tipo, data, local e referência aos procedimentos',
          criticidade: 'alto',
          acao: 'Regularizar a ordem de serviço antes da execução.',
        },
        {
          subitem: 'Responsável técnico',
          item: 'Documentos técnicos, instruções e liberações elaborados ou aprovados por profissional legalmente habilitado quando exigível',
          criticidade: 'alto',
          acao: 'Submeter a documentação à validação técnica antes da execução.',
        },
      ],
    },
    {
      id: 'nr10-topic-2',
      titulo: 'Planejamento e Análise de Risco',
      ordem: 2,
      itens: [
        {
          subitem: 'Análise de risco',
          item: 'Análise de risco realizada contemplando risco elétrico e riscos adicionais da atividade',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até emissão ou revisão da análise de risco.',
        },
        {
          subitem: 'Riscos adicionais',
          item: 'Análise considera altura, espaço confinado, umidade, condições atmosféricas, áreas classificadas e demais riscos adicionais aplicáveis',
          criticidade: 'alto',
          acao: 'Revisar a análise de risco antes do início da atividade.',
        },
        {
          subitem: 'Medidas de controle',
          item: 'Medidas preventivas de controle do risco elétrico estão definidas e integradas ao planejamento da atividade',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a atividade até definição formal das medidas de controle.',
        },
        {
          subitem: 'Condição impeditiva',
          item: 'Condições impeditivas para execução estão definidas, conhecidas e controladas pela equipe',
          criticidade: 'alto',
          acao: 'Suspender a atividade até alinhamento formal das condições impeditivas.',
        },
        {
          subitem: 'Trabalho energizado',
          item: 'Execução energizada somente ocorre quando tecnicamente justificada e controlada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção energizada até justificativa técnica e controles aplicáveis.',
        },
      ],
    },
    {
      id: 'nr10-topic-3',
      titulo: 'Qualificação, Capacitação e Autorização',
      ordem: 3,
      itens: [
        {
          subitem: 'Qualificação',
          item: 'Trabalhadores atendem às condições de qualificação compatíveis com a atividade elétrica executada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até comprovação de qualificação compatível.',
        },
        {
          subitem: 'Capacitação básica',
          item: 'Trabalhadores autorizados possuem treinamento básico NR-10 vigente e rastreável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até regularização do treinamento NR-10 básico.',
        },
        {
          subitem: 'Capacitação SEP',
          item: 'Trabalhadores possuem treinamento complementar SEP quando atuarem no SEP ou em suas proximidades',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até regularização do treinamento complementar SEP.',
        },
        {
          subitem: 'Autorização formal',
          item: 'Trabalhadores estão formalmente autorizados pela empresa para a atividade elétrica específica',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até emissão ou atualização da autorização formal.',
        },
        {
          subitem: 'Aptidão',
          item: 'Comprovação ocupacional e condições psicofísicas compatíveis com a atividade estão válidas quando exigíveis',
          criticidade: 'alto',
          acao: 'Afastar o trabalhador da atividade até validação da aptidão aplicável.',
        },
      ],
    },
    {
      id: 'nr10-topic-4',
      titulo: 'Proteção Coletiva, EPI e Ferramental',
      ordem: 4,
      itens: [
        {
          subitem: 'Proteção coletiva',
          item: 'Medidas de proteção coletiva estão implantadas priorizando desenergização e outras barreiras técnicas aplicáveis',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até implantação das medidas de proteção coletiva.',
        },
        {
          subitem: 'EPI específico',
          item: 'EPIs específicos e adequados ao risco elétrico e aos riscos adicionais estão disponíveis e em uso',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização e uso correto dos EPIs aplicáveis.',
        },
        {
          subitem: 'Vestimenta',
          item: 'Vestimentas de trabalho são adequadas quanto à condutibilidade, inflamabilidade e influências eletromagnéticas',
          criticidade: 'alto',
          acao: 'Adequar a vestimenta antes do início da atividade.',
        },
        {
          subitem: 'Adornos',
          item: 'Ausência de adornos pessoais nos trabalhos com instalações elétricas ou em suas proximidades',
          criticidade: 'alto',
          acao: 'Retirar adornos e reinspecionar a equipe antes do início da atividade.',
        },
        {
          subitem: 'Ferramental',
          item: 'Ferramental, instrumentos e equipamentos de medição são adequados, íntegros e compatíveis com a classe de tensão',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até substituição ou adequação do ferramental e instrumentos.',
        },
        {
          subitem: 'Ensaios e testes',
          item: 'Resultados de testes de isolação e inspeções de EPC/EPI/ferramental estão disponíveis quando aplicáveis',
          criticidade: 'alto',
          acao: 'Restringir a atividade até apresentação dos ensaios e testes aplicáveis.',
        },
      ],
    },
    {
      id: 'nr10-topic-5',
      titulo: 'Desenergização, Bloqueio e Liberação',
      ordem: 5,
      itens: [
        {
          subitem: 'Seccionamento',
          item: 'Seccionamento da instalação realizado conforme procedimento aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até execução correta do seccionamento.',
        },
        {
          subitem: 'Impedimento de reenergização',
          item: 'Bloqueio e impedimento de reenergização implementados e controlados',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até implantação do bloqueio e impedimento de reenergização.',
        },
        {
          subitem: 'Ausência de tensão',
          item: 'Constatação da ausência de tensão realizada com instrumento adequado e procedimento válido',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até constatação formal da ausência de tensão.',
        },
        {
          subitem: 'Aterramento temporário',
          item: 'Aterramento temporário com equipotencialização dos condutores foi instalado quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até instalação do aterramento temporário aplicável.',
        },
        {
          subitem: 'Proteção de partes vivas',
          item: 'Proteção dos elementos energizados existentes na zona controlada foi implementada quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até proteção adequada das partes vivas existentes.',
        },
        {
          subitem: 'Liberação para serviço',
          item: 'Liberação formal para execução ocorreu somente após conclusão da sequência de desenergização aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a execução até formalização da liberação para serviço.',
        },
      ],
    },
    {
      id: 'nr10-topic-6',
      titulo: 'Instalações Energizadas e Proximidade',
      ordem: 6,
      itens: [
        {
          subitem: 'Trabalho energizado',
          item: 'Intervenções energizadas são executadas apenas por trabalhadores que atendem aos requisitos específicos da NR-10',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade energizada até atendimento integral dos requisitos.',
        },
        {
          subitem: 'Zona controlada e de risco',
          item: 'Delimitação e controle das zonas livre, controlada e de risco estão implementados conforme nível de tensão aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até delimitação correta e controle das zonas.',
        },
        {
          subitem: 'Barreiras e obstáculos',
          item: 'Barreiras, obstáculos, anteparos ou isolação de partes vivas estão implantados quando desenergização não for possível',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até implantação das barreiras e proteções aplicáveis.',
        },
        {
          subitem: 'Religamento automático',
          item: 'Bloqueio do religamento automático foi implementado quando aplicável',
          criticidade: 'alto',
          acao: 'Suspender a atividade até bloqueio do religamento automático aplicável.',
        },
        {
          subitem: 'Supervisão',
          item: 'Atividade em proximidade ou energizada conta com supervisão e coordenação compatíveis com o risco',
          criticidade: 'alto',
          acao: 'Reforçar a supervisão antes do início ou continuidade da atividade.',
        },
      ],
    },
    {
      id: 'nr10-topic-7',
      titulo: 'Sinalização e Controle de Área',
      ordem: 7,
      itens: [
        {
          subitem: 'Sinalização geral',
          item: 'Sinalização de segurança adequada está implantada para advertência, identificação e restrição de acesso',
          criticidade: 'alto',
          acao: 'Implantar ou corrigir a sinalização antes do início da atividade.',
        },
        {
          subitem: 'Bloqueios e travamentos',
          item: 'Dispositivos e sistemas de manobra possuem sinalização de travamento, bloqueio e impedimento de energização',
          criticidade: 'alto',
          acao: 'Regularizar a sinalização de bloqueio e impedimento antes da continuidade da atividade.',
        },
        {
          subitem: 'Delimitação da área',
          item: 'Área de trabalho está delimitada e protegida contra acesso indevido de terceiros',
          criticidade: 'alto',
          acao: 'Isolar e delimitar a área antes do início ou continuidade da atividade.',
        },
        {
          subitem: 'Identificação de circuitos',
          item: 'Circuitos, equipamentos e pontos de intervenção estão identificados de forma inequívoca',
          criticidade: 'alto',
          acao: 'Regularizar a identificação antes da intervenção.',
        },
      ],
    },
    {
      id: 'nr10-topic-8',
      titulo: 'Aterramento, SPDA e Integridade da Instalação',
      ordem: 8,
      itens: [
        {
          subitem: 'Aterramento',
          item: 'Sistema de aterramento está especificado, identificado e mantido conforme documentação técnica aplicável',
          criticidade: 'alto',
          acao: 'Regularizar documentação e inspeção do sistema de aterramento antes da atividade.',
        },
        {
          subitem: 'SPDA',
          item: 'Inspeções e medições do sistema de proteção contra descargas atmosféricas estão disponíveis quando aplicáveis',
          criticidade: 'alto',
          acao: 'Atualizar as inspeções e medições do SPDA antes da liberação da atividade.',
        },
        {
          subitem: 'Condição da instalação',
          item: 'Instalação elétrica não apresenta aquecimento anormal, falhas de isolação, sobrecorrentes ou outras anormalidades sem controle',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até diagnóstico e correção da anormalidade elétrica.',
        },
        {
          subitem: 'Áreas classificadas',
          item: 'Em áreas classificadas, equipamentos, materiais e liberação formal atendem aos requisitos específicos aplicáveis',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até conformidade técnica e liberação formal da área classificada.',
        },
      ],
    },
    {
      id: 'nr10-topic-9',
      titulo: 'Emergência, Resgate e Incêndio',
      ordem: 9,
      itens: [
        {
          subitem: 'Plano de emergência',
          item: 'Ações de emergência envolvendo instalações ou serviços com eletricidade constam do plano de emergência da empresa',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até alinhamento com o plano de emergência aplicável.',
        },
        {
          subitem: 'Métodos de resgate',
          item: 'Métodos de resgate padronizados e adequados à atividade estão definidos e disponíveis',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até definição e disponibilização dos métodos de resgate.',
        },
        {
          subitem: 'Primeiros socorros',
          item: 'Trabalhadores autorizados estão aptos a executar resgate e primeiros socorros, incluindo reanimação cardiopulmonar',
          criticidade: 'alto',
          acao: 'Reforçar ou regularizar a prontidão de resgate e primeiros socorros antes da atividade.',
        },
        {
          subitem: 'Combate a incêndio',
          item: 'Equipe autorizada está apta a operar os meios de prevenção e combate a incêndio existentes nas instalações elétricas',
          criticidade: 'alto',
          acao: 'Regularizar a prontidão da equipe e dos meios de combate a incêndio antes da atividade.',
        },
        {
          subitem: 'Meios de emergência',
          item: 'Meios de comunicação, rota de fuga e acesso aos recursos de emergência estão assegurados',
          criticidade: 'alto',
          acao: 'Adequar os meios de emergência antes do início da atividade.',
        },
      ],
    },
    {
      id: 'nr10-topic-10',
      titulo: 'Inspeções, Correções e Auditoria Operacional',
      ordem: 10,
      itens: [
        {
          subitem: 'Inspeção de área',
          item: 'Área, instalações, ferramental, EPC e EPI foram inspecionados antes do início da atividade',
          criticidade: 'alto',
          acao: 'Executar a inspeção prévia antes da liberação da atividade.',
        },
        {
          subitem: 'Não conformidades anteriores',
          item: 'Não conformidades anteriores da instalação ou da atividade possuem tratativa ou bloqueio vigente',
          criticidade: 'alto',
          acao: 'Tratar ou bloquear a condição pendente antes da execução.',
        },
        {
          subitem: 'Recomendações técnicas',
          item: 'Relatórios técnicos de inspeção e recomendações possuem cronograma de adequação acompanhado',
          criticidade: 'medio',
          acao: 'Atualizar o acompanhamento das recomendações técnicas e do cronograma.',
        },
        {
          subitem: 'Acidente/incidente',
          item: 'Ocorrências anteriores envolvendo eletricidade geraram medidas preventivas e corretivas implantadas',
          criticidade: 'medio',
          acao: 'Revisar o aprendizado operacional e implantar as ações pendentes.',
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
