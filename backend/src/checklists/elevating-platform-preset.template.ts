import {
  ChecklistItemValue,
  ChecklistTopicValue,
} from './types/checklist-item.type';

/**
 * Checklist genérico de Plataforma Elevatória (PEMP/PEMT/MEWP).
 * Foco: inspeção pré-uso, liberação, operação segura, emergências e pós-uso.
 *
 * Observação:
 * - Itens são "sim/nao/na" para permitir adaptação por tipo de equipamento (tesoura, articulada, telescópica, mastro).
 * - Criticidade + bloqueio em não conformidades que inviabilizam operação segura.
 */
export function buildElevatingPlatformTopics(): ChecklistTopicValue[] {
  type ElevatingPlatformItemDefinition = {
    subitem: string;
    item: string;
    criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
    bloqueia?: boolean;
    observacaoObrigatoria?: boolean;
    fotoObrigatoria?: boolean;
    acao?: string;
  };

  const createTopicItems = (
    items: ElevatingPlatformItemDefinition[],
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
    itens: ElevatingPlatformItemDefinition[];
  }> = [
    {
      id: 'elevating-platform-topic-1',
      titulo: 'Identificacao, Documentacao e Liberacao',
      ordem: 1,
      itens: [
        {
          subitem: 'Identificacao',
          item: 'Placa/etiqueta do fabricante legivel (marca, modelo, serie/patrimonio)',
          criticidade: 'alto',
          acao:
            'Regularizar identificacao fisica e rastreabilidade do equipamento antes do uso.',
        },
        {
          subitem: 'Capacidade',
          item: 'Capacidade nominal e limitacoes de carga legiveis no equipamento',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao:
            'Bloquear imediatamente ate recompor informacao de capacidade nominal e validar com fabricante/locadora.',
        },
        {
          subitem: 'Diagramas',
          item: 'Diagramas/adesivos de seguranca legiveis (alcance, inclinacao, avisos e proibicoes)',
          criticidade: 'alto',
          fotoObrigatoria: true,
          acao:
            'Substituir/regularizar sinalizacoes obrigatorias antes da liberacao.',
        },
        {
          subitem: 'Manual',
          item: 'Manual do fabricante acessivel para consulta (impresso/digital) e aplicavel ao modelo',
          criticidade: 'alto',
          acao:
            'Disponibilizar manual atualizado e orientar equipe antes da operacao.',
        },
        {
          subitem: 'Inspecao periodica',
          item: 'Registro/etiqueta de inspecao periodica valido e atualizado',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Manter bloqueado ate execucao e aprovacao de inspecao periodica por responsavel qualificado.',
        },
        {
          subitem: 'Manutencao',
          item: 'Historico de manutencao preventiva/corretiva disponivel e atualizado (locadora/frota)',
          criticidade: 'medio',
          acao:
            'Atualizar rastreabilidade de manutencao e reavaliar condicao de liberacao.',
        },
        {
          subitem: 'Operador',
          item: 'Operador treinado/qualificado e formalmente autorizado para operar plataforma elevatoria',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear a operacao ate substituicao por operador qualificado e autorizado.',
        },
        {
          subitem: 'Aptidao',
          item: 'Operador com ASO/apto para funcao e condicao compativel com trabalho em altura quando aplicavel',
          criticidade: 'alto',
          acao:
            'Impedir a operacao para operador nao apto e comunicar SESMT/gestao.',
        },
        {
          subitem: 'AR/PT',
          item: 'Analise de risco e permissao de trabalho emitidas quando exigivel (altura, eletricidade, area critica)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Suspender a atividade e emitir AR/PT conforme procedimento antes do inicio.',
        },
      ],
    },
    {
      id: 'elevating-platform-topic-2',
      titulo: 'Condicoes do Local e Planejamento da Operacao',
      ordem: 2,
      itens: [
        {
          subitem: 'Isolamento',
          item: 'Area de operacao isolada e sinalizada (risco de queda de objetos e atropelamento)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Isolar e sinalizar a area antes de iniciar qualquer movimentacao do equipamento.',
        },
        {
          subitem: 'Solo',
          item: 'Solo firme, nivelado e sem risco de afundamento (valas, tampas, grelhas, buracos, bordas)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear a operacao e adequar o piso/base (placas de apoio, nivelamento, alternativa de acesso).',
        },
        {
          subitem: 'Inclinacao',
          item: 'Inclinacao do local dentro do limite do fabricante (considerar rampa, irregularidades e obstaculos)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Reposicionar o equipamento em area nivelada ou utilizar solucao alternativa.',
        },
        {
          subitem: 'Interferencias',
          item: 'Interferencias superiores e laterais mapeadas (estruturas, vigas, coberturas, tubulacoes, passarelas)',
          criticidade: 'alto',
          acao:
            'Replanejar rota/posicionamento e designar observador quando necessario.',
        },
        {
          subitem: 'Rede eletrica',
          item: 'Distancia segura de rede eletrica/energizados garantida e controlada (procedimento NR-10 quando aplicavel)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear a operacao e implementar controles de aproximacao (desenergizacao, distanciamento, barreiras, vigia).',
        },
        {
          subitem: 'Clima',
          item: 'Condicoes climaticas permitidas (vento/chuva/raios) conforme limite do fabricante e procedimento',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Suspender operacao em condicao impeditiva e retomar apenas com condicao segura.',
        },
        {
          subitem: 'Circulacao',
          item: 'Rotas de circulacao definidas e livres (pedestres, veiculos, empilhadeiras) com controle de trafego',
          criticidade: 'alto',
          acao:
            'Definir rota e controle de trafego antes de movimentar a plataforma.',
        },
        {
          subitem: 'Iluminacao',
          item: 'Iluminacao adequada para inspecao e operacao (sem pontos cegos na area de manobra)',
          criticidade: 'medio',
          acao:
            'Providenciar iluminacao complementar antes da liberacao.',
        },
      ],
    },
    {
      id: 'elevating-platform-topic-3',
      titulo: 'Estrutura, Cesto/Plataforma e Protecoes Coletivas',
      ordem: 3,
      itens: [
        {
          subitem: 'Estrutura',
          item: 'Estrutura (chassi, bracos/tesoura/mastro) sem trincas, deformacoes, soldas rompidas ou corrosao critica',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao:
            'Bloquear imediatamente e encaminhar para avaliacao tecnica/locadora.',
        },
        {
          subitem: 'Cesto/plataforma',
          item: 'Cesto/plataforma com piso integro, antiderrapante e sem falhas estruturais',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao:
            'Bloquear o equipamento ate reparo/reinspecao do cesto/plataforma.',
        },
        {
          subitem: 'Guarda-corpo',
          item: 'Guarda-corpo completo e firme (corrimao superior/intermediario e rodape quando aplicavel)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear imediatamente ate recomposicao/aperto das protecoes coletivas.',
        },
        {
          subitem: 'Portao',
          item: 'Portao de acesso fecha e trava corretamente (intertravamento quando existente)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear ate ajuste do portao/trava/intertravamento e reinspecao funcional.',
        },
        {
          subitem: 'Ponto de ancoragem',
          item: 'Ponto(s) de ancoragem no cesto identificados e em condicao (para talabarte/cinto quando aplicavel)',
          criticidade: 'alto',
          acao:
            'Regularizar identificacao e condicao do ponto de ancoragem ou definir alternativa segura.',
        },
        {
          subitem: 'Protecao anti-esmagamento',
          item: 'Dispositivos anti-esmagamento/anti-entalamento (quando existentes) integres e funcionais',
          criticidade: 'alto',
          acao:
            'Ajustar/manter dispositivo e instruir operador sobre risco de esmagamento.',
        },
        {
          subitem: 'Degraus/acesso',
          item: 'Degraus, apoio e pontos de pega em bom estado (sem risco de escorregamento)',
          criticidade: 'medio',
          acao:
            'Corrigir acesso seguro (limpeza, substituicao, reparo) antes da liberacao.',
        },
        {
          subitem: 'Objetos soltos',
          item: 'Sem ferramentas/objetos soltos no cesto sem amarracao/organizacao (queda de objetos)',
          criticidade: 'alto',
          acao:
            'Organizar e amarrar ferramentas, instalar bolsa/porta-ferramentas conforme procedimento.',
        },
      ],
    },
    {
      id: 'elevating-platform-topic-4',
      titulo: 'Sistema Hidraulico e Vazamentos',
      ordem: 4,
      itens: [
        {
          subitem: 'Mangueiras',
          item: 'Mangueiras e conexoes sem vazamentos, bolhas, trincas ou abrasao',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao:
            'Bloquear imediatamente e substituir/reparar linha hidraulica antes do uso.',
        },
        {
          subitem: 'Cilindros',
          item: 'Cilindros e vedacoes sem vazamento aparente e sem danos',
          criticidade: 'alto',
          acao:
            'Retirar de operacao e acionar manutencao/locadora para correcao.',
        },
        {
          subitem: 'Nivel de oleo',
          item: 'Nivel/condicao do oleo hidraulico conforme especificacao (sem contaminacao evidente)',
          criticidade: 'alto',
          acao:
            'Completar/substituir oleo conforme manual e investigar origem de perda/contaminacao.',
        },
        {
          subitem: 'Travas/pinos',
          item: 'Pinos, travas e pontos de articulacao lubrificados e sem folgas anormais',
          criticidade: 'medio',
          acao:
            'Lubrificar/ajustar e monitorar conforme rotina de manutencao.',
        },
        {
          subitem: 'Limpeza',
          item: 'Ausencia de oleo no piso/rodagem que gere risco de escorregamento/derrapagem',
          criticidade: 'alto',
          acao:
            'Conter e limpar imediatamente, aplicar material absorvente e investigar vazamento.',
        },
      ],
    },
    {
      id: 'elevating-platform-topic-5',
      titulo: 'Sistema Eletrico, Energia e Carregamento',
      ordem: 5,
      itens: [
        {
          subitem: 'Bateria/energia',
          item: 'Nivel de carga/energia suficiente para o turno e indicador funcional (quando aplicavel)',
          criticidade: 'medio',
          acao:
            'Programar recarga/abastecimento antes do uso ou ajustar plano operacional.',
        },
        {
          subitem: 'Cabos',
          item: 'Cabos, conectores e chicotes sem danos, emendas ou aquecimento anormal',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao:
            'Bloquear imediatamente e corrigir instalacao eletrica antes da operacao.',
        },
        {
          subitem: 'Bornes',
          item: 'Bornes protegidos e bem fixados, sem oxidacao critica (bateria)',
          criticidade: 'alto',
          acao:
            'Apertar/limpar bornes e substituir componentes danificados antes da liberacao.',
        },
        {
          subitem: 'Carregador',
          item: 'Carregador/cabo de recarga em bom estado e com protecao adequada (quando aplicavel)',
          criticidade: 'alto',
          acao:
            'Substituir cabo/carregador danificado e garantir protecao eletrica conforme procedimento.',
        },
        {
          subitem: 'Combustivel (se aplicavel)',
          item: 'Sem vazamentos de combustivel e tampas/linhas em bom estado (equipamento a combustao)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear imediatamente, conter vazamento e acionar manutencao antes do uso.',
        },
        {
          subitem: 'Extintor (se aplicavel)',
          item: 'Extintor/recursos de combate a incendio disponiveis e validos conforme procedimento (quando aplicavel)',
          criticidade: 'alto',
          acao:
            'Regularizar extintor/recursos antes da operacao em area com risco.',
        },
      ],
    },
    {
      id: 'elevating-platform-topic-6',
      titulo: 'Rodagem, Tracao, Direcao e Freios',
      ordem: 6,
      itens: [
        {
          subitem: 'Pneus/rodas',
          item: 'Pneus/rodas em bom estado (pressao, cortes, parafusos/porcas, travas)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear imediatamente e corrigir condicao de rodagem antes do uso.',
        },
        {
          subitem: 'Freio de estacionamento',
          item: 'Freio de estacionamento funcional e segura o equipamento em repouso',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear imediatamente e acionar manutencao/locadora.',
        },
        {
          subitem: 'Freio de servico',
          item: 'Freio de servico responde adequadamente durante teste funcional (quando aplicavel)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear e reparar sistema de freios antes de movimentacao em qualquer area.',
        },
        {
          subitem: 'Direcao',
          item: 'Direcao responde sem travamentos e retorna conforme esperado',
          criticidade: 'alto',
          acao:
            'Suspender uso ate avaliacao do sistema de direcao se houver anomalia.',
        },
        {
          subitem: 'Alarmes de movimento',
          item: 'Alarme/buzina de movimentacao funcional (quando existente)',
          criticidade: 'medio',
          acao:
            'Reparar alarme e reforcar isolamento/observador ate regularizacao.',
        },
        {
          subitem: 'Calcos',
          item: 'Calcos disponiveis e aplicados quando necessario para imobilizacao (quando aplicavel)',
          criticidade: 'medio',
          acao:
            'Providenciar calcos e orientar equipe sobre uso conforme condicao do piso.',
        },
      ],
    },
    {
      id: 'elevating-platform-topic-7',
      titulo: 'Estabilizadores, Patolas e Nivelamento (quando aplicavel)',
      ordem: 7,
      itens: [
        {
          subitem: 'Patolas',
          item: 'Patolas/estabilizadores sem deformacoes e com sapatas em bom estado',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear ate reparo/substituicao e reinspecao das patolas.',
        },
        {
          subitem: 'Travas',
          item: 'Travas/pinos de seguranca presentes e funcionais (quando aplicavel)',
          criticidade: 'alto',
          acao:
            'Recompor travas/pinos e reinspecionar antes da liberacao.',
        },
        {
          subitem: 'Placas de apoio',
          item: 'Placas/base de apoio usadas quando necessario (solo fragil, distribucao de carga)',
          criticidade: 'alto',
          acao:
            'Aplicar placas adequadas conforme manual e condicao do piso.',
        },
        {
          subitem: 'Nivelamento',
          item: 'Indicador de nivelamento funcional e operacao dentro do limite (quando existente)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear operacao ate garantir nivelamento e funcionamento do indicador/sensores.',
        },
        {
          subitem: 'Intertravamentos',
          item: 'Intertravamentos de patolas/nivelamento atuam corretamente (impedem elevacao em condicao insegura)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear e reparar intertravamentos antes de liberar o equipamento.',
        },
      ],
    },
    {
      id: 'elevating-platform-topic-8',
      titulo: 'Comandos, Controles e Teste Funcional',
      ordem: 8,
      itens: [
        {
          subitem: 'Controle no solo',
          item: 'Painel de controle no solo funcional (habilita/desabilita e controla movimentos)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear ate restabelecer controle no solo para resgate/operacao segura.',
        },
        {
          subitem: 'Controle no cesto',
          item: 'Comandos no cesto funcionais, identificados e sem travamentos',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear ate reparo do sistema de comando e reinspecao funcional.',
        },
        {
          subitem: 'Parada de emergencia',
          item: 'Botao(s) de parada de emergencia funcionam (solo e cesto) e interrompem movimentos',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear imediatamente e reparar o circuito de emergencia.',
        },
        {
          subitem: 'Descida de emergencia',
          item: 'Sistema de descida/retorno de emergencia funcional (valvula, bomba manual, procedimento)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear ate validar descida de emergencia e treinar equipe de apoio.',
        },
        {
          subitem: 'Seletor de controle',
          item: 'Seletor solo/cesto e chaves de habilitacao funcionais (sem mau contato)',
          criticidade: 'alto',
          acao:
            'Corrigir seletor/chave e testar antes da liberacao.',
        },
        {
          subitem: 'Movimentos',
          item: 'Teste funcional dos movimentos (subir/descer, girar, estender, deslocar) sem trancos/anomalias',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear e acionar manutencao/locadora para diagnostico.',
        },
        {
          subitem: 'Indicadores',
          item: 'Indicadores e avisos do painel funcionais (bateria, inclinacao, sobrecarga, falhas)',
          criticidade: 'alto',
          acao:
            'Regularizar indicadores/diagnostico; se indicador de seguranca estiver inoperante, bloquear.',
          observacaoObrigatoria: true,
        },
        {
          subitem: 'Buzina/comunicacao',
          item: 'Buzina/alerta de comunicacao funcional e audivel',
          criticidade: 'medio',
          acao:
            'Reparar buzina/alerta e reforcar comunicacao por radio/observador ate regularizacao.',
        },
      ],
    },
    {
      id: 'elevating-platform-topic-9',
      titulo: 'Dispositivos de Seguranca (limitadores e sensores)',
      ordem: 9,
      itens: [
        {
          subitem: 'Limitador de carga',
          item: 'Limitador de carga/sobrecarga funcional e impede operacao acima do limite (quando aplicavel)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear ate reparo e teste do limitador de carga/sobrecarga.',
        },
        {
          subitem: 'Sensor de inclinacao',
          item: 'Alarme/sensor de inclinacao funcional (aciona alerta/corte conforme fabricante)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear imediatamente ate validar sensor de inclinacao e intertravamentos.',
        },
        {
          subitem: 'Protecao de buraco (tesoura)',
          item: 'Protecao anti-buraco/pothole protection funcional (plataformas tesoura quando aplicavel)',
          criticidade: 'alto',
          acao:
            'Bloquear ou restringir operacao conforme manual ate regularizacao do sistema.',
        },
        {
          subitem: 'Velocidade/altura',
          item: 'Limitacoes de velocidade/altura e intertravamentos atuam corretamente (quando aplicavel)',
          criticidade: 'alto',
          acao:
            'Ajustar/reparar limitacoes e reinspecionar antes de liberar.',
        },
        {
          subitem: 'Sinais sonoros/visuais',
          item: 'Sinais sonoros/visuais de alerta funcionam (movimento, elevacao, falha) quando existentes',
          criticidade: 'medio',
          acao:
            'Reparar e reforcar controles operacionais/isolamento ate regularizacao.',
        },
      ],
    },
    {
      id: 'elevating-platform-topic-10',
      titulo: 'Operacao Segura (procedimento e comportamento)',
      ordem: 10,
      itens: [
        {
          subitem: 'EPI/EPC',
          item: 'EPI/EPC definido em AR/PT em uso (capacete, calcado, cinto/talabarte quando aplicavel)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear a atividade ate adequacao completa do EPI/EPC conforme AR/PT.',
        },
        {
          subitem: 'Amarracao de ferramentas',
          item: 'Ferramentas e materiais amarrados/armazenados para prevenir queda de objetos',
          criticidade: 'alto',
          acao:
            'Organizar e amarrar ferramentas; instalar bolsa/porta-ferramentas.',
        },
        {
          subitem: 'Proibicao de improviso',
          item: 'Nao utiliza escadas, caixas ou improvisos dentro do cesto para ganhar altura',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Interromper imediatamente e redefinir metodo/equipamento adequado.',
        },
        {
          subitem: 'Limites de alcance',
          item: 'Operacao dentro dos limites do fabricante (sem ultrapassar guarda-corpo, sem se projetar)',
          criticidade: 'alto',
          acao:
            'Parar e reposicionar equipamento; reforcar treinamento sobre limites.',
        },
        {
          subitem: 'Movimentacao em altura',
          item: 'Movimenta o equipamento em altura somente quando permitido pelo fabricante e condicoes seguras atendidas',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear pratica insegura e seguir restricoes do fabricante.',
        },
        {
          subitem: 'Carga lateral',
          item: 'Nao aplica carga lateral (puxar/empurrar estrutura) que comprometa estabilidade',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Interromper e replanejar a tarefa com metodo adequado (içamento, ancoragem, acesso alternativo).',
        },
        {
          subitem: 'Passageiros',
          item: 'Somente pessoas autorizadas no cesto, respeitando limite e orientacao do fabricante',
          criticidade: 'alto',
          acao:
            'Ajustar equipe no cesto e respeitar limite; se excedido, bloquear.',
          observacaoObrigatoria: true,
        },
        {
          subitem: 'Observador',
          item: 'Observador/spotter designado quando houver risco de colisao, area confinada ou baixa visibilidade',
          criticidade: 'medio',
          acao:
            'Designar observador e definir sinais/raio de atuacao antes de movimentar.',
        },
      ],
    },
    {
      id: 'elevating-platform-topic-11',
      titulo: 'Emergencia, Resgate e Comunicacao',
      ordem: 11,
      itens: [
        {
          subitem: 'Plano de resgate',
          item: 'Plano de resgate/emergencia definido e conhecido pela equipe (inclui falha de energia/controle)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Bloquear ate definir plano de resgate e treinar equipe envolvida.',
        },
        {
          subitem: 'Equipe de apoio',
          item: 'Existe pessoa no solo designada e apta a operar controle no solo para resgate quando necessario',
          criticidade: 'alto',
          acao:
            'Designar e orientar pessoa de apoio antes do inicio da atividade.',
        },
        {
          subitem: 'Comunicacao',
          item: 'Meio de comunicacao eficaz (radio/telefone/sinais) entre operador e apoio',
          criticidade: 'alto',
          acao:
            'Definir comunicacao e testar antes de iniciar elevacao.',
        },
        {
          subitem: 'Primeiros socorros',
          item: 'Acesso a recursos de primeiros socorros e procedimento de acionamento de emergencia',
          criticidade: 'medio',
          acao:
            'Garantir disponibilidade e alinhamento de acionamento (ramal, contato, rota de socorro).',
        },
      ],
    },
    {
      id: 'elevating-platform-topic-12',
      titulo: 'Pos-uso, Bloqueio e Registro de Nao Conformidades',
      ordem: 12,
      itens: [
        {
          subitem: 'Recolhimento',
          item: 'Equipamento recolhido e baixado ao final da atividade (cesto em posicao segura)',
          criticidade: 'alto',
          acao:
            'Recolher imediatamente e reforcar rotina de encerramento.',
        },
        {
          subitem: 'Desligamento',
          item: 'Equipamento desligado de forma segura e chave removida/guardada (controle de acesso)',
          criticidade: 'alto',
          acao:
            'Aplicar controle de acesso, recolher chave e orientar responsaveis.',
        },
        {
          subitem: 'Estacionamento',
          item: 'Equipamento estacionado em local seguro, definido e sem obstruir rotas/saidas',
          criticidade: 'medio',
          acao:
            'Reposicionar em local adequado e sinalizar quando necessario.',
        },
        {
          subitem: 'Recarga/abastecimento',
          item: 'Recarga/abastecimento realizado em local e condicao segura conforme procedimento (ventilacao, nao fontes de ignicao)',
          criticidade: 'alto',
          acao:
            'Adequar local/procedimento de recarga/abastecimento e treinar equipe.',
        },
        {
          subitem: 'Registro de falhas',
          item: 'Falhas/alertas ocorridos no turno registrados e comunicados (manutencao/locadora/gestao)',
          criticidade: 'alto',
          acao:
            'Registrar imediatamente e, se critico, bloquear fisicamente o equipamento.',
        },
        {
          subitem: 'Bloqueio/interdicao',
          item: 'Equipamento bloqueado e identificado como INAPTO quando houver risco (tag/lock/segregacao)',
          criticidade: 'critico',
          bloqueia: true,
          acao:
            'Aplicar bloqueio e identificacao visivel, segregar e impedir uso ate manutencao.',
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

