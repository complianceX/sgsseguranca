import { ChecklistItemValue, ChecklistTopicValue } from './types/checklist-item.type';

export function buildSafetyLanyardTopics(): ChecklistTopicValue[] {
  type SafetyLanyardItemDefinition = {
    subitem: string;
    item: string;
    criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
    bloqueia?: boolean;
    observacaoObrigatoria?: boolean;
    fotoObrigatoria?: boolean;
    acao?: string;
  };

  const createTopicItems = (
    items: SafetyLanyardItemDefinition[],
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
    itens: SafetyLanyardItemDefinition[];
  }> = [
    {
      id: 'safety-lanyard-topic-1',
      titulo: 'Identificação, CA e Documentação',
      ordem: 1,
      itens: [
        {
          subitem: 'Identificação do EPI',
          item: 'Talabarte identificado por marca, modelo, lote, número de série ou código interno',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte até regularização da identificação e rastreabilidade.',
        },
        {
          subitem: 'Certificado de Aprovação',
          item: 'CA do talabarte identificado e controlado pela organização',
          criticidade: 'alto',
          acao: 'Suspender a liberação do EPI até validação documental e controle interno.',
        },
        {
          subitem: 'Manual do fabricante',
          item: 'Manual/instruções do fabricante disponível para consulta',
          criticidade: 'medio',
          acao: 'Disponibilizar imediatamente as instruções do fabricante antes da continuidade do uso.',
        },
        {
          subitem: 'Marcações obrigatórias',
          item: 'Marcações do fabricante e informações do produto legíveis',
          criticidade: 'alto',
          acao: 'Retirar de uso até avaliação da possibilidade de rastreabilidade e substituição do EPI, se necessário.',
        },
        {
          subitem: 'Compatibilidade documentada',
          item: 'Compatibilidade do talabarte com cinturão, conectores e sistema de ancoragem definida',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até validação técnica da compatibilidade do sistema completo.',
        },
        {
          subitem: 'Registro de entrega',
          item: 'Fornecimento do talabarte registrado em sistema, ficha ou documento equivalente',
          criticidade: 'alto',
          acao: 'Regularizar o registro antes da continuidade do uso.',
        },
        {
          subitem: 'Registro de inspeção',
          item: 'Controle de inspeções periódicas do talabarte disponível',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte até execução e registro da inspeção aplicável.',
        },
      ],
    },
    {
      id: 'safety-lanyard-topic-2',
      titulo: 'Tipo, Configuração e Finalidade de Uso',
      ordem: 2,
      itens: [
        {
          subitem: 'Tipo do talabarte',
          item: 'Tipo do talabarte identificado corretamente',
          criticidade: 'alto',
          acao: 'Suspender o uso até identificação correta da finalidade do talabarte.',
        },
        {
          subitem: 'Finalidade correta',
          item: 'Talabarte utilizado apenas para a finalidade para a qual foi projetado',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper imediatamente o uso e substituir pelo equipamento adequado à finalidade.',
        },
        {
          subitem: 'Uso em retenção de queda',
          item: 'Talabarte para retenção de queda é integrado com absorvedor de energia',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte para essa atividade e substituir por conjunto compatível.',
        },
        {
          subitem: 'Uso em posicionamento',
          item: 'Talabarte de posicionamento utilizado apenas para posicionamento, quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper o uso e reconfigurar imediatamente o SPIQ com o componente correto.',
        },
        {
          subitem: 'Configuração do sistema',
          item: 'Configuração do SPIQ compatível com a atividade e com o talabarte selecionado',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade até revisão completa do sistema.',
        },
      ],
    },
    {
      id: 'safety-lanyard-topic-3',
      titulo: 'Condição Geral do Talabarte',
      ordem: 3,
      itens: [
        {
          subitem: 'Integridade geral',
          item: 'Talabarte sem danos aparentes e em condição geral adequada',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente o talabarte e encaminhar para inspeção formal de recusa.',
        },
        {
          subitem: 'Sujidade excessiva',
          item: 'Ausência de sujeira, óleo, graxa, tinta ou contaminantes que prejudiquem o EPI',
          criticidade: 'alto',
          acao: 'Retirar de uso até higienização adequada e reavaliação técnica.',
        },
        {
          subitem: 'Sinais de envelhecimento',
          item: 'Ausência de sinais de envelhecimento prematuro ou degradação do material',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte e encaminhar para descarte controlado se confirmada a degradação.',
        },
        {
          subitem: 'Contaminação química/biológica',
          item: 'Ausência de sinais de contato com agentes químicos, biológicos ou calor excessivo',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Segregar e bloquear imediatamente o talabarte até avaliação técnica e decisão de descarte.',
        },
      ],
    },
    {
      id: 'safety-lanyard-topic-4',
      titulo: 'Fitas, Corda, Cabo e Partes Flexíveis',
      ordem: 4,
      itens: [
        {
          subitem: 'Fitas ou cordas',
          item: 'Fitas, cordas ou elementos flexíveis sem cortes, rasgos, desfiamentos ou abrasão excessiva',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente o talabarte e retirar de circulação.',
        },
        {
          subitem: 'Queimaduras/fusão',
          item: 'Ausência de marcas de queimadura, fusão, soldagem ou calor excessivo',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte e encaminhar para descarte controlado.',
        },
        {
          subitem: 'Costuras',
          item: 'Costuras íntegras, firmes e sem fios rompidos',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte e retirar de uso.',
        },
        {
          subitem: 'Etiquetas',
          item: 'Etiquetas estruturais e de identificação preservadas',
          criticidade: 'alto',
          acao: 'Retirar de uso até avaliação da rastreabilidade e substituição do EPI se necessário.',
        },
        {
          subitem: 'Deformação',
          item: 'Ausência de dobras permanentes, vincos severos ou torções excessivas',
          criticidade: 'alto',
          acao: 'Segregar o talabarte e submeter à inspeção formal antes de qualquer novo uso.',
        },
      ],
    },
    {
      id: 'safety-lanyard-topic-5',
      titulo: 'Absorvedor de Energia',
      ordem: 5,
      itens: [
        {
          subitem: 'Integridade externa',
          item: 'Absorvedor de energia sem rasgos, danos ou violação da embalagem/capa',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente o conjunto e retirar de uso até decisão técnica.',
        },
        {
          subitem: 'Acionamento',
          item: 'Absorvedor de energia sem sinal de abertura ou acionamento prévio',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente e inutilizar o talabarte para descarte controlado, salvo exceção formal do fabricante.',
        },
        {
          subitem: 'Compatibilidade de uso',
          item: 'Absorvedor de energia compatível com a finalidade do talabarte',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Não liberar o conjunto até correção da compatibilidade técnica.',
        },
        {
          subitem: 'Modificação indevida',
          item: 'Ausência de modificações, amarrações ou intervenção no absorvedor',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte e condenar o conjunto para descarte.',
        },
      ],
    },
    {
      id: 'safety-lanyard-topic-6',
      titulo: 'Conectores, Mosquetões e Componentes Metálicos',
      ordem: 6,
      itens: [
        {
          subitem: 'Integridade dos conectores',
          item: 'Conectores íntegros, sem trincas, deformações ou desgaste excessivo',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte e retirar de circulação.',
        },
        {
          subitem: 'Funcionamento das travas',
          item: 'Travas automáticas ou manuais funcionando corretamente',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte até substituição ou descarte do conjunto.',
        },
        {
          subitem: 'Corrosão',
          item: 'Ausência de corrosão crítica em componentes metálicos',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Retirar de uso imediatamente e condenar o componente ou conjunto.',
        },
        {
          subitem: 'Rebarbas e arestas',
          item: 'Ausência de rebarbas, trincas, desgaste ou arestas cortantes',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte e retirar de uso.',
        },
        {
          subitem: 'Carga transversal',
          item: 'Conector sem risco de posicionamento inadequado ou carga transversal',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper a montagem e corrigir imediatamente a conexão com elemento compatível.',
        },
      ],
    },
    {
      id: 'safety-lanyard-topic-7',
      titulo: 'Compatibilidade com Cinturão, Ancoragem e Sistema',
      ordem: 7,
      itens: [
        {
          subitem: 'Engate ao cinturão',
          item: 'Talabarte conectado ao elemento de engate correto do cinturão',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o uso até reconexão correta e validação do sistema.',
        },
        {
          subitem: 'Compatibilidade com ancoragem',
          item: 'Talabarte compatível com o sistema de ancoragem utilizado',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper a atividade e substituir o ponto ou o conector por solução compatível.',
        },
        {
          subitem: 'Compatibilidade entre elementos',
          item: 'Compatibilidade entre talabarte, cinturão, conectores e demais elementos do SPIQ',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade até reconfiguração completa do SPIQ.',
        },
        {
          subitem: 'Extensores/prolongadores',
          item: 'Ausência de conexão indevida com outro talabarte, elemento de ligação ou extensor',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o sistema e desmontar a configuração indevida.',
        },
        {
          subitem: 'Nós e laços',
          item: 'Ausência de nós, laços ou improvisos no talabarte',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte e retirar de uso.',
        },
      ],
    },
    {
      id: 'safety-lanyard-topic-8',
      titulo: 'Posicionamento, Zona Livre e Uso na Atividade',
      ordem: 8,
      itens: [
        {
          subitem: 'Posicionamento do talabarte',
          item: 'Talabarte posicionado de modo a restringir a distância de queda livre',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper a atividade e reposicionar imediatamente o sistema.',
        },
        {
          subitem: 'Colisão com nível inferior',
          item: 'Sistema montado para evitar colisão com estrutura inferior, obstáculo ou solo',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade até redefinição da zona livre e do sistema.',
        },
        {
          subitem: 'Permanência conectado',
          item: 'Trabalhador permanece conectado durante todo o período de exposição ao risco de queda',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper imediatamente a atividade e restabelecer conexão contínua segura.',
        },
        {
          subitem: 'Comprimento adequado',
          item: 'Comprimento do talabarte compatível com a tarefa e com a análise de risco',
          criticidade: 'alto',
          acao: 'Substituir o talabarte ou reconfigurar a atividade antes do uso.',
        },
        {
          subitem: 'Trabalho em estruturas agressivas',
          item: 'Talabarte protegido contra arestas cortantes, abrasão ou superfícies quentes quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a atividade até implantação de proteção ou substituição da solução técnica.',
        },
      ],
    },
    {
      id: 'safety-lanyard-topic-9',
      titulo: 'Inspeção Pré-Uso e Inspeção Periódica',
      ordem: 9,
      itens: [
        {
          subitem: 'Inspeção rotineira',
          item: 'Inspeção realizada antes de cada uso',
          criticidade: 'alto',
          acao: 'Suspender a utilização até realização da inspeção prévia obrigatória.',
        },
        {
          subitem: 'Inspeção periódica',
          item: 'Inspeção periódica realizada dentro do prazo estabelecido',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte até nova inspeção periódica válida.',
        },
        {
          subitem: 'Registro de recusa',
          item: 'Inspeções com recusa do talabarte registradas formalmente',
          criticidade: 'alto',
          acao: 'Formalizar a recusa imediatamente e segregar o EPI.',
        },
        {
          subitem: 'Histórico de queda',
          item: 'Talabarte sem registro de retenção de queda sem tratativa formal',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o talabarte e condená-lo para descarte controlado, salvo exceção formal prevista.',
        },
      ],
    },
    {
      id: 'safety-lanyard-topic-10',
      titulo: 'Treinamento, Orientação e Uso pelo Trabalhador',
      ordem: 10,
      itens: [
        {
          subitem: 'Orientação de uso',
          item: 'Trabalhador orientado quanto ao uso, limitações e inspeção do talabarte',
          criticidade: 'alto',
          acao: 'Impedir o uso até realização de orientação formal.',
        },
        {
          subitem: 'Treinamento de EPI',
          item: 'Treinamento realizado quando as características do EPI exigirem',
          criticidade: 'alto',
          acao: 'Suspender a liberação do EPI até treinamento ou orientação compatível.',
        },
        {
          subitem: 'Uso somente para a finalidade',
          item: 'Trabalhador utiliza o talabarte apenas para a finalidade a que se destina',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper imediatamente o uso inadequado e substituir a solução por sistema correto.',
        },
        {
          subitem: 'Trabalho em altura',
          item: 'Trabalhador autorizado e capacitado para trabalho em altura',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade e substituir o trabalhador até regularização.',
        },
      ],
    },
    {
      id: 'safety-lanyard-topic-11',
      titulo: 'Higienização, Manutenção, Guarda e Transporte',
      ordem: 11,
      itens: [
        {
          subitem: 'Higienização',
          item: 'Talabarte higienizado conforme instruções do fabricante',
          criticidade: 'alto',
          acao: 'Retirar o talabarte de uso até avaliação da integridade e correção do processo.',
        },
        {
          subitem: 'Manutenção periódica',
          item: 'Manutenção periódica realizada quando aplicável',
          criticidade: 'medio',
          acao: 'Regularizar o controle e restringir o uso se houver impacto na segurança do EPI.',
        },
        {
          subitem: 'Guarda',
          item: 'Talabarte armazenado em local seco, limpo, protegido e organizado',
          criticidade: 'alto',
          acao: 'Readequar imediatamente o armazenamento e reinspecionar os talabartes expostos.',
        },
        {
          subitem: 'Transporte',
          item: 'Transporte do talabarte realizado sem causar danos ou contaminação',
          criticidade: 'medio',
          acao: 'Corrigir imediatamente o acondicionamento e reinspecionar o EPI antes do uso.',
        },
      ],
    },
    {
      id: 'safety-lanyard-topic-12',
      titulo: 'Bloqueio, Substituição e Descarte',
      ordem: 12,
      itens: [
        {
          subitem: 'Substituição',
          item: 'EPI substituído imediatamente quando danificado ou extraviado',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Providenciar substituição imediata e impedir continuidade da atividade sem EPI adequado.',
        },
        {
          subitem: 'Bloqueio físico',
          item: 'Talabarte com defeito segregado e identificado como inapto',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Segregar e bloquear imediatamente o talabarte até descarte ou tratativa formal.',
        },
        {
          subitem: 'Impacto de queda',
          item: 'Talabarte que sofreu impacto de queda retirado de uso',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente e inutilizar para descarte controlado, salvo exceção formal prevista pelo fabricante.',
        },
        {
          subitem: 'Descarte controlado',
          item: 'Descarte realizado de forma controlada e registrada',
          criticidade: 'alto',
          acao: 'Inutilizar fisicamente e registrar formalmente o descarte imediatamente.',
        },
      ],
    },
    {
      id: 'safety-lanyard-topic-13',
      titulo: 'Condições da Atividade e Integração com o SPIQ',
      ordem: 13,
      itens: [
        {
          subitem: 'Análise de risco',
          item: 'Análise de risco contempla seleção do SPIQ e do talabarte',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade até revisão formal da análise de risco.',
        },
        {
          subitem: 'Força de impacto',
          item: 'Sistema selecionado para limitar a força de impacto ao trabalhador',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a configuração do SPIQ até adequação técnica do sistema.',
        },
        {
          subitem: 'Zona livre de queda',
          item: 'Sistema adotado considera a zona livre de queda',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper a atividade até reconfiguração técnica compatível com a zona livre disponível.',
        },
        {
          subitem: 'Resgate',
          item: 'Procedimento de emergência e resgate compatível com a atividade',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a atividade até implantação do procedimento de resgate aplicável.',
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
