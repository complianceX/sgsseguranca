import { ChecklistItemValue, ChecklistTopicValue } from './types/checklist-item.type';

export function buildPortableDrillTopics(): ChecklistTopicValue[] {
  type PortableDrillItemDefinition = {
    subitem: string;
    item: string;
    criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
    bloqueia?: boolean;
    observacaoObrigatoria?: boolean;
    fotoObrigatoria?: boolean;
    acao?: string;
  };

  const createTopicItems = (
    items: PortableDrillItemDefinition[],
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
    itens: PortableDrillItemDefinition[];
  }> = [
    {
      id: 'portable-drill-topic-1',
      titulo: 'Identificação e Documentação',
      ordem: 1,
      itens: [
        {
          subitem: 'Identificação da ferramenta',
          item: 'Ferramenta identificada por código, patrimônio, número de série ou controle interno',
          criticidade: 'alto',
          acao: 'Retirar a ferramenta de circulação operacional até regularizar a identificação física e sistêmica.',
        },
        {
          subitem: 'Manual do fabricante',
          item: 'Manual do fabricante disponível para consulta',
          criticidade: 'medio',
          acao: 'Disponibilizar o manual ou instrução técnica antes da continuidade do uso da ferramenta.',
        },
        {
          subitem: 'Especificação da ferramenta',
          item: 'Tensão, potência, rotação e características da ferramenta legíveis',
          criticidade: 'alto',
          acao: 'Suspender a liberação até restabelecer a identificação técnica mínima da ferramenta.',
        },
        {
          subitem: 'Registro de inspeção',
          item: 'Registro de inspeção periódica disponível',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a ferramenta até execução e registro da inspeção aplicável.',
        },
        {
          subitem: 'Registro de manutenção',
          item: 'Histórico de manutenção preventiva e corretiva disponível',
          criticidade: 'alto',
          acao: 'Regularizar o histórico de manutenção e reavaliar a condição de liberação.',
        },
        {
          subitem: 'Liberação para uso',
          item: 'Ferramenta formalmente liberada e sem bloqueio',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Impedir o uso e manter bloqueio imediato até regularização formal da liberação.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-2',
      titulo: 'Condição Geral da Ferramenta',
      ordem: 2,
      itens: [
        {
          subitem: 'Carcaça',
          item: 'Carcaça da ferramenta íntegra e sem trincas',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a ferramenta e encaminhar para manutenção ou substituição.',
        },
        {
          subitem: 'Empunhadura',
          item: 'Empunhadura firme, íntegra e sem folgas',
          criticidade: 'alto',
          acao: 'Retirar a ferramenta de uso até correção da empunhadura.',
        },
        {
          subitem: 'Fixações',
          item: 'Parafusos, tampas e componentes externos firmes',
          criticidade: 'alto',
          acao: 'Bloquear a ferramenta até reaperto técnico ou substituição dos componentes.',
        },
        {
          subitem: 'Limpeza',
          item: 'Ferramenta limpa e sem acúmulo excessivo de poeira, óleo ou resíduos',
          criticidade: 'medio',
          acao: 'Limpar a ferramenta antes do uso e reinspecionar sua condição.',
        },
        {
          subitem: 'Ventilação',
          item: 'Aberturas de ventilação desobstruídas',
          criticidade: 'alto',
          acao: 'Limpar e desobstruir antes da operação; bloquear se houver dano permanente.',
        },
        {
          subitem: 'Danos aparentes',
          item: 'Ausência de amassamentos, deformações ou sinais de impacto',
          criticidade: 'alto',
          fotoObrigatoria: true,
          acao: 'Retirar imediatamente de uso e submeter à avaliação técnica.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-3',
      titulo: 'Cabo, Plugue, Bateria e Alimentação',
      ordem: 3,
      itens: [
        {
          subitem: 'Cabo elétrico',
          item: 'Cabo de alimentação íntegro e sem emendas improvisadas',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a ferramenta e substituir o cabo por componente adequado.',
        },
        {
          subitem: 'Plugue',
          item: 'Plugue em bom estado e sem pinos danificados',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Retirar de uso imediatamente e substituir o plugue conforme padrão aplicável.',
        },
        {
          subitem: 'Isolação',
          item: 'Isolação elétrica sem danos aparentes',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a ferramenta até correção elétrica e nova inspeção.',
        },
        {
          subitem: 'Extensão elétrica',
          item: 'Extensão utilizada em boas condições e adequada à carga',
          criticidade: 'alto',
          acao: 'Proibir o uso da extensão e substituir por extensão adequada antes da operação.',
        },
        {
          subitem: 'Bateria',
          item: 'Bateria íntegra, sem trincas, vazamentos ou superaquecimento',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a ferramenta e segregar a bateria para avaliação ou descarte controlado.',
        },
        {
          subitem: 'Nível de carga',
          item: 'Nível de carga suficiente para operação segura',
          criticidade: 'medio',
          acao: 'Encaminhar para recarga antes da liberação operacional.',
        },
        {
          subitem: 'Carregador',
          item: 'Carregador em boas condições e sem improvisos',
          criticidade: 'alto',
          acao: 'Proibir o uso do carregador e substituir por modelo compatível e íntegro.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-4',
      titulo: 'Gatilho, Comandos e Funcionamento',
      ordem: 4,
      itens: [
        {
          subitem: 'Gatilho',
          item: 'Gatilho de acionamento funcionando corretamente',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a ferramenta até reparo e reteste.',
        },
        {
          subitem: 'Reversão',
          item: 'Seletor de reversão funcionando corretamente',
          criticidade: 'alto',
          acao: 'Retirar a ferramenta de uso até correção do seletor.',
        },
        {
          subitem: 'Controle de velocidade',
          item: 'Controle de velocidade responde adequadamente',
          criticidade: 'alto',
          acao: 'Encaminhar para manutenção antes da liberação da ferramenta.',
        },
        {
          subitem: 'Seletor de torque',
          item: 'Seletor de torque funcionando e ajustável',
          criticidade: 'alto',
          acao: 'Retirar a ferramenta de operação até manutenção do seletor.',
        },
        {
          subitem: 'Modo de operação',
          item: 'Seleção entre modo furadeira, parafusadeira ou impacto operante',
          criticidade: 'alto',
          acao: 'Bloquear o uso na aplicação prevista até correção do seletor de modo.',
        },
        {
          subitem: 'Ruído anormal',
          item: 'Ferramenta não apresenta ruídos anormais durante teste',
          criticidade: 'alto',
          acao: 'Interromper o uso e encaminhar para avaliação técnica imediata.',
        },
        {
          subitem: 'Vibração excessiva',
          item: 'Ausência de vibração excessiva durante o funcionamento',
          criticidade: 'alto',
          acao: 'Retirar a ferramenta de uso até diagnóstico e correção.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-5',
      titulo: 'Mandril, Broca, Bit e Acessórios',
      ordem: 5,
      itens: [
        {
          subitem: 'Mandril',
          item: 'Mandril íntegro e sem folgas excessivas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a ferramenta até substituição ou reparo do mandril.',
        },
        {
          subitem: 'Chave do mandril',
          item: 'Chave do mandril disponível e em boas condições',
          criticidade: 'medio',
          acao: 'Não liberar o uso até disponibilizar chave adequada em bom estado.',
        },
        {
          subitem: 'Fixação da broca',
          item: 'Broca ou bit firmemente fixado',
          criticidade: 'alto',
          acao: 'Reinstalar corretamente o acessório antes de iniciar a atividade.',
        },
        {
          subitem: 'Integridade da broca',
          item: 'Broca íntegra, afiada e sem empeno',
          criticidade: 'alto',
          acao: 'Substituir a broca antes do uso e segregar a defeituosa.',
        },
        {
          subitem: 'Integridade do bit',
          item: 'Bit íntegro e compatível com o parafuso',
          criticidade: 'medio',
          acao: 'Substituir o bit antes da atividade para evitar perda de controle e dano ao fixador.',
        },
        {
          subitem: 'Compatibilidade do acessório',
          item: 'Broca, bit ou acessório compatível com o material e a ferramenta',
          criticidade: 'alto',
          acao: 'Interromper a atividade e selecionar acessório tecnicamente compatível.',
        },
        {
          subitem: 'Acessório danificado',
          item: 'Ausência de broca, bit ou adaptador danificado',
          criticidade: 'alto',
          acao: 'Segregar o acessório e impedir sua utilização imediatamente.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-6',
      titulo: 'Segurança Elétrica',
      ordem: 6,
      itens: [
        {
          subitem: 'Tomada',
          item: 'Ponto de alimentação em condição segura',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Não energizar a ferramenta até correção do ponto de alimentação.',
        },
        {
          subitem: 'Partes energizadas expostas',
          item: 'Ausência de partes energizadas expostas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a ferramenta e encaminhar para reparo elétrico.',
        },
        {
          subitem: 'Umidade',
          item: 'Ferramenta não utilizada em condição de umidade incompatível',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a atividade imediatamente e replanejar a execução em condição segura.',
        },
        {
          subitem: 'Cabos no trajeto',
          item: 'Cabo elétrico disposto sem risco de tropeço, esmagamento ou corte',
          criticidade: 'alto',
          acao: 'Reorganizar imediatamente o trajeto do cabo e proteger os pontos críticos.',
        },
        {
          subitem: 'Proximidade de rede energizada',
          item: 'Ausência de risco de contato com partes energizadas próximas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a execução até isolar, desenergizar ou redefinir o método com controle elétrico.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-7',
      titulo: 'EPI e Proteção do Operador',
      ordem: 7,
      itens: [
        {
          subitem: 'Óculos de proteção',
          item: 'Operador utilizando proteção ocular adequada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper a atividade até fornecimento e uso correto da proteção ocular.',
        },
        {
          subitem: 'Protetor auricular',
          item: 'Operador utilizando proteção auditiva quando exigida',
          criticidade: 'alto',
          acao: 'Exigir o uso do protetor auricular antes da continuidade da tarefa.',
        },
        {
          subitem: 'Luvas',
          item: 'Luva adequada ao risco disponível e utilizada quando aplicável',
          criticidade: 'alto',
          acao: 'Adequar a seleção da luva conforme análise de risco antes da atividade.',
        },
        {
          subitem: 'Máscara/respirador',
          item: 'Proteção respiratória utilizada quando houver geração de poeira',
          criticidade: 'alto',
          acao: 'Interromper a atividade até implantação da proteção respiratória indicada.',
        },
        {
          subitem: 'Calçado de segurança',
          item: 'Operador utilizando calçado de segurança adequado',
          criticidade: 'alto',
          acao: 'Não iniciar ou interromper a atividade até regularização do calçado.',
        },
        {
          subitem: 'Condição do EPI',
          item: 'EPIs em bom estado de conservação',
          criticidade: 'alto',
          acao: 'Substituir imediatamente o EPI defeituoso antes de prosseguir com a atividade.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-8',
      titulo: 'Operador e Autorização',
      ordem: 8,
      itens: [
        {
          subitem: 'Treinamento/orientação',
          item: 'Operador orientado sobre uso seguro da ferramenta',
          criticidade: 'alto',
          acao: 'Impedir o uso até realização de orientação ou treinamento aplicável.',
        },
        {
          subitem: 'Autorização',
          item: 'Uso da ferramenta por pessoa autorizada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender imediatamente a atividade e restringir o acesso à ferramenta.',
        },
        {
          subitem: 'Aptidão operacional',
          item: 'Operador em condição física e cognitiva adequada para o uso',
          criticidade: 'alto',
          acao: 'Afastar o trabalhador da atividade e reavaliar a execução com substituição adequada.',
        },
        {
          subitem: 'Conhecimento da tarefa',
          item: 'Operador conhece o material a perfurar/parafusar e o acessório correto',
          criticidade: 'alto',
          acao: 'Parar a preparação da atividade e orientar o operador antes do início.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-9',
      titulo: 'Condições do Local de Trabalho',
      ordem: 9,
      itens: [
        {
          subitem: 'Organização',
          item: 'Área de trabalho organizada e sem excesso de materiais soltos',
          criticidade: 'medio',
          acao: 'Organizar o posto de trabalho antes do início da atividade.',
        },
        {
          subitem: 'Iluminação',
          item: 'Iluminação adequada no ponto de trabalho',
          criticidade: 'alto',
          acao: 'Complementar a iluminação ou suspender a atividade até adequação.',
        },
        {
          subitem: 'Superfície de trabalho',
          item: 'Peça ou material firmemente apoiado ou fixado',
          criticidade: 'alto',
          acao: 'Fixar adequadamente a peça antes de iniciar a perfuração ou fixação.',
        },
        {
          subitem: 'Interferências ocultas',
          item: 'Verificação prévia de interferências ocultas antes de furar',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a perfuração até avaliação técnica e liberação da superfície.',
        },
        {
          subitem: 'Terceiros no entorno',
          item: 'Área protegida contra projeção de partículas sobre terceiros',
          criticidade: 'alto',
          acao: 'Isolar e sinalizar o entorno antes de prosseguir com a atividade.',
        },
        {
          subitem: 'Trabalho em altura',
          item: 'Condição de uso segura quando a ferramenta for utilizada em altura',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender imediatamente a atividade até implantação das medidas de proteção adequadas.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-10',
      titulo: 'Operação Segura',
      ordem: 10,
      itens: [
        {
          subitem: 'Postura',
          item: 'Operador utiliza postura estável e segura durante a atividade',
          criticidade: 'alto',
          acao: 'Reorientar a postura e reposicionar a atividade antes da continuidade.',
        },
        {
          subitem: 'Uso com as mãos',
          item: 'Ferramenta operada com pegada adequada e, quando necessário, com duas mãos',
          criticidade: 'alto',
          acao: 'Interromper a atividade e ajustar a técnica de empunhadura antes de retomar.',
        },
        {
          subitem: 'Pressão aplicada',
          item: 'Pressão aplicada compatível com a capacidade da ferramenta',
          criticidade: 'medio',
          acao: 'Corrigir a técnica, selecionar acessório adequado e reduzir o esforço aplicado.',
        },
        {
          subitem: 'Acessório correto',
          item: 'Uso do acessório correto para o material trabalhado',
          criticidade: 'alto',
          acao: 'Interromper a atividade e substituir pelo acessório correto.',
        },
        {
          subitem: 'Troca de acessório',
          item: 'Troca de broca ou bit realizada com a ferramenta desligada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper imediatamente a prática e exigir desligamento ou desconexão antes de toda troca.',
        },
        {
          subitem: 'Remoção da chave',
          item: 'Chave do mandril removida antes do acionamento',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o acionamento até remoção da chave e reforço da orientação operacional.',
        },
        {
          subitem: 'Uso inadequado',
          item: 'Ferramenta não utilizada fora da finalidade prevista',
          criticidade: 'alto',
          acao: 'Suspender o uso inadequado imediatamente e substituir pelo recurso correto.',
        },
        {
          subitem: 'Interrupção em anormalidade',
          item: 'Operação interrompida imediatamente em caso de falha, superaquecimento ou ruído anormal',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a ferramenta e abrir registro de não conformidade.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-11',
      titulo: 'Inspeção Pré-Uso',
      ordem: 11,
      itens: [
        {
          subitem: 'Rotina de inspeção',
          item: 'Inspeção realizada antes do início da atividade',
          criticidade: 'alto',
          acao: 'Suspender a atividade até realização da inspeção obrigatória.',
        },
        {
          subitem: 'Teste em vazio',
          item: 'Teste funcional em vazio realizado antes da operação',
          criticidade: 'alto',
          acao: 'Não liberar a atividade até execução do teste funcional em vazio.',
        },
        {
          subitem: 'Comunicação de falhas',
          item: 'Falhas identificadas comunicadas ao responsável',
          criticidade: 'alto',
          acao: 'Registrar e comunicar imediatamente a não conformidade ao responsável pela ferramenta.',
        },
        {
          subitem: 'Bloqueio de ferramenta defeituosa',
          item: 'Ferramenta defeituosa retirada de uso e bloqueada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Aplicar bloqueio imediato, segregar fisicamente e encaminhar para avaliação.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-12',
      titulo: 'Manutenção e Armazenamento',
      ordem: 12,
      itens: [
        {
          subitem: 'Manutenção preventiva',
          item: 'Ferramenta submetida a manutenção preventiva conforme critério interno/fabricante',
          criticidade: 'medio',
          acao: 'Programar imediatamente a intervenção preventiva e restringir a ferramenta se houver risco associado.',
        },
        {
          subitem: 'Reparo adequado',
          item: 'Reparos realizados sem improvisos e por pessoa competente',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a ferramenta até revisão técnica adequada do reparo executado.',
        },
        {
          subitem: 'Peças adequadas',
          item: 'Peças, acessórios e componentes compatíveis com a ferramenta',
          criticidade: 'alto',
          acao: 'Suspender a utilização e substituir pelo componente compatível.',
        },
        {
          subitem: 'Armazenamento',
          item: 'Ferramenta armazenada em local seco, protegido e organizado',
          criticidade: 'medio',
          acao: 'Readequar imediatamente o local de armazenamento.',
        },
        {
          subitem: 'Organização dos acessórios',
          item: 'Brocas, bits, baterias e carregadores armazenados de forma adequada',
          criticidade: 'medio',
          acao: 'Organizar e segregar os acessórios antes da próxima utilização.',
        },
      ],
    },
    {
      id: 'portable-drill-topic-13',
      titulo: 'Finalização e Pós-Uso',
      ordem: 13,
      itens: [
        {
          subitem: 'Desligamento',
          item: 'Ferramenta desligada com segurança ao final da atividade',
          criticidade: 'alto',
          acao: 'Realizar desligamento seguro imediato e reforçar a rotina de encerramento.',
        },
        {
          subitem: 'Desconexão',
          item: 'Ferramenta desconectada da tomada ou bateria removida quando necessário',
          criticidade: 'alto',
          acao: 'Desconectar imediatamente da alimentação e revisar a rotina de pós-uso.',
        },
        {
          subitem: 'Limpeza pós-uso',
          item: 'Ferramenta limpa após a atividade',
          criticidade: 'medio',
          acao: 'Executar limpeza adequada antes do armazenamento.',
        },
        {
          subitem: 'Registro de anormalidades',
          item: 'Falhas percebidas durante o uso registradas e comunicadas',
          criticidade: 'alto',
          acao: 'Registrar imediatamente a anomalia e bloquear a ferramenta se houver risco.',
        },
        {
          subitem: 'Guarda segura',
          item: 'Ferramenta devolvida ao local de armazenamento definido',
          criticidade: 'medio',
          acao: 'Recolher imediatamente a ferramenta e devolvê-la ao local de armazenamento controlado.',
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
