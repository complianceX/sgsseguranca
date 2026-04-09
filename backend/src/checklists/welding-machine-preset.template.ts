import { ChecklistItemValue, ChecklistTopicValue } from './types/checklist-item.type';

export function buildWeldingMachineTopics(): ChecklistTopicValue[] {
  type WeldingMachineItemDefinition = {
    subitem: string;
    item: string;
    criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
    bloqueia?: boolean;
    observacaoObrigatoria?: boolean;
    fotoObrigatoria?: boolean;
    acao?: string;
  };

  const createTopicItems = (
    items: WeldingMachineItemDefinition[],
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
    itens: WeldingMachineItemDefinition[];
  }> = [
    {
      id: 'welding-machine-topic-1',
      titulo: 'Identificação e Documentação',
      ordem: 1,
      itens: [
        {
          subitem: 'Identificação do equipamento',
          item: 'Máquina identificada por patrimônio, número de série, tag ou controle interno rastreável',
          criticidade: 'alto',
          acao: 'Regularizar a identificação do equipamento antes do uso.',
        },
        {
          subitem: 'Manual e instruções',
          item: 'Manual do fabricante ou instruções operacionais estão disponíveis para consulta',
          criticidade: 'medio',
          acao: 'Disponibilizar instruções operacionais antes da liberação.',
        },
        {
          subitem: 'Tensão e capacidade',
          item: 'Tensão de alimentação, faixa de corrente e ciclo de trabalho estão identificados e compatíveis com a atividade',
          criticidade: 'alto',
          acao: 'Conferir a compatibilidade elétrica e operacional antes do uso.',
        },
        {
          subitem: 'Registro de inspeção',
          item: 'Equipamento possui registro de inspeção e controle de manutenção disponível',
          criticidade: 'alto',
          acao: 'Regularizar o registro de inspeção e manutenção do equipamento.',
        },
      ],
    },
    {
      id: 'welding-machine-topic-2',
      titulo: 'Condição Geral do Equipamento',
      ordem: 2,
      itens: [
        {
          subitem: 'Carcaça e estrutura',
          item: 'Carcaça, alças, rodízios, pés e estrutura do equipamento estão íntegros e sem deformações críticas',
          criticidade: 'alto',
          acao: 'Retirar de uso até correção da integridade estrutural do equipamento.',
        },
        {
          subitem: 'Sujidade e umidade',
          item: 'Equipamento está limpo, seco e sem acúmulo de óleo, poeira condutiva ou umidade excessiva',
          criticidade: 'alto',
          acao: 'Limpar, secar e reinspecionar o equipamento antes do uso.',
        },
        {
          subitem: 'Ventilação do equipamento',
          item: 'Aberturas de ventilação estão desobstruídas e sem sinais de superaquecimento',
          criticidade: 'alto',
          acao: 'Desobstruir as aberturas e inspecionar a condição térmica do equipamento.',
        },
        {
          subitem: 'Sinais de dano',
          item: 'Não há cheiro de queimado, marcas de arco, trincas, peças soltas ou ruídos anormais no equipamento',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o equipamento e encaminhar para inspeção técnica.',
        },
      ],
    },
    {
      id: 'welding-machine-topic-3',
      titulo: 'Alimentação Elétrica e Aterramento',
      ordem: 3,
      itens: [
        {
          subitem: 'Ponto de alimentação',
          item: 'Ponto de alimentação elétrica é compatível com a máquina e está em condição segura de uso',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até correção do ponto de alimentação.',
        },
        {
          subitem: 'Cabo de alimentação',
          item: 'Cabo de alimentação sem emendas improvisadas, cortes, esmagamentos ou exposição de condutores',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a máquina até substituição ou reparo tecnicamente adequado do cabo de alimentação.',
        },
        {
          subitem: 'Plugue e conexão',
          item: 'Plugue, tomada industrial ou borne de alimentação estão íntegros, firmes e sem aquecimento anormal',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a máquina até correção da conexão elétrica.',
        },
        {
          subitem: 'Aterramento',
          item: 'Aterramento ou condutor de proteção do equipamento está íntegro e funcional quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até regularização do aterramento do equipamento.',
        },
      ],
    },
    {
      id: 'welding-machine-topic-4',
      titulo: 'Cabos de Solda e Conexões',
      ordem: 4,
      itens: [
        {
          subitem: 'Cabos de solda',
          item: 'Cabos de solda estão íntegros, sem emendas improvisadas, ressecamento, queimaduras ou exposição de condutores',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a máquina até substituição dos cabos de solda reprovados.',
        },
        {
          subitem: 'Terminais e conectores',
          item: 'Terminais, engates rápidos e conectores estão firmes, sem folga, corrosão ou aquecimento anormal',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até correção dos terminais e conectores.',
        },
        {
          subitem: 'Roteamento dos cabos',
          item: 'Cabos estão posicionados sem risco de esmagamento, abrasão, contato com partes quentes ou passagem de veículos',
          criticidade: 'alto',
          acao: 'Reorganizar o roteamento dos cabos antes da atividade.',
        },
        {
          subitem: 'Fixação mecânica',
          item: 'Cabos estão adequadamente fixados ao equipamento e aos acessórios, sem desprendimento ou torção excessiva',
          criticidade: 'alto',
          acao: 'Reapertar ou substituir as conexões mecânicas dos cabos.',
        },
      ],
    },
    {
      id: 'welding-machine-topic-5',
      titulo: 'Acessórios e Circuito de Soldagem',
      ordem: 5,
      itens: [
        {
          subitem: 'Porta-eletrodo ou tocha',
          item: 'Porta-eletrodo, tocha ou conjunto de soldagem estão íntegros, isolados e em condição segura de uso',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até substituição ou reparo do acessório de soldagem.',
        },
        {
          subitem: 'Garra de retorno',
          item: 'Garra de retorno (terra) está íntegra, com pressão adequada e contato firme com a peça ou bancada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até correção da garra de retorno.',
        },
        {
          subitem: 'Mangueiras e reguladores',
          item: 'Mangueiras, reguladores e conexões de gás estão íntegros e sem vazamento quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até eliminação do vazamento ou substituição dos componentes de gás.',
        },
        {
          subitem: 'Consumíveis',
          item: 'Eletrodos, arames, bicos, difusores e consumíveis estão compatíveis com o processo e em condição adequada',
          criticidade: 'medio',
          acao: 'Adequar os consumíveis antes do início da soldagem.',
        },
      ],
    },
    {
      id: 'welding-machine-topic-6',
      titulo: 'Comandos, Regulagem e Refrigeração',
      ordem: 6,
      itens: [
        {
          subitem: 'Liga/desliga',
          item: 'Chave geral, botão de acionamento e comandos do equipamento funcionam corretamente',
          criticidade: 'alto',
          acao: 'Retirar de uso até correção dos comandos do equipamento.',
        },
        {
          subitem: 'Regulagem de parâmetros',
          item: 'Corrente, tensão, polaridade e demais parâmetros estão ajustados de forma compatível com o processo',
          criticidade: 'alto',
          acao: 'Revisar a parametrização antes de iniciar a soldagem.',
        },
        {
          subitem: 'Sistema de refrigeração',
          item: 'Ventilador, circulação de ar e sistemas auxiliares de refrigeração funcionam adequadamente',
          criticidade: 'alto',
          acao: 'Bloquear o uso até correção do sistema de refrigeração.',
        },
        {
          subitem: 'Alarmes e proteções',
          item: 'Indicações de falha, proteção térmica e alertas do equipamento estão operantes quando existentes',
          criticidade: 'alto',
          acao: 'Inspecionar e corrigir as proteções internas do equipamento.',
        },
      ],
    },
    {
      id: 'welding-machine-topic-7',
      titulo: 'Condições do Local de Uso',
      ordem: 7,
      itens: [
        {
          subitem: 'Base de apoio',
          item: 'Máquina está apoiada em base estável, seca e compatível com o peso e a operação',
          criticidade: 'alto',
          acao: 'Reposicionar a máquina em base estável e segura.',
        },
        {
          subitem: 'Ventilação do ambiente',
          item: 'Local possui ventilação compatível com dissipação de fumos e calor do processo de soldagem',
          criticidade: 'alto',
          acao: 'Adequar a ventilação local antes da atividade.',
        },
        {
          subitem: 'Segregação de inflamáveis',
          item: 'Materiais inflamáveis, recipientes pressurizados e substâncias combustíveis estão afastados ou protegidos',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até segregação adequada dos materiais inflamáveis.',
        },
        {
          subitem: 'Interferência externa',
          item: 'Trânsito de pessoas, cabos energizados expostos e outras interferências do entorno estão controlados',
          criticidade: 'alto',
          acao: 'Controlar as interferências do entorno antes da soldagem.',
        },
      ],
    },
    {
      id: 'welding-machine-topic-8',
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
          subitem: 'Operador habilitado',
          item: 'Operador está orientado, autorizado e apto a utilizar a máquina de solda',
          criticidade: 'alto',
          acao: 'Regularizar a qualificação e autorização do operador.',
        },
        {
          subitem: 'Proteção da peça e retorno',
          item: 'Ponto de retorno está adequadamente instalado para evitar passagem indevida de corrente por estruturas ou rolamentos',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até reposicionamento correto do retorno da solda.',
        },
        {
          subitem: 'Sobrecarga térmica',
          item: 'Operação respeita o ciclo de trabalho do equipamento e não há indício de sobrecarga térmica',
          criticidade: 'alto',
          acao: 'Interromper o uso e ajustar o regime de operação da máquina.',
        },
      ],
    },
    {
      id: 'welding-machine-topic-9',
      titulo: 'Manutenção, Bloqueio e Liberação',
      ordem: 9,
      itens: [
        {
          subitem: 'Manutenção periódica',
          item: 'Manutenção preventiva ou corretiva do equipamento está dentro da rotina definida',
          criticidade: 'medio',
          acao: 'Regularizar a manutenção do equipamento conforme plano definido.',
        },
        {
          subitem: 'Bloqueio por defeito',
          item: 'Equipamento com defeito, dano elétrico ou falha funcional é segregado e identificado como inapto',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o equipamento defeituoso e retirar de circulação.',
        },
        {
          subitem: 'Liberação após reparo',
          item: 'Equipamento reparado somente retorna ao uso após inspeção e liberação formal',
          criticidade: 'alto',
          acao: 'Reinspecionar e liberar formalmente antes do retorno ao uso.',
        },
        {
          subitem: 'Improvisos e adaptações',
          item: 'Não há adaptações improvisadas, pontes, gambiarras ou componentes incompatíveis instalados',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o equipamento e remover as adaptações indevidas.',
        },
      ],
    },
    {
      id: 'welding-machine-topic-10',
      titulo: 'Pós-Uso, Transporte e Armazenamento',
      ordem: 10,
      itens: [
        {
          subitem: 'Desligamento ao final',
          item: 'Equipamento é desligado e desenergizado ao final da atividade ou durante interrupções prolongadas',
          criticidade: 'alto',
          acao: 'Desligar e desenergizar corretamente o equipamento ao encerrar a atividade.',
        },
        {
          subitem: 'Acondicionamento dos cabos',
          item: 'Cabos e acessórios são acondicionados sem dobras agressivas, esmagamentos ou contato com superfícies quentes',
          criticidade: 'medio',
          acao: 'Acondicionar corretamente cabos e acessórios após o uso.',
        },
        {
          subitem: 'Transporte do equipamento',
          item: 'Transporte é realizado sem impactos, arraste indevido pelos cabos ou dano aos conectores',
          criticidade: 'medio',
          acao: 'Corrigir o método de transporte do equipamento.',
        },
        {
          subitem: 'Armazenamento',
          item: 'Máquina é armazenada em local seco, protegido e organizado, sem exposição a intempéries',
          criticidade: 'medio',
          acao: 'Adequar o local e a forma de armazenamento da máquina.',
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
