import { ChecklistItemValue, ChecklistTopicValue } from './types/checklist-item.type';

type MunckItemDefinition = {
  subitem: string;
  item: string;
  criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
  bloqueia?: boolean;
  observacaoObrigatoria?: boolean;
  fotoObrigatoria?: boolean;
  acao?: string;
};

export function buildMunckTruckTopics(): ChecklistTopicValue[] {
  const createTopicItems = (items: MunckItemDefinition[]): ChecklistItemValue[] =>
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
    itens: MunckItemDefinition[];
  }> = [
    {
      id: 'munck-topic-1',
      titulo: 'Documentação, Identificação e Liberação',
      ordem: 1,
      itens: [
        {
          subitem: 'CRLV e regularização',
          item: 'Veículo com documentação regular e apto para circulação e operação interna, quando aplicável',
          criticidade: 'alto',
          acao: 'Regularizar a condição documental antes da mobilização do equipamento.',
        },
        {
          subitem: 'Plano de rigging',
          item: 'Plano de içamento/rigging elaborado e aprovado para operações não rotineiras, críticas ou com interferências',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até emissão e aprovação formal do plano de içamento.',
        },
        {
          subitem: 'Tabela de carga',
          item: 'Tabela/diagrama de carga do fabricante disponível, legível e compatível com o equipamento',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interditar o equipamento até restabelecer o diagrama de carga oficial e legível.',
        },
        {
          subitem: 'Identificação do equipamento',
          item: 'Caminhão munck identificado por frota, patrimônio, placa, fabricante, modelo ou série',
          criticidade: 'alto',
          acao: 'Regularizar a rastreabilidade do equipamento antes da liberação.',
        },
        {
          subitem: 'Manual do fabricante',
          item: 'Manual ou instrução operacional do fabricante disponível para consulta',
          criticidade: 'alto',
          acao: 'Disponibilizar o manual aplicável e orientar a equipe antes da operação.',
        },
        {
          subitem: 'Registro de inspeção',
          item: 'Registros de inspeções periódicas e de manutenção disponíveis e atualizados',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até comprovação da inspeção/manutenção exigida.',
        },
        {
          subitem: 'APR/PT',
          item: 'APR e Permissão de Trabalho emitidas quando exigíveis pela atividade, local ou criticidade',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a atividade até regularização documental da frente de trabalho.',
        },
      ],
    },
    {
      id: 'munck-topic-2',
      titulo: 'Chassi, Estrutura Veicular e Integridade Geral',
      ordem: 2,
      itens: [
        {
          subitem: 'Chassi',
          item: 'Chassi, longarinas e pontos de fixação do guindauto sem trincas, deformações ou reparos improvisados',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Interditar o equipamento e submeter a avaliação estrutural imediata.',
        },
        {
          subitem: 'Fixação do implemento',
          item: 'Implemento munck firmemente fixado ao caminhão, sem folgas aparentes',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear a operação até reaperto, reparo ou reinstalação certificada.',
        },
        {
          subitem: 'Carroceria e apoios',
          item: 'Carroceria, base e estruturas adjacentes sem danos que comprometam a operação',
          criticidade: 'alto',
          fotoObrigatoria: true,
          acao: 'Corrigir a anomalia estrutural antes da liberação.',
        },
        {
          subitem: 'Pneus',
          item: 'Pneus em condição adequada, sem cortes severos, bolhas, lonas expostas ou pressão inadequada',
          criticidade: 'alto',
          fotoObrigatoria: true,
          acao: 'Retirar o veículo de serviço até regularização dos pneus.',
        },
        {
          subitem: 'Rodas e fixações',
          item: 'Porcas, rodas e cubos sem folgas, trincas ou sinais de soltura',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a mobilização e corrigir o conjunto de rodagem imediatamente.',
        },
        {
          subitem: 'Vazamentos gerais',
          item: 'Ausência de vazamentos relevantes de óleo, combustível ou fluido hidráulico',
          criticidade: 'alto',
          fotoObrigatoria: true,
          acao: 'Paralisar a operação, identificar a origem do vazamento e reparar antes do uso.',
        },
        {
          subitem: 'Limpeza e organização',
          item: 'Equipamento limpo, sem acúmulo excessivo de resíduos que ocultem defeitos ou gerem risco',
          criticidade: 'medio',
          acao: 'Executar limpeza segura e reinspecionar o equipamento.',
        },
      ],
    },
    {
      id: 'munck-topic-3',
      titulo: 'Patolas, Estabilizadores e Nivelamento',
      ordem: 3,
      itens: [
        {
          subitem: 'Patolas',
          item: 'Patolas/estabilizadores íntegros, sem trincas, amassamentos, empenos ou vazamentos',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Interditar imediatamente o equipamento até reparo e reinspeção.',
        },
        {
          subitem: 'Curso e travamento',
          item: 'Estabilizadores estendem, retraem e travam corretamente',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até correção e teste funcional completo.',
        },
        {
          subitem: 'Sapatas',
          item: 'Sapatas dos estabilizadores em bom estado, com área de apoio compatível e sem improvisos inseguros',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a operação até adequação das bases de apoio.',
        },
        {
          subitem: 'Calços e pranchas',
          item: 'Pranchas/calços de apoio disponíveis e adequados ao solo e à carga da operação',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Impedir o içamento até instalação correta dos apoios necessários.',
        },
        {
          subitem: 'Nivelamento',
          item: 'Veículo nivelado dentro do limite permitido pelo fabricante para operação',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Reposicionar e renivelar o caminhão antes de iniciar a operação.',
        },
        {
          subitem: 'Solo de apoio',
          item: 'Solo/base sem risco de recalque, afundamento, deslizamento ou colapso sob as patolas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a operação e redefinir a base de apoio com validação técnica.',
        },
        {
          subitem: 'Interferências na patolagem',
          item: 'Área de patolamento livre de tubulações, galerias, caixas, tampas frágeis e interferências ocultas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até validação do solo e eliminação das interferências.',
        },
      ],
    },
    {
      id: 'munck-topic-4',
      titulo: 'Sistema Hidráulico e Energia de Potência',
      ordem: 4,
      itens: [
        {
          subitem: 'Mangueiras',
          item: 'Mangueiras hidráulicas sem rachaduras, ressecamento, bolhas, abrasão excessiva ou vazamentos',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Paralisar o equipamento e substituir as mangueiras danificadas imediatamente.',
        },
        {
          subitem: 'Conexões',
          item: 'Conexões, terminais e engates hidráulicos firmes e sem vazamentos',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até eliminação do vazamento e reaperto técnico.',
        },
        {
          subitem: 'Cilindros',
          item: 'Cilindros hidráulicos sem vazamentos, empenos ou danos nas hastes',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Interditar o equipamento até reparo ou substituição do cilindro.',
        },
        {
          subitem: 'Reservatório',
          item: 'Nível e condição do óleo hidráulico adequados, sem contaminação aparente',
          criticidade: 'alto',
          acao: 'Regularizar o fluido e investigar a causa antes da liberação.',
        },
        {
          subitem: 'Bomba hidráulica',
          item: 'Bomba hidráulica operando sem ruído anormal, vibração excessiva ou falha de resposta',
          criticidade: 'alto',
          acao: 'Encaminhar para diagnóstico técnico antes do uso contínuo.',
        },
        {
          subitem: 'Tomada de força',
          item: 'Tomada de força (PTO) acionando e desacoplando corretamente',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até correção do acionamento da PTO.',
        },
      ],
    },
    {
      id: 'munck-topic-5',
      titulo: 'Lança, Giro e Estrutura do Guindauto',
      ordem: 5,
      itens: [
        {
          subitem: 'Lança principal',
          item: 'Lança sem trincas, corrosão severa, amassamentos ou deformações estruturais',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Interditar imediatamente o equipamento e solicitar inspeção estrutural.',
        },
        {
          subitem: 'Extensões telescópicas',
          item: 'Extensões telescópicas operam suavemente e sem travamentos indevidos',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até ajuste e reteste funcional.',
        },
        {
          subitem: 'Pinos e articulações',
          item: 'Pinos, buchas e articulações sem folga excessiva, desgaste crítico ou ausência de travas',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Retirar de operação até substituição ou recuperação dos componentes.',
        },
        {
          subitem: 'Sistema de giro',
          item: 'Sistema de giro da coluna/torre funcionando sem ruídos anormais, travamentos ou solavancos',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Paralisar o equipamento e encaminhar para inspeção técnica do giro.',
        },
        {
          subitem: 'Limitadores mecânicos',
          item: 'Limitadores de curso e batentes estão íntegros e funcionais',
          criticidade: 'alto',
          acao: 'Regularizar os limitadores antes da operação.',
        },
        {
          subitem: 'Lubrificação',
          item: 'Pontos de lubrificação da lança e articulações atendidos conforme rotina de manutenção',
          criticidade: 'medio',
          acao: 'Executar a lubrificação prevista e reinspecionar o conjunto.',
        },
      ],
    },
    {
      id: 'munck-topic-6',
      titulo: 'Cabos, Ganchos, Moitão e Acessórios de Içamento',
      ordem: 6,
      itens: [
        {
          subitem: 'Cabo de aço',
          item: 'Cabo de aço sem pernas rompidas excessivas, amassamentos, corrosão severa, nós ou esmagamentos',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Interditar imediatamente o equipamento até substituição do cabo.',
        },
        {
          subitem: 'Enrolamento no tambor',
          item: 'Cabo enrolado corretamente no tambor, sem sobreposição desordenada ou risco de mordedura',
          criticidade: 'alto',
          acao: 'Corrigir o enrolamento e reinspecionar antes da operação.',
        },
        {
          subitem: 'Gancho',
          item: 'Gancho sem abertura excessiva, trincas, deformações ou desgaste crítico',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear a operação e substituir o gancho imediatamente.',
        },
        {
          subitem: 'Trava de segurança do gancho',
          item: 'Trava de segurança do gancho íntegra e funcional',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Impedir qualquer içamento até restabelecer a trava do gancho.',
        },
        {
          subitem: 'Moitão e roldanas',
          item: 'Moitão, polias e roldanas em bom estado, sem trincas, desgaste anormal ou travamento',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interditar o conjunto de içamento até reparo.',
        },
        {
          subitem: 'Cintas, correntes e manilhas',
          item: 'Acessórios de içamento inspecionados, identificados e compatíveis com a carga',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até substituição ou validação dos acessórios.',
        },
        {
          subitem: 'Tag de capacidade',
          item: 'Cintas, correntes e acessórios possuem identificação legível de capacidade e rastreabilidade',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Retirar o acessório de uso até comprovação formal da capacidade nominal.',
        },
      ],
    },
    {
      id: 'munck-topic-7',
      titulo: 'Comandos, Instrumentação e Dispositivos de Segurança',
      ordem: 7,
      itens: [
        {
          subitem: 'Comandos operacionais',
          item: 'Alavancas, válvulas e comandos respondem corretamente, sem travar ou apresentar retorno irregular',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até reparo e teste funcional completo.',
        },
        {
          subitem: 'Parada de emergência',
          item: 'Botão/dispositivo de parada de emergência disponível e funcionando quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interditar o equipamento até restabelecer o dispositivo de emergência.',
        },
        {
          subitem: 'Limitador de carga/momento',
          item: 'Dispositivo limitador de carga, momento ou proteção equivalente funcional e sem bypass indevido',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o guindauto imediatamente até correção e validação do limitador.',
        },
        {
          subitem: 'Indicadores',
          item: 'Indicadores de operação, ângulo, alcance ou condição do sistema estão legíveis e funcionando',
          criticidade: 'alto',
          acao: 'Corrigir a instrumentação antes do uso em operação crítica.',
        },
        {
          subitem: 'Alarme sonoro/visual',
          item: 'Alarmes sonoros e visuais do equipamento estão operantes',
          criticidade: 'alto',
          acao: 'Regularizar os dispositivos de alerta antes da liberação.',
        },
        {
          subitem: 'Bypass e improvisos',
          item: 'Ausência de jumpers, travas improvisadas ou neutralização de sistemas de segurança',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interditar imediatamente o equipamento e restaurar a configuração segura original.',
        },
      ],
    },
    {
      id: 'munck-topic-8',
      titulo: 'Operador, Sinaleiro e Equipe de Içamento',
      ordem: 8,
      itens: [
        {
          subitem: 'Capacitação do operador',
          item: 'Operador capacitado e habilitado para operação do caminhão munck conforme exigência interna e legal',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Impedir a operação até regularização formal da capacitação do operador.',
        },
        {
          subitem: 'Autorização formal',
          item: 'Operador formalmente autorizado pela empresa para esta atividade/equipamento',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até emissão ou renovação da autorização formal.',
        },
        {
          subitem: 'Sinaleiro',
          item: 'Sinaleiro designado, capacitado e alinhado com o operador quanto aos sinais de comunicação',
          criticidade: 'alto',
          acao: 'Definir sinaleiro competente e realizar alinhamento operacional antes do içamento.',
        },
        {
          subitem: 'Amarrador/rigger',
          item: 'Amarração da carga executada por profissional competente ou sob supervisão adequada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender o içamento até designação correta da equipe de amarração.',
        },
        {
          subitem: 'Aptidão e condição física',
          item: 'Equipe em condição física e ocupacional compatível com a atividade crítica',
          criticidade: 'alto',
          acao: 'Reavaliar a composição da equipe antes do início da atividade.',
        },
        {
          subitem: 'Briefing operacional',
          item: 'Equipe participou de briefing com riscos, sequência, exclusão de área e resposta a emergências',
          criticidade: 'alto',
          acao: 'Realizar briefing formal antes do início da operação.',
        },
      ],
    },
    {
      id: 'munck-topic-9',
      titulo: 'Área de Operação, Isolamento e Interferências',
      ordem: 9,
      itens: [
        {
          subitem: 'Isolamento da área',
          item: 'Área de operação e raio de giro/queda da carga estão isolados e sinalizados',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até isolamento integral da zona de risco.',
        },
        {
          subitem: 'Controle de acesso',
          item: 'Somente pessoas autorizadas permanecem dentro da área controlada',
          criticidade: 'alto',
          acao: 'Retirar pessoas não autorizadas e reforçar o controle de acesso.',
        },
        {
          subitem: 'Interferências aéreas',
          item: 'Trajeto da lança e da carga livre de interferências com estruturas, tubulações, andaimes e edificações',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Redefinir posicionamento e trajetória antes do içamento.',
        },
        {
          subitem: 'Visibilidade',
          item: 'Operador possui visibilidade adequada da carga e da área, ou conta com apoio seguro de sinaleiro',
          criticidade: 'alto',
          acao: 'Suspender a operação até restabelecer controle visual adequado.',
        },
        {
          subitem: 'Condições climáticas',
          item: 'Vento, chuva, descargas atmosféricas e demais condições climáticas estão dentro de limites seguros',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender imediatamente a operação em condição climática insegura.',
        },
        {
          subitem: 'Iluminação',
          item: 'Iluminação adequada para içamento, movimentação e amarração da carga',
          criticidade: 'alto',
          acao: 'Complementar iluminação ou adiar a operação.',
        },
      ],
    },
    {
      id: 'munck-topic-10',
      titulo: 'Risco Elétrico e Proximidade de Redes Energizadas',
      ordem: 10,
      itens: [
        {
          subitem: 'Distanciamento mínimo',
          item: 'Distância de segurança de redes elétricas energizadas respeitada conforme tensão e procedimento aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade imediatamente e redefinir o método com controle elétrico formal.',
        },
        {
          subitem: 'Análise elétrica específica',
          item: 'Existe análise específica para operação próxima a rede elétrica quando aplicável',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender o içamento até emissão da análise e controles elétricos.',
        },
        {
          subitem: 'Desenergização/proteção',
          item: 'Rede desenergizada, isolada ou controlada formalmente quando exigido pelo cenário',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Impedir o início até implementação da proteção elétrica definida.',
        },
        {
          subitem: 'Sinalização de risco elétrico',
          item: 'Sinalização e barreiras de risco elétrico implantadas quando necessárias',
          criticidade: 'alto',
          acao: 'Implantar sinalização e barreiras antes da liberação.',
        },
        {
          subitem: 'Observador dedicado',
          item: 'Há apoio de observador/sinaleiro dedicado quando a proximidade com rede elétrica exige vigilância permanente',
          criticidade: 'alto',
          acao: 'Designar observador dedicado antes da operação.',
        },
      ],
    },
    {
      id: 'munck-topic-11',
      titulo: 'Carga, Amarração e Regras de Içamento',
      ordem: 11,
      itens: [
        {
          subitem: 'Peso da carga',
          item: 'Peso estimado/real da carga conhecido e compatível com raio, ângulo e diagrama de carga',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o içamento até validação do peso e do enquadramento no diagrama.',
        },
        {
          subitem: 'Centro de gravidade',
          item: 'Centro de gravidade conhecido ou adequadamente considerado para evitar tombamento/rotação inesperada',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Replanejar a amarração e o método antes do içamento.',
        },
        {
          subitem: 'Pontos de pega',
          item: 'Pontos de pega e amarração da carga são adequados e estruturalmente seguros',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Proibir o içamento até definição de pontos de pega seguros.',
        },
        {
          subitem: 'Amarração',
          item: 'Cintas, correntes e manilhas estão configuradas corretamente, sem torções ou ângulos inseguros',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Refazer a amarração antes de elevar a carga.',
        },
        {
          subitem: 'Carga suspensa',
          item: 'Não há pessoas sob carga suspensa ou em trajetória de queda potencial',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper imediatamente a manobra e retirar todas as pessoas da zona de risco.',
        },
        {
          subitem: 'Movimentos suaves',
          item: 'Elevação, giro e posicionamento da carga são executados de forma suave e controlada',
          criticidade: 'alto',
          acao: 'Reinstruir o operador e revisar a técnica de manobra antes de prosseguir.',
        },
        {
          subitem: 'Uso indevido',
          item: 'Equipamento não está sendo usado para arraste, arrancamento lateral, impacto ou esforço fora da finalidade',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender imediatamente a operação e adequar o método executivo.',
        },
      ],
    },
    {
      id: 'munck-topic-12',
      titulo: 'Inspeção Pré-Uso, Manutenção e Bloqueio',
      ordem: 12,
      itens: [
        {
          subitem: 'Inspeção diária',
          item: 'Inspeção pré-uso realizada antes do início do turno/operação',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a operação até realização da inspeção pré-uso formal.',
        },
        {
          subitem: 'Checklist preenchido',
          item: 'Checklist de inspeção preenchido e registrado com rastreabilidade',
          criticidade: 'alto',
          acao: 'Exigir o registro formal antes da liberação.',
        },
        {
          subitem: 'Defeitos comunicados',
          item: 'Defeitos identificados são comunicados e tratados antes da liberação do equipamento',
          criticidade: 'alto',
          acao: 'Registrar a anomalia e impedir uso até tratamento adequado.',
        },
        {
          subitem: 'Bloqueio por defeito',
          item: 'Equipamento é bloqueado/interditado quando apresenta condição insegura',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Aplicar bloqueio físico e identificação de interdição imediatamente.',
        },
        {
          subitem: 'Manutenção preventiva',
          item: 'Plano de manutenção preventiva está vigente e aderente ao fabricante',
          criticidade: 'alto',
          acao: 'Regularizar a manutenção preventiva antes da próxima operação crítica.',
        },
        {
          subitem: 'Teste pós-manutenção',
          item: 'Após manutenção, o equipamento foi testado e liberado formalmente',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Não operar até conclusão do teste pós-manutenção e registro da liberação.',
        },
      ],
    },
    {
      id: 'munck-topic-13',
      titulo: 'EPI, EPC e Resposta a Emergências',
      ordem: 13,
      itens: [
        {
          subitem: 'Capacete e jugular',
          item: 'Equipe utiliza capacete com jugular e demais EPIs definidos na análise de risco',
          criticidade: 'alto',
          acao: 'Impedir acesso à área até adequação dos EPIs obrigatórios.',
        },
        {
          subitem: 'Luvas e calçados',
          item: 'Equipe utiliza luvas, calçados e proteção compatíveis com a atividade de içamento e amarração',
          criticidade: 'alto',
          acao: 'Substituir ou complementar os EPIs antes do início da atividade.',
        },
        {
          subitem: 'Colete e identificação',
          item: 'Equipe de apoio e sinaleiro estão identificados visualmente quando necessário',
          criticidade: 'medio',
          acao: 'Regularizar a identificação operacional da equipe de apoio.',
        },
        {
          subitem: 'Cordas guia',
          item: 'Cordas guia/tag lines disponíveis e utilizadas quando necessárias para controle da carga',
          criticidade: 'alto',
          acao: 'Disponibilizar e aplicar controle auxiliar da carga antes da manobra.',
        },
        {
          subitem: 'Extintor e kit de emergência',
          item: 'Veículo possui extintor e recursos de resposta a emergência em condição de uso, quando exigido',
          criticidade: 'alto',
          acao: 'Regularizar os recursos de emergência antes da mobilização.',
        },
        {
          subitem: 'Plano de emergência',
          item: 'Equipe conhece procedimento de resposta a tombamento, queda de carga, contato elétrico e vazamento',
          criticidade: 'alto',
          acao: 'Realizar alinhamento emergencial antes do início da atividade.',
        },
      ],
    },
    {
      id: 'munck-topic-14',
      titulo: 'Finalização, Recolhimento e Pós-Uso',
      ordem: 14,
      itens: [
        {
          subitem: 'Recolhimento da lança',
          item: 'Lança recolhida, travada e acondicionada corretamente ao final da operação',
          criticidade: 'alto',
          acao: 'Executar o recolhimento seguro e reforçar o procedimento de encerramento.',
        },
        {
          subitem: 'Patolas recolhidas',
          item: 'Patolas recolhidas e travadas adequadamente antes da movimentação do veículo',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a movimentação do caminhão até recolhimento/travamento completo das patolas.',
        },
        {
          subitem: 'PTO desligada',
          item: 'Tomada de força desacoplada e controles retornados à condição segura',
          criticidade: 'alto',
          acao: 'Desacoplar a PTO e validar a condição segura antes do deslocamento.',
        },
        {
          subitem: 'Acessórios recolhidos',
          item: 'Acessórios de içamento guardados e inspecionados após o uso',
          criticidade: 'medio',
          acao: 'Acondicionar corretamente os acessórios e registrar danos observados.',
        },
        {
          subitem: 'Anomalias registradas',
          item: 'Falhas, danos e não conformidades observados no pós-uso foram registrados e comunicados',
          criticidade: 'alto',
          acao: 'Abrir registro formal e avaliar necessidade de bloqueio do equipamento.',
        },
        {
          subitem: 'Área liberada',
          item: 'Área foi deixada em condição segura, limpa e sem materiais remanescentes da operação',
          criticidade: 'medio',
          acao: 'Regularizar a frente de trabalho antes do encerramento definitivo.',
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
