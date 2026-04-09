import { ChecklistItemValue, ChecklistTopicValue } from './types/checklist-item.type';

export function buildLotoOperationalTopics(): ChecklistTopicValue[] {
  type LotoItemDefinition = {
    subitem: string;
    item: string;
    criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
    bloqueia?: boolean;
    observacaoObrigatoria?: boolean;
    fotoObrigatoria?: boolean;
    acao?: string;
  };

  const createTopicItems = (
    items: LotoItemDefinition[],
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
    itens: LotoItemDefinition[];
  }> = [
    {
      id: 'loto-topic-1',
      titulo: 'Gestão, Escopo e Documentação',
      ordem: 1,
      itens: [
        {
          subitem: 'Procedimento LOTO',
          item: 'Procedimento de bloqueio e etiquetagem está formalizado, aprovado e disponível para a atividade',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção até disponibilização do procedimento LOTO aplicável.',
        },
        {
          subitem: 'Escopo da intervenção',
          item: 'Escopo, equipamento, limites físicos e tipo de intervenção estão claramente definidos',
          criticidade: 'alto',
          acao: 'Revisar e formalizar o escopo antes da intervenção.',
        },
        {
          subitem: 'Fontes de energia',
          item: 'Fontes de energia perigosas foram identificadas e documentadas, incluindo elétrica, mecânica, pneumática, hidráulica, térmica, gravitacional e outras aplicáveis',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até identificação completa das fontes de energia perigosas.',
        },
        {
          subitem: 'Pontos de isolamento',
          item: 'Pontos de isolamento e dispositivos de seccionamento estão identificados e acessíveis',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até identificação correta dos pontos de isolamento.',
        },
        {
          subitem: 'Análise de risco',
          item: 'Análise de risco contempla energias perigosas, dissipação de energias acumuladas e cenários de reenergização indevida',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até revisão da análise de risco.',
        },
      ],
    },
    {
      id: 'loto-topic-2',
      titulo: 'Pessoas, Papéis e Autorização',
      ordem: 2,
      itens: [
        {
          subitem: 'Trabalhadores autorizados',
          item: 'Somente trabalhadores autorizados executam o bloqueio, a intervenção e a retirada de bloqueios',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até definição e controle dos autorizados.',
        },
        {
          subitem: 'Capacitação',
          item: 'Equipe envolvida recebeu capacitação específica em LOTO compatível com o processo e os equipamentos',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até capacitação adequada da equipe.',
        },
        {
          subitem: 'Papéis definidos',
          item: 'Responsáveis por bloquear, supervisionar, testar, intervir e liberar estão formalmente definidos',
          criticidade: 'alto',
          acao: 'Formalizar os papéis antes do início da intervenção.',
        },
        {
          subitem: 'Comunicação com afetados',
          item: 'Trabalhadores afetados e áreas impactadas foram comunicados sobre o bloqueio e a indisponibilidade do equipamento',
          criticidade: 'alto',
          acao: 'Comunicar os afetados antes da execução do bloqueio.',
        },
        {
          subitem: 'Contratadas',
          item: 'Empresas contratadas seguem o procedimento LOTO da contratante ou arranjo formalmente compatibilizado',
          criticidade: 'alto',
          acao: 'Compatibilizar procedimentos e autorizações antes da intervenção.',
        },
      ],
    },
    {
      id: 'loto-topic-3',
      titulo: 'Preparação e Desligamento',
      ordem: 3,
      itens: [
        {
          subitem: 'Condição operacional',
          item: 'Máquina ou sistema foi levado à condição segura de parada antes do isolamento das energias',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção até parada segura do equipamento.',
        },
        {
          subitem: 'Sequência de desligamento',
          item: 'Sequência de desligamento segue procedimento técnico aplicável e evita danos ou risco adicional',
          criticidade: 'alto',
          acao: 'Reexecutar o desligamento conforme sequência aprovada.',
        },
        {
          subitem: 'Identificação do equipamento',
          item: 'Equipamento ou sistema alvo do bloqueio está identificado de forma inequívoca',
          criticidade: 'alto',
          acao: 'Regularizar a identificação antes do bloqueio.',
        },
        {
          subitem: 'Interferências',
          item: 'Interdependências com outros equipamentos, utilidades ou sistemas compartilhados foram avaliadas antes do bloqueio',
          criticidade: 'alto',
          acao: 'Revisar interferências e impacto operacional antes da intervenção.',
        },
      ],
    },
    {
      id: 'loto-topic-4',
      titulo: 'Isolamento e Dissipação de Energias',
      ordem: 4,
      itens: [
        {
          subitem: 'Isolamento',
          item: 'Todos os pontos de isolamento necessários foram efetivamente seccionados, fechados, desacoplados ou travados',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção até isolamento completo das energias perigosas.',
        },
        {
          subitem: 'Energia armazenada',
          item: 'Energia residual ou acumulada foi dissipada, contida, aliviada ou neutralizada antes da intervenção',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção até eliminação ou contenção da energia armazenada.',
        },
        {
          subitem: 'Movimento por gravidade',
          item: 'Partes móveis, suspensas ou com potencial de queda estão calçadas, travadas ou apoiadas de forma segura',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até neutralização do risco gravitacional.',
        },
        {
          subitem: 'Pressões residuais',
          item: 'Linhas, vasos, acumuladores, cilindros e circuitos pressurizados estão despressurizados ou isolados de forma segura',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até despressurização ou contenção segura do sistema.',
        },
        {
          subitem: 'Reacúmulo',
          item: 'Há medida de monitoramento ou reavaliação quando houver possibilidade de reacúmulo de energia perigosa',
          criticidade: 'alto',
          acao: 'Implementar monitoramento do reacúmulo antes da continuidade.',
        },
      ],
    },
    {
      id: 'loto-topic-5',
      titulo: 'Dispositivos de Bloqueio e Etiquetagem',
      ordem: 5,
      itens: [
        {
          subitem: 'Cadeado individual',
          item: 'Cada trabalhador autorizado aplicou seu próprio cadeado ou bloqueio pessoal quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção até aplicação correta dos bloqueios pessoais.',
        },
        {
          subitem: 'Etiqueta de advertência',
          item: 'Etiqueta de bloqueio está preenchida, legível e identifica responsável, data e motivo do bloqueio',
          criticidade: 'alto',
          acao: 'Regularizar a etiquetagem antes da intervenção.',
        },
        {
          subitem: 'Dispositivo compatível',
          item: 'Dispositivo de bloqueio é compatível com o ponto de isolamento e impede manobra não autorizada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até uso de dispositivo compatível e eficaz.',
        },
        {
          subitem: 'Caixa de grupo',
          item: 'Bloqueio em grupo utiliza caixa de bloqueio, múltipla hasp ou sistema equivalente com controle claro de chaves',
          criticidade: 'alto',
          acao: 'Regularizar o bloqueio em grupo antes da intervenção.',
        },
        {
          subitem: 'Chaves de bloqueio',
          item: 'Chaves dos cadeados de bloqueio permanecem sob controle do trabalhador autorizado ou do sistema formal de grupo',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até restabelecimento do controle das chaves.',
        },
        {
          subitem: 'Proibição de improviso',
          item: 'Não há uso de arames, lacres improvisados, fitas ou soluções que não garantam bloqueio efetivo',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente e substituir os improvisos por dispositivos adequados.',
        },
      ],
    },
    {
      id: 'loto-topic-6',
      titulo: 'Verificação de Energia Zero',
      ordem: 6,
      itens: [
        {
          subitem: 'Tentativa de partida',
          item: 'Foi realizada tentativa controlada de acionamento para verificação da condição de energia zero quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção até verificação controlada da condição de energia zero.',
        },
        {
          subitem: 'Teste instrumental',
          item: 'Foram realizados testes instrumentais adequados para confirmar ausência de energia quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção até confirmação instrumental da condição segura.',
        },
        {
          subitem: 'Verificação funcional',
          item: 'Verificação funcional confirma que a energia não pode ser restabelecida inadvertidamente durante a intervenção',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até garantia da condição segura de energia zero.',
        },
        {
          subitem: 'Registro da verificação',
          item: 'Resultado da verificação de isolamento e energia zero foi registrado quando exigido pelo procedimento',
          criticidade: 'alto',
          acao: 'Registrar formalmente a verificação antes da continuidade.',
        },
      ],
    },
    {
      id: 'loto-topic-7',
      titulo: 'Intervenção, Controle de Área e Trabalho Seguro',
      ordem: 7,
      itens: [
        {
          subitem: 'Delimitação de área',
          item: 'Área da intervenção está isolada e sinalizada contra acesso indevido',
          criticidade: 'alto',
          acao: 'Isolar a área antes da continuidade da intervenção.',
        },
        {
          subitem: 'Ferramentas e materiais',
          item: 'Ferramentas, peças e materiais estão organizados sem criar risco adicional à intervenção bloqueada',
          criticidade: 'medio',
          acao: 'Organizar a área e os materiais antes da continuidade.',
        },
        {
          subitem: 'Mudança de escopo',
          item: 'Mudanças de escopo ou condição operacional durante a intervenção geram revisão do bloqueio e da análise de risco',
          criticidade: 'alto',
          acao: 'Suspender a atividade e revisar o bloqueio e a análise de risco.',
        },
        {
          subitem: 'Supervisão',
          item: 'Intervenções críticas contam com supervisão compatível com a complexidade e o risco',
          criticidade: 'alto',
          acao: 'Adequar a supervisão antes da continuidade da atividade.',
        },
        {
          subitem: 'Inspeções intermediárias',
          item: 'Durante intervenções longas ou complexas há rechecagem periódica do status dos bloqueios e da condição segura',
          criticidade: 'medio',
          acao: 'Implantar rechecagem periódica antes da continuidade da intervenção.',
        },
      ],
    },
    {
      id: 'loto-topic-8',
      titulo: 'Remoção Temporária para Teste ou Posicionamento',
      ordem: 8,
      itens: [
        {
          subitem: 'Remoção controlada',
          item: 'Remoção temporária de bloqueios para teste, posicionamento ou ajuste segue procedimento formal e controlado',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até formalização e controle da remoção temporária.',
        },
        {
          subitem: 'Retirada de pessoas',
          item: 'Antes do teste ou energização temporária, pessoas e ferramentas foram retiradas da zona de risco',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o teste até retirada de pessoas, ferramentas e materiais da zona de risco.',
        },
        {
          subitem: 'Retorno do bloqueio',
          item: 'Após o teste, o bloqueio completo foi reaplicado antes da retomada da intervenção',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a continuidade da intervenção até reaplicação completa do LOTO.',
        },
        {
          subitem: 'Comunicação',
          item: 'Equipe envolvida foi comunicada sobre a remoção temporária e o posterior retorno do bloqueio',
          criticidade: 'alto',
          acao: 'Regularizar a comunicação antes de repetir o ciclo de teste.',
        },
      ],
    },
    {
      id: 'loto-topic-9',
      titulo: 'Liberação, Retorno à Operação e Restauração',
      ordem: 9,
      itens: [
        {
          subitem: 'Reinstalação de proteções',
          item: 'Proteções, tampas, barreiras, dispositivos de segurança e componentes removidos foram reinstalados corretamente',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a liberação até reinstalação correta de todas as proteções e dispositivos.',
        },
        {
          subitem: 'Limpeza final',
          item: 'Área de intervenção foi limpa, organizada e está livre de ferramentas, peças soltas e materiais esquecidos',
          criticidade: 'alto',
          acao: 'Executar limpeza e conferência final antes da liberação.',
        },
        {
          subitem: 'Retirada de bloqueios',
          item: 'Retirada de bloqueios e etiquetas ocorreu somente pelos responsáveis autorizados conforme procedimento',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a liberação até regularização da retirada dos bloqueios pelos responsáveis.',
        },
        {
          subitem: 'Aviso de retorno',
          item: 'Trabalhadores afetados foram comunicados antes da reenergização ou retorno à operação',
          criticidade: 'alto',
          acao: 'Comunicar os afetados antes do retorno à operação.',
        },
        {
          subitem: 'Partida controlada',
          item: 'Retorno à operação ocorreu de forma controlada e supervisionada após confirmação de condição segura',
          criticidade: 'alto',
          acao: 'Executar o retorno à operação de forma controlada e supervisionada.',
        },
      ],
    },
    {
      id: 'loto-topic-10',
      titulo: 'Desvios, Emergência e Auditoria',
      ordem: 10,
      itens: [
        {
          subitem: 'Remoção excepcional',
          item: 'Remoção excepcional de bloqueio ausente de seu responsável segue procedimento formal, autorizado e rastreável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a retirada excepcional até atendimento integral do procedimento aplicável.',
        },
        {
          subitem: 'Incidentes e desvios',
          item: 'Incidentes, quase acidentes e desvios relacionados a bloqueio possuem registro, investigação e ação corretiva',
          criticidade: 'medio',
          acao: 'Formalizar a investigação e tratar os desvios pendentes.',
        },
        {
          subitem: 'Plano de emergência',
          item: 'Plano de resposta contempla falha de bloqueio, reenergização indevida e resgate quando aplicável',
          criticidade: 'alto',
          acao: 'Atualizar o plano de resposta antes da continuidade das atividades.',
        },
        {
          subitem: 'Auditoria de rotina',
          item: 'O procedimento LOTO é auditado periodicamente quanto à aderência prática e eficácia dos controles',
          criticidade: 'medio',
          acao: 'Implantar ou reforçar a auditoria periódica do procedimento LOTO.',
        },
        {
          subitem: 'Interdição por falha grave',
          item: 'Equipamento ou atividade é interditado quando houver falha grave no controle de energias perigosas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interditar imediatamente a atividade até eliminação da falha grave de controle.',
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
