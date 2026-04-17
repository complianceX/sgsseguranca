/**
 * Catálogo de templates de itens de risco por tipo de atividade.
 *
 * Alinhado com NR-35 (trabalho em altura), NR-10 (elétrica), NR-33 (espaço
 * confinado), NR-11 (movimentação de cargas), NR-18 (construção civil) e
 * práticas do setor de mineração e manutenção industrial.
 *
 * Cada template fornece itens de risco estruturados pré-preenchidos que o
 * usuário pode ajustar antes de criar a APR final.
 */

import { AprControlHierarchy } from './entities/apr-risk-item.entity';

export interface AprActivityTemplateRiskItem {
  atividade: string;
  etapa?: string;
  agente_ambiental?: string;
  condicao_perigosa?: string;
  fonte_circunstancia?: string;
  lesao?: string;
  probabilidade?: number;
  severidade?: number;
  hierarquia_controle?: AprControlHierarchy;
  medidas_prevencao?: string;
  responsavel?: string;
  status_acao?: string;
}

export interface AprActivityTemplate {
  tipo_atividade: string;
  label: string;
  descricao: string;
  risk_items: AprActivityTemplateRiskItem[];
}

export const APR_ACTIVITY_TEMPLATES: AprActivityTemplate[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Trabalho em Altura — NR-35
  // ─────────────────────────────────────────────────────────────────────────
  {
    tipo_atividade: 'trabalho_altura',
    label: 'Trabalho em Altura',
    descricao:
      'Atividades realizadas acima de 2 m do nível inferior onde haja risco de queda (NR-35).',
    risk_items: [
      {
        atividade: 'Trabalho em Altura',
        etapa: 'Acesso / subida',
        agente_ambiental: 'Gravitacional',
        condicao_perigosa: 'Queda de trabalhador de nível elevado',
        fonte_circunstancia:
          'Uso inadequado ou ausência de sistema de proteção coletiva ou individual',
        lesao: 'Fraturas, traumatismo craniano, óbito',
        probabilidade: 3,
        severidade: 5,
        hierarquia_controle: AprControlHierarchy.EPI,
        medidas_prevencao:
          'Capacitação NR-35; inspeção do sistema de ancoragem; uso obrigatório de cinto tipo paraquedista e talabarte de dupla trava; linha de vida; andaime ou plataforma devidamente instalada.',
        responsavel: 'Responsável de Segurança',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Trabalho em Altura',
        etapa: 'Execução',
        agente_ambiental: 'Gravitacional',
        condicao_perigosa: 'Queda de materiais e ferramentas',
        fonte_circunstancia:
          'Falta de amarração ou contenção de objetos no alto',
        lesao: 'Traumatismo craniano, contusão, fraturas em pessoas abaixo',
        probabilidade: 3,
        severidade: 4,
        hierarquia_controle: AprControlHierarchy.EPC,
        medidas_prevencao:
          'Cordas de ferramenta (tool lanyards); bandeja guarda-corpo; isolamento da área inferior; capacete com jugular para todos na área de risco.',
        responsavel: 'Supervisor de Execução',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Trabalho em Altura',
        etapa: 'Verificação pré-tarefa',
        condicao_perigosa: 'Deterioração de equipamentos de proteção (EPI/EPC)',
        fonte_circunstancia:
          'Uso de cintos, talabartess ou andaimes sem inspeção prévia',
        lesao: 'Queda com consequências graves',
        probabilidade: 2,
        severidade: 5,
        hierarquia_controle: AprControlHierarchy.ADMINISTRATIVO,
        medidas_prevencao:
          'Inspeção obrigatória de todos os EPIs antes da subida; preenchimento do diário de segurança; verificação de validade e integridade estrutural do andaime.',
        responsavel: 'Responsável de Segurança',
        status_acao: 'Pendente',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Serviços Elétricos — NR-10
  // ─────────────────────────────────────────────────────────────────────────
  {
    tipo_atividade: 'eletrica',
    label: 'Serviços Elétricos',
    descricao:
      'Trabalhos em instalações elétricas ou próximos a partes energizadas (NR-10).',
    risk_items: [
      {
        atividade: 'Serviços Elétricos',
        etapa: 'Preparação / bloqueio',
        agente_ambiental: 'Energia elétrica',
        condicao_perigosa: 'Choque elétrico por contato direto ou indireto',
        fonte_circunstancia:
          'Falta de bloqueio/travamento (LOTO) antes da intervenção',
        lesao: 'Queimaduras, parada cardiorrespiratória, óbito',
        probabilidade: 2,
        severidade: 5,
        hierarquia_controle: AprControlHierarchy.ADMINISTRATIVO,
        medidas_prevencao:
          'Procedimento LOTO obrigatório; verificação de ausência de tensão com detector calibrado; uso de luvas isolantes classe adequada; capacitação NR-10 com certificado válido.',
        responsavel: 'Eletricista Responsável',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Serviços Elétricos',
        etapa: 'Execução',
        agente_ambiental: 'Energia elétrica — arco elétrico',
        condicao_perigosa: 'Flash over / arco elétrico em painéis energizados',
        fonte_circunstancia:
          'Abertura inadvertida de compartimentos sob carga elétrica',
        lesao: 'Queimaduras de 2.º e 3.º graus, cegueira temporária',
        probabilidade: 2,
        severidade: 4,
        hierarquia_controle: AprControlHierarchy.EPI,
        medidas_prevencao:
          'Cálculo de incidente energético (cal/cm²); uso de roupa arco-flash adequada; protetor facial arco; manter distância de segurança conforme NFPA 70E / NR-10.',
        responsavel: 'Supervisor Elétrico',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Serviços Elétricos',
        etapa: 'Pós-intervenção',
        agente_ambiental: 'Energia elétrica',
        condicao_perigosa:
          'Re-energização acidental durante manutenção em andamento',
        fonte_circunstancia: 'Falta de comunicação entre equipes',
        lesao: 'Choque elétrico, queimaduras',
        probabilidade: 2,
        severidade: 5,
        hierarquia_controle: AprControlHierarchy.ADMINISTRATIVO,
        medidas_prevencao:
          'Cadeado pessoal por trabalhador no LOTO; comunicação por rádio antes de re-energizar; tag de perigo visível no painel.',
        responsavel: 'Responsável de Segurança',
        status_acao: 'Pendente',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Espaço Confinado — NR-33
  // ─────────────────────────────────────────────────────────────────────────
  {
    tipo_atividade: 'espaco_confinado',
    label: 'Espaço Confinado',
    descricao:
      'Entrada e trabalho em espaços com aberturas limitadas, não projetados para ocupação contínua (NR-33).',
    risk_items: [
      {
        atividade: 'Espaço Confinado',
        etapa: 'Monitoramento atmosférico',
        agente_ambiental: 'Atmosfera deficiente em oxigênio / gases tóxicos',
        condicao_perigosa:
          'Intoxicação ou asfixia por atmosfera perigosa (O₂ < 19,5% ou > 23,5%)',
        fonte_circunstancia:
          'Gases residuais (H₂S, CO, CH₄) ou consumo de O₂ por oxidação',
        lesao: 'Asfixia, intoxicação, óbito',
        probabilidade: 3,
        severidade: 5,
        hierarquia_controle: AprControlHierarchy.EPC,
        medidas_prevencao:
          'Monitoramento contínuo com detector 4 gases antes e durante a entrada; ventilação forçada mecânica; SCBA ou respirador de linha de ar; supervisor e vigia externo com rádio.',
        responsavel: 'Supervisor de Espaço Confinado',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Espaço Confinado',
        etapa: 'Entrada / saída',
        agente_ambiental: 'Energias residuais / mecânicas',
        condicao_perigosa: 'Aprisionamento por colapso de paredes ou material',
        fonte_circunstancia:
          'Falta de escoramento ou pressurização de tubulações',
        lesao: 'Esmagamento, soterramento, óbito',
        probabilidade: 2,
        severidade: 5,
        hierarquia_controle: AprControlHierarchy.ADMINISTRATIVO,
        medidas_prevencao:
          'LOTO completo de todas as entradas de energia e fluido; escoramento de paredes instáveis; isolamento de abertura com guarda-corpo; corda de resgate ligada ao trabalhador.',
        responsavel: 'Engenheiro de Segurança',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Espaço Confinado',
        etapa: 'Resgate',
        agente_ambiental: 'Atmosfera / gravitacional',
        condicao_perigosa:
          'Resgate inadequado comprometendo o socorrista (dupla vítima)',
        fonte_circunstancia:
          'Entrada de resgatista sem EPI adequado por pânico ou urgência',
        lesao: 'Asfixia, queda, intoxicação do resgatista',
        probabilidade: 2,
        severidade: 5,
        hierarquia_controle: AprControlHierarchy.ADMINISTRATIVO,
        medidas_prevencao:
          'Plano de resgate não-invasivo como primeira opção; kit de resgate treinado com tripé e talha; SCBA de circuito fechado para o resgatista.',
        responsavel: 'Equipe de Resgate Treinada',
        status_acao: 'Pendente',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Içamento de Cargas — NR-11
  // ─────────────────────────────────────────────────────────────────────────
  {
    tipo_atividade: 'icamento',
    label: 'Içamento de Cargas',
    descricao:
      'Movimentação de cargas com equipamentos de içamento (guindaste, talha, ponte rolante) — NR-11.',
    risk_items: [
      {
        atividade: 'Içamento de Cargas',
        etapa: 'Planejamento da carga',
        agente_ambiental: 'Gravitacional — carga suspensa',
        condicao_perigosa: 'Queda da carga por eslingamento inadequado',
        fonte_circunstancia:
          'Uso de eslingas fora da capacidade nominal ou com defeito',
        lesao: 'Esmagamento, óbito',
        probabilidade: 2,
        severidade: 5,
        hierarquia_controle: AprControlHierarchy.EPC,
        medidas_prevencao:
          'Cálculo de carga e seleção de eslingas com fator de segurança; inspeção visual pré-uso; certificação do operador; área de exclusão abaixo da carga.',
        responsavel: 'Operador de Guindaste Certificado',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Içamento de Cargas',
        etapa: 'Içamento',
        agente_ambiental: 'Gravitacional / mecânico',
        condicao_perigosa:
          'Tombamento do equipamento de içamento por sobrecarga ou piso instável',
        fonte_circunstancia:
          'Solo não compactado ou capacidade de carga do piso não verificada',
        lesao: 'Esmagamento grave, óbito',
        probabilidade: 2,
        severidade: 5,
        hierarquia_controle: AprControlHierarchy.ADMINISTRATIVO,
        medidas_prevencao:
          'Laudo de capacidade do piso; uso de placas de distribuição de carga; verificação de nível e estabilização do equipamento antes do içamento.',
        responsavel: 'Engenheiro Civil / Responsável Técnico',
        status_acao: 'Pendente',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Manutenção Mecânica
  // ─────────────────────────────────────────────────────────────────────────
  {
    tipo_atividade: 'manutencao_mecanica',
    label: 'Manutenção Mecânica',
    descricao:
      'Manutenção, reparo e substituição de componentes mecânicos em equipamentos rotativos e estáticos.',
    risk_items: [
      {
        atividade: 'Manutenção Mecânica',
        etapa: 'Desmontagem',
        agente_ambiental: 'Energia mecânica — energia residual',
        condicao_perigosa:
          'Acionamento inesperado de equipamento em manutenção',
        fonte_circunstancia:
          'Falta de bloqueio de energia (LOTO) antes da intervenção',
        lesao: 'Esmagamento, amputação, óbito',
        probabilidade: 2,
        severidade: 5,
        hierarquia_controle: AprControlHierarchy.ADMINISTRATIVO,
        medidas_prevencao:
          'LOTO obrigatório em todas as fontes de energia (elétrica, pneumática, hidráulica, gravitacional); verificação de zero energia antes do trabalho; etiqueta de bloqueio pessoal.',
        responsavel: 'Mecânico de Manutenção',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Manutenção Mecânica',
        etapa: 'Execução',
        agente_ambiental: 'Ergonômico',
        condicao_perigosa:
          'Lesão por esforço repetitivo ou postura inadequada em trabalhos confinados',
        fonte_circunstancia: 'Manutenção em locais de difícil acesso',
        lesao: 'LER/DORT, hérnia de disco',
        probabilidade: 3,
        severidade: 2,
        hierarquia_controle: AprControlHierarchy.ADMINISTRATIVO,
        medidas_prevencao:
          'Uso de ferramentas extensoras ou posicionadores; rodízio de tarefas; pausas programadas; avaliação ergonômica do posto.',
        responsavel: 'Supervisor de Manutenção',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Manutenção Mecânica',
        etapa: 'Execução',
        agente_ambiental: 'Químico — fluidos de processo',
        condicao_perigosa: 'Exposição a fluidos quentes, corrosivos ou tóxicos',
        fonte_circunstancia:
          'Abertura de linhas sem alívio de pressão ou drenagem',
        lesao: 'Queimaduras, intoxicação, irritação química',
        probabilidade: 2,
        severidade: 3,
        hierarquia_controle: AprControlHierarchy.EPI,
        medidas_prevencao:
          'Alívio e drenagem completa da linha antes da abertura; uso de óculos de proteção química, luvas de nitrila/butílico e avental; MSDS do fluido disponível.',
        responsavel: 'Técnico de Segurança',
        status_acao: 'Pendente',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Caldeiraria e Soldagem
  // ─────────────────────────────────────────────────────────────────────────
  {
    tipo_atividade: 'caldeiraria',
    label: 'Caldeiraria e Soldagem',
    descricao:
      'Trabalhos de caldeiraria, fabricação e soldagem estrutural a quente.',
    risk_items: [
      {
        atividade: 'Caldeiraria / Soldagem',
        etapa: 'Soldagem',
        agente_ambiental: 'Físico — radiação não ionizante (UV)',
        condicao_perigosa: 'Arco elétrico e respingos de solda',
        fonte_circunstancia:
          'Processo MIG/MAG/TIG/eletrodo sem proteção adequada',
        lesao: 'Queimaduras oculares (olho de soldador), queimaduras de pele',
        probabilidade: 3,
        severidade: 3,
        hierarquia_controle: AprControlHierarchy.EPI,
        medidas_prevencao:
          'Máscara de solda auto-escurecimento DIN ≥ 11; manta de proteção anti-respingo; avental de couro; manga; luvas de raspa; biombos de proteção para demais trabalhadores da área.',
        responsavel: 'Soldador Certificado',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Caldeiraria / Soldagem',
        etapa: 'Soldagem',
        agente_ambiental: 'Químico — fumos metálicos',
        condicao_perigosa: 'Inalação de fumos de soldagem (Mn, Cr VI, Ni)',
        fonte_circunstancia:
          'Soldagem em ambiente fechado sem ventilação adequada',
        lesao: 'Pneumoconiose, intoxicação crônica, siderose',
        probabilidade: 3,
        severidade: 3,
        hierarquia_controle: AprControlHierarchy.EPC,
        medidas_prevencao:
          'Exaustão localizada junto ao arco; ventilação geral diluidora; PFF2/PFF3 quando ventilação insuficiente; monitoramento da concentração de fumos.',
        responsavel: 'Técnico de Segurança',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Caldeiraria / Soldagem',
        etapa: 'Preparação da área',
        agente_ambiental: 'Físico — incêndio / explosão',
        condicao_perigosa:
          'Incêndio por trabalho a quente próximo a inflamáveis',
        fonte_circunstancia:
          'Faíscas ou respingos atingindo materiais combustíveis',
        lesao: 'Queimaduras graves, incêndio de grandes proporções',
        probabilidade: 2,
        severidade: 4,
        hierarquia_controle: AprControlHierarchy.ADMINISTRATIVO,
        medidas_prevencao:
          'Permissão de Trabalho a Quente (PTQ); limpeza de 10 m ao redor; extintor de CO₂ de 4 kg ao alcance; vigia de incêndio por 30 min após a soldagem; inspeção de gases inflamáveis com explosímetro.',
        responsavel: 'Técnico de Segurança',
        status_acao: 'Pendente',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Mineração
  // ─────────────────────────────────────────────────────────────────────────
  {
    tipo_atividade: 'mineracao',
    label: 'Mineração',
    descricao:
      'Operações de extração, desmonte e movimentação de minério em minas a céu aberto ou subterrâneas.',
    risk_items: [
      {
        atividade: 'Mineração',
        etapa: 'Desmonte com explosivos',
        agente_ambiental: 'Explosivo / onda de pressão',
        condicao_perigosa:
          'Explosão prematura ou falha de detonação (tiro falhado)',
        fonte_circunstancia:
          'Manuseio inadequado de explosivos ou circuito elétrico defeituoso',
        lesao: 'Amputação, óbito, traumatismo múltiplo',
        probabilidade: 2,
        severidade: 5,
        hierarquia_controle: AprControlHierarchy.ADMINISTRATIVO,
        medidas_prevencao:
          'Somente operador licenciado (NR-22/Artifício); procedimento de desmonte homologado; isolamento da área (raio mínimo conforme projeto); inspeção de tiros falhados antes da reentrada.',
        responsavel: 'Blaster / Técnico de Mineração',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Mineração',
        etapa: 'Operação de equipamentos',
        agente_ambiental: 'Gravitacional / mecânico',
        condicao_perigosa:
          'Tombamento de equipamento pesado em borda de bancada',
        fonte_circunstancia: 'Berma de proteção insuficiente ou piso instável',
        lesao: 'Óbito, esmagamento',
        probabilidade: 2,
        severidade: 5,
        hierarquia_controle: AprControlHierarchy.EPC,
        medidas_prevencao:
          'Berma de proteção com altura mínima de 1/2 rodeiro; inspeção de borda antes da operação; balizamento de área; câmera de ré + alarme sonoro em retroescavadeiras e caminhões.',
        responsavel: 'Operador e Supervisor de Mina',
        status_acao: 'Pendente',
      },
      {
        atividade: 'Mineração',
        etapa: 'Exposição ocupacional',
        agente_ambiental: 'Físico — ruído',
        condicao_perigosa: 'Exposição a ruído acima de 85 dB(A) contínuo',
        fonte_circunstancia:
          'Operação de britadores, perfuratrizes e caminhões',
        lesao: 'PAIR (Perda Auditiva Induzida por Ruído)',
        probabilidade: 4,
        severidade: 3,
        hierarquia_controle: AprControlHierarchy.EPI,
        medidas_prevencao:
          'Programa de Conservação Auditiva (PCA); cabines acústicas nos equipamentos; protetor auricular tipo concha ou plug com CA válido; dosimetria periódica.',
        responsavel: 'SESMT',
        status_acao: 'Pendente',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Atividade Genérica / Outros
  // ─────────────────────────────────────────────────────────────────────────
  {
    tipo_atividade: 'outros',
    label: 'Outros / Atividade Genérica',
    descricao: 'Template genérico aplicável a atividades não classificadas.',
    risk_items: [
      {
        atividade: 'Atividade Genérica',
        etapa: 'Preparação',
        condicao_perigosa: 'Risco não identificado / situação atípica',
        fonte_circunstancia: 'Desconhecida — análise a ser realizada',
        lesao: 'A definir conforme análise',
        probabilidade: 2,
        severidade: 2,
        hierarquia_controle: AprControlHierarchy.ADMINISTRATIVO,
        medidas_prevencao:
          'Realizar análise detalhada dos riscos antes de iniciar; consultar responsável técnico; emitir PT específica se necessário.',
        responsavel: 'Supervisor da Atividade',
        status_acao: 'Pendente',
      },
    ],
  },
];

/**
 * Retorna o template para o tipo de atividade informado.
 * Retorna o template "outros" se o tipo não for encontrado.
 */
export function findAprActivityTemplate(
  tipoAtividade: string,
): AprActivityTemplate | undefined {
  return APR_ACTIVITY_TEMPLATES.find((t) => t.tipo_atividade === tipoAtividade);
}

/** Retorna todos os tipos de atividade disponíveis no catálogo. */
export function listAprActivityTemplateTypes(): Array<{
  tipo_atividade: string;
  label: string;
  descricao: string;
}> {
  return APR_ACTIVITY_TEMPLATES.map(({ tipo_atividade, label, descricao }) => ({
    tipo_atividade,
    label,
    descricao,
  }));
}
