import { ChecklistItemValue, ChecklistTopicValue } from './types/checklist-item.type';

export function buildNr12OperationalTopics(): ChecklistTopicValue[] {
  type Nr12ItemDefinition = {
    subitem: string;
    item: string;
    criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
    bloqueia?: boolean;
    observacaoObrigatoria?: boolean;
    fotoObrigatoria?: boolean;
    acao?: string;
  };

  const createTopicItems = (
    items: Nr12ItemDefinition[],
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
    itens: Nr12ItemDefinition[];
  }> = [
    {
      id: 'nr12-topic-1',
      titulo: 'Inventário, Documentação e Procedimentos',
      ordem: 1,
      itens: [
        {
          subitem: 'Inventário',
          item: 'Máquina ou equipamento consta do inventário com identificação, capacidade, descrição do sistema e riscos associados',
          criticidade: 'alto',
          acao: 'Atualizar o inventário antes da continuidade operacional.',
        },
        {
          subitem: 'Manual',
          item: 'Manual do fabricante está disponível em português e acessível aos operadores e mantenedores',
          criticidade: 'alto',
          acao: 'Disponibilizar o manual ou instrução técnica equivalente antes da operação.',
        },
        {
          subitem: 'Procedimento operacional',
          item: 'Procedimentos de operação, limpeza, ajuste, inspeção e manutenção estão formalizados e disponíveis',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização dos procedimentos aplicáveis.',
        },
        {
          subitem: 'Análise de risco',
          item: 'Apreciação ou análise de risco da máquina está disponível e compatível com a configuração real',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até validação da análise de risco da máquina.',
        },
        {
          subitem: 'Sinalização técnica',
          item: 'Identificação da máquina, capacidade, sentido de rotação, pontos de risco e advertências estão legíveis',
          criticidade: 'alto',
          acao: 'Regularizar a sinalização técnica e de segurança antes do uso.',
        },
      ],
    },
    {
      id: 'nr12-topic-2',
      titulo: 'Instalação, Arranjo Físico e Estrutura',
      ordem: 2,
      itens: [
        {
          subitem: 'Fixação e estabilidade',
          item: 'Máquina está instalada, nivelada e fixada de forma a garantir estabilidade operacional',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até correção da instalação e estabilidade da máquina.',
        },
        {
          subitem: 'Espaçamento',
          item: 'Há espaços ao redor da máquina suficientes para operação, abastecimento, manutenção e evacuação segura',
          criticidade: 'alto',
          acao: 'Readequar o arranjo físico antes da continuidade operacional.',
        },
        {
          subitem: 'Piso',
          item: 'Piso do entorno está íntegro, antiderrapante quando necessário e livre de irregularidades que gerem risco',
          criticidade: 'alto',
          acao: 'Corrigir o piso e eliminar o risco antes da operação.',
        },
        {
          subitem: 'Iluminação',
          item: 'Iluminação geral e localizada é suficiente para operação, inspeção, ajuste e manutenção',
          criticidade: 'alto',
          acao: 'Adequar a iluminação antes da execução da atividade.',
        },
        {
          subitem: 'Acesso seguro',
          item: 'Acessos, escadas, plataformas e passarelas permanentes estão íntegros e seguros quando existentes',
          criticidade: 'alto',
          acao: 'Interditar o acesso inseguro e corrigir a estrutura antes do uso.',
        },
      ],
    },
    {
      id: 'nr12-topic-3',
      titulo: 'Proteções, Enclausuramento e Dispositivos de Segurança',
      ordem: 3,
      itens: [
        {
          subitem: 'Proteções fixas',
          item: 'Proteções fixas estão instaladas, íntegras e impedem acesso à zona de perigo',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a máquina até recomposição das proteções fixas.',
        },
        {
          subitem: 'Proteções móveis',
          item: 'Proteções móveis estão íntegras, corretamente fixadas e sem possibilidade de neutralização indevida',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a máquina até correção das proteções móveis.',
        },
        {
          subitem: 'Intertravamentos',
          item: 'Intertravamentos e chaves de segurança funcionam corretamente e impedem acesso inseguro às zonas de risco',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a máquina até correção do sistema de intertravamento.',
        },
        {
          subitem: 'Neutralização',
          item: 'Não há burlas, pontes, by-pass, sensores anulados ou qualquer neutralização de dispositivo de segurança',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a máquina e eliminar a neutralização indevida.',
        },
        {
          subitem: 'Detecção de presença',
          item: 'Cortina de luz, scanner, tapete ou detector de presença opera corretamente quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a máquina até restabelecimento do sistema de detecção aplicável.',
        },
        {
          subitem: 'Risco residual',
          item: 'Riscos residuais estão identificados, sinalizados e controlados por procedimento e treinamento',
          criticidade: 'alto',
          acao: 'Reavaliar os controles do risco residual antes da continuidade.',
        },
      ],
    },
    {
      id: 'nr12-topic-4',
      titulo: 'Comandos, Partida, Parada e Emergência',
      ordem: 4,
      itens: [
        {
          subitem: 'Partida segura',
          item: 'Sistema de partida exige ação intencional e não permite acionamento involuntário',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a máquina até correção do sistema de partida.',
        },
        {
          subitem: 'Parada normal',
          item: 'Dispositivo de parada normal opera corretamente e é acessível ao operador',
          criticidade: 'alto',
          acao: 'Corrigir o sistema de parada normal antes do uso.',
        },
        {
          subitem: 'Parada de emergência',
          item: 'Dispositivos de parada de emergência estão acessíveis, identificados e funcionam corretamente',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a máquina até correção da parada de emergência.',
        },
        {
          subitem: 'Reset pós-emergência',
          item: 'O rearme após parada de emergência não provoca partida automática da máquina',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a máquina até correção da lógica de rearme.',
        },
        {
          subitem: 'Modo de operação',
          item: 'Seletores de modo, comandos bimanuais e controles especiais operam corretamente quando aplicáveis',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a máquina até correção dos dispositivos de comando aplicáveis.',
        },
      ],
    },
    {
      id: 'nr12-topic-5',
      titulo: 'Sistemas Elétricos, Energias Perigosas e Bloqueio',
      ordem: 5,
      itens: [
        {
          subitem: 'Painel elétrico',
          item: 'Painéis e componentes elétricos estão fechados, identificados, protegidos e sem partes energizadas expostas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a máquina até correção das condições inseguras no sistema elétrico.',
        },
        {
          subitem: 'Aterramento',
          item: 'Sistema de aterramento da máquina está íntegro e compatível com a instalação',
          criticidade: 'alto',
          acao: 'Regularizar o aterramento antes da operação.',
        },
        {
          subitem: 'Cabos e componentes',
          item: 'Cabos, eletrodutos, bornes e conexões estão íntegros, sem aquecimento, improvisos ou danos',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a máquina até correção dos componentes elétricos danificados.',
        },
        {
          subitem: 'Bloqueio de energias',
          item: 'Procedimento de bloqueio e etiquetagem contempla todas as energias perigosas da máquina',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção até implantação do bloqueio de energias perigosas.',
        },
        {
          subitem: 'Ponto de bloqueio',
          item: 'Dispositivos de seccionamento e pontos de bloqueio estão identificados e acessíveis',
          criticidade: 'alto',
          acao: 'Adequar identificação e acessibilidade dos pontos de bloqueio antes da intervenção.',
        },
      ],
    },
    {
      id: 'nr12-topic-6',
      titulo: 'Operação, Abastecimento e Materiais',
      ordem: 6,
      itens: [
        {
          subitem: 'Posto de operação',
          item: 'Posto de trabalho permite operação segura, boa visibilidade e postura adequada do operador',
          criticidade: 'alto',
          acao: 'Readequar o posto de operação antes da continuidade.',
        },
        {
          subitem: 'Abastecimento',
          item: 'Atividades de abastecimento, alimentação e retirada de material ocorrem sem exposição à zona de perigo',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até eliminação da exposição insegura durante abastecimento ou retirada.',
        },
        {
          subitem: 'Materiais projetados',
          item: 'Há controle contra projeção, queda, ruptura ou expulsão de materiais e peças quando aplicável',
          criticidade: 'alto',
          acao: 'Implantar contenção ou proteção adequada antes da operação.',
        },
        {
          subitem: 'Ferramentas e acessórios',
          item: 'Ferramentas, gabaritos, matrizes, facas e acessórios estão íntegros e adequados à operação',
          criticidade: 'alto',
          acao: 'Substituir ou regularizar os acessórios antes da operação.',
        },
        {
          subitem: 'Limpeza operacional',
          item: 'Limpeza durante operação segue procedimento seguro e não expõe trabalhador à zona de perigo',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a prática insegura e adequar o método de limpeza.',
        },
      ],
    },
    {
      id: 'nr12-topic-7',
      titulo: 'Manutenção, Ajuste, Inspeção e Setup',
      ordem: 7,
      itens: [
        {
          subitem: 'Manutenção planejada',
          item: 'Manutenção preventiva e corretiva ocorre com procedimento, responsável definido e rastreabilidade',
          criticidade: 'alto',
          acao: 'Regularizar o plano e os registros de manutenção antes da continuidade operacional.',
        },
        {
          subitem: 'Intervenção segura',
          item: 'Ajuste, setup, lubrificação, inspeção e manutenção ocorrem com energias perigosas controladas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a intervenção até controle efetivo das energias perigosas.',
        },
        {
          subitem: 'Peças de reposição',
          item: 'Peças e componentes de reposição são compatíveis com o projeto e com o sistema de segurança da máquina',
          criticidade: 'alto',
          acao: 'Substituir componentes inadequados antes da liberação.',
        },
        {
          subitem: 'Teste pós-manutenção',
          item: 'Testes pós-manutenção verificam segurança funcional antes do retorno da máquina à produção',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a máquina até execução e registro do teste pós-manutenção.',
        },
        {
          subitem: 'Liberação formal',
          item: 'Retorno à operação após intervenção ocorre com liberação formal do responsável',
          criticidade: 'alto',
          acao: 'Formalizar a liberação técnica antes do retorno à operação.',
        },
      ],
    },
    {
      id: 'nr12-topic-8',
      titulo: 'Capacitação, Autorização e Gestão de Pessoas',
      ordem: 8,
      itens: [
        {
          subitem: 'Capacitação do operador',
          item: 'Operadores e intervenientes receberam capacitação compatível com a máquina, função e riscos envolvidos',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até capacitação adequada do trabalhador.',
        },
        {
          subitem: 'Autorização',
          item: 'Operação, setup e manutenção são executados somente por pessoas autorizadas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até definição e controle dos autorizados.',
        },
        {
          subitem: 'Reciclagem',
          item: 'Treinamentos, reciclagens e orientações adicionais estão atualizados quando houver mudança de processo, incidente ou modificação da máquina',
          criticidade: 'alto',
          acao: 'Atualizar a reciclagem antes da continuidade operacional.',
        },
        {
          subitem: 'Supervisão',
          item: 'Trabalhadores novos, terceirizados ou em condição especial contam com supervisão compatível',
          criticidade: 'alto',
          acao: 'Adequar a supervisão antes da execução da atividade.',
        },
      ],
    },
    {
      id: 'nr12-topic-9',
      titulo: 'Ergonomia, Acessos e Sinalização',
      ordem: 9,
      itens: [
        {
          subitem: 'Ergonomia',
          item: 'A operação não impõe postura forçada, esforço excessivo, repetitividade crítica ou alcance inseguro sem controle',
          criticidade: 'alto',
          acao: 'Reavaliar ergonomia e implantar melhorias antes da continuidade.',
        },
        {
          subitem: 'Acessos permanentes',
          item: 'Escadas, plataformas, passarelas e guarda-corpos associados à máquina atendem às condições seguras de acesso',
          criticidade: 'alto',
          acao: 'Interditar o acesso inseguro até correção.',
        },
        {
          subitem: 'Sinalização de segurança',
          item: 'Sinalização de advertência, proibição, emergência e identificação de riscos está íntegra e visível',
          criticidade: 'alto',
          acao: 'Regularizar a sinalização antes da operação.',
        },
        {
          subitem: 'Iluminação de inspeção',
          item: 'Há iluminação suficiente para leitura de sinalização, inspeção e intervenção segura na máquina',
          criticidade: 'medio',
          acao: 'Adequar a iluminação antes das intervenções na máquina.',
        },
      ],
    },
    {
      id: 'nr12-topic-10',
      titulo: 'Emergência, Resposta e Auditoria Operacional',
      ordem: 10,
      itens: [
        {
          subitem: 'Plano de resposta',
          item: 'Existem procedimentos para emergência, falha funcional, aprisionamento, incêndio e evacuação associados à máquina',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até implantação dos procedimentos de resposta à emergência.',
        },
        {
          subitem: 'Resgate e primeiros socorros',
          item: 'Equipe sabe acionar resposta, isolamento, resgate e primeiros socorros em ocorrência com a máquina',
          criticidade: 'alto',
          acao: 'Reforçar treinamentos e meios de resposta antes da continuidade.',
        },
        {
          subitem: 'Incidentes e quase acidentes',
          item: 'Incidentes, quase acidentes e falhas da máquina possuem registro, investigação e ação corretiva implementada',
          criticidade: 'medio',
          acao: 'Formalizar investigação e implantar ações corretivas pendentes.',
        },
        {
          subitem: 'Auditoria operacional',
          item: 'Inspeções de rotina verificam proteções, comandos, bloqueios e comportamento seguro dos operadores',
          criticidade: 'medio',
          acao: 'Implantar ou reforçar a rotina de auditoria operacional.',
        },
        {
          subitem: 'Interdição por desvio grave',
          item: 'Máquina é retirada de uso quando houver desvio grave que comprometa o sistema de segurança',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interditar imediatamente a máquina até eliminação do desvio grave.',
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
