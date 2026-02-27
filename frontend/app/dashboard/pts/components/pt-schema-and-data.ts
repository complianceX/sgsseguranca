import { z } from 'zod';

// =================================================================
// TIPOS E INTERFACES
// =================================================================

type HeightChecklistAnswer = 'Sim' | 'Não' | 'Não aplicável';
type GeneralRecommendationAnswer = 'Ciente' | 'Não';
type RapidRiskChecklistAnswer = 'Sim' | 'Não';

interface ChecklistQuestion {
  id: string;
  pergunta: string;
  allowNA?: boolean;
  optional?: boolean;
}

interface ConfinedSpaceChecklistQuestion extends ChecklistQuestion {
  section: string;
}

interface ExcavationChecklistQuestion extends ChecklistQuestion {
  section: string;
}

interface RapidRiskChecklistQuestion {
  id: string;
  pergunta: string;
  secao: 'basica' | 'adicional';
}

// =================================================================
// DADOS DAS PERGUNTAS DOS CHECKLISTS
// =================================================================

export const alturaQuestions: ChecklistQuestion[] = [
  { id: 'parte_solo', pergunta: 'Parte do trabalho pode ser realizada ao nível do solo?' },
  { id: 'colaboradores_aptos', pergunta: 'Todos os colaboradores envolvidos na tarefa são aptos para a tarefa e treinados em Trabalhos em Altura?' },
  { id: 'checklist_telhado', pergunta: 'Para atividade em telhados e coberturas, foi executado o CHECKLIST (HSE-FORM-006)? Caso sim, coloque em anexo devidamente preenchido.', allowNA: true },
  { id: 'checklist_escadas', pergunta: 'Foi preenchido checklist de segurança para uso de escadas fixas/portáteis ou plataforma elevatória conforme HSE-PRO-007?', allowNA: true },
  { id: 'protecao_area', pergunta: 'A proteção da área (guarda-corpo conforme norma e rodapés) foi instalada e funcionou visualmente?' },
  { id: 'distancia_borda', pergunta: 'As pessoas na atividade serão mantidas a mais de 2m de borda não protegida?' },
  { id: 'linha_vida', pergunta: 'A linha de vida está instalada, com laudo e funcionando? A capacidade e instruções estão disponíveis aos colaboradores?' },
  { id: 'rotas_sinalizadas', pergunta: 'As passarelas e rotas de saída/emergência estão devidamente sinalizadas?' },
  { id: 'retirada_risco', pergunta: 'As pessoas podem ser retiradas da área de risco de queda?' },
  { id: 'isolamento_sinalizacao', pergunta: 'É obrigatório o uso de área de isolamento/barreiras e sinalização?' },
  { id: 'controle_acesso', pergunta: 'Todos os riscos de queda e áreas restritas foram identificados e controlados para evitar circulação não autorizada?' },
  { id: 'equipamentos_secundarios', pergunta: 'Os equipamentos secundários para atividade em altura (cintos, talabartes, linhas de vida, mosquetão etc.) são adequados?' },
  { id: 'risco_queda_objetos', pergunta: 'Existe risco de queda de materiais/objetos de altura?' },
  { id: 'proximidade_energia', pergunta: 'Atividade em altura está próxima a linhas/equipamentos energizados e foi realizado desligamento conforme NR-10 por profissionais autorizados?' },
  { id: 'ferramentas_presilhas', pergunta: 'As ferramentas estão presas com cordas/bolsa de segurança para evitar queda?' },
  { id: 'restricao_prevencao_parada', pergunta: 'As diferenças entre restrição/prevenção de queda e parada de queda foram identificadas e os equipamentos adequados selecionados?' },
  { id: 'requisitos_equipamentos', pergunta: 'Os requisitos dos equipamentos para trabalho em altura foram identificados e certificados para uso?' },
  { id: 'cabos_retrateis', pergunta: 'Se necessários cabos retráteis, os pontos de fixação estão corretamente localizados e seguros?' },
  { id: 'ancoragem', pergunta: 'Os pontos de ancoragem são adequados, funcionais, em bom estado e com laudos vigentes?' },
  { id: 'plano_resgate', pergunta: 'Existe um plano de resgate em altura?' },
  { id: 'condicoes_climaticas', pergunta: 'As condições climáticas para a atividade estão adequadas (sem chuva, neblina, ventos fortes, raios etc.)?' },
];

export const eletricoQuestions: ChecklistQuestion[] = [
  { id: 'planejamento_eletricista', pergunta: 'A tarefa foi planejada por um eletricista qualificado?' },
  { id: 'diagrama_desconexao', pergunta: 'Está disponível um diagrama com os pontos de desconexão no pedido de trabalho?' },
  { id: 'nr10_verificacoes', pergunta: 'Foram feitas as verificações necessárias para garantir que não haja voltagem/tensão/energia, conforme NR10?' },
  { id: 'instrucoes_especiais', pergunta: 'Existem instruções elétricas especiais anexadas ao pedido de trabalho?' },
  { id: 'loto', pergunta: 'Todas as fontes elétricas estão bloqueadas, sinalizadas e etiquetadas? Existe procedimento LOTO vigente?' },
  { id: 'controles_remotos', pergunta: 'Os controles remotos foram isolados?' },
  { id: 'aterramento_isolamento', pergunta: 'O aterramento e isolamento foram aplicados corretamente?' },
  { id: 'energizado_notificacao', pergunta: 'No trabalho em sistemas energizados, todas as áreas e responsáveis foram notificados?' },
  { id: 'ferramentas_condicao', pergunta: 'Equipamentos e ferramentas elétricas estão em boas condições/funcionais/calibrados?' },
  { id: 'epi_uniforme', pergunta: 'Todos os trabalhadores estão usando proteção elétrica adequada e em conformidade com RAMs?' },
  { id: 'mantas_tapetes', pergunta: 'Existem equipamentos de proteção especial (mantas e tapetes isolantes)?' },
  { id: 'vara_manobra', pergunta: 'Estão disponíveis varas de manobra dielétricas e equipamentos de emergência adequados?' },
  { id: 'brigadistas_rcp', pergunta: 'Existem brigadistas treinados em primeiros socorros e RCP no local?' },
  { id: 'extincao_incendio', pergunta: 'Existem meios adequados e suficientes de extinção de fogo no local?' },
  { id: 'plano_emergencia', pergunta: 'Existe plano de emergência/resgate vigente e de fácil acesso a todos os colaboradores?' },
];

export const quenteQuestions: ChecklistQuestion[] = [
  { id: 'area_livre_combustiveis', pergunta: 'A área de trabalho está livre de materiais combustíveis e inflamáveis?' },
  { id: 'riscos_incendio_15m', pergunta: 'Outros riscos de incêndio foram identificados, neutralizados/eliminados/controlados em raio de 15m?' },
  { id: 'atmosfera_explosiva', pergunta: 'Existe possibilidade de atmosfera explosiva? O trabalho é realizado em espaço fechado?' },
  { id: 'ventilacao_suficiente', pergunta: 'Existe ventilação suficiente (natural ou forçada) protegida na área?' },
  { id: 'isolamento_sinalizacao_fuga', pergunta: 'Possui isolamento adequado, sinalização de segurança e caminhos seguros de acesso/fuga?' },
  { id: 'protecao_faiscas_fumos', pergunta: 'A área está protegida para evitar que faíscas e fumos se espalhem?' },
  { id: 'cilindros_afastados_fontes', pergunta: 'Os cilindros de gás estão afastados de faíscas, centelhas e chamas?' },
  { id: 'cilindros_posicao_vertical', pergunta: 'Os cilindros de gás estão em posição vertical e distantes da luz solar?' },
  { id: 'cilindros_dispositivos_retrocesso', pergunta: 'Os cilindros são adequados à pressão e com proteção contra retrocesso de chama? Mangueiras sem defeitos?' },
  { id: 'supervisao_treinada_incendio', pergunta: 'A atividade é supervisionada por pessoal treinado no combate a incêndios?' },
  { id: 'extintores_adequados', pergunta: 'Existem extintores/equipamentos de combate a incêndio suficientes e adequados próximos ao local?' },
  { id: 'equipamento_incendio_funciona', pergunta: 'O equipamento de combate a incêndios está funcionando?' },
  { id: 'pessoal_plano_emergencia', pergunta: 'O pessoal envolvido está familiarizado com meios de fuga e plano de emergência?' },
  { id: 'epi_adequado', pergunta: 'O pessoal está usando EPI adequado para a atividade e riscos?', allowNA: true },
  { id: 'equipamentos_operacionais', pergunta: 'Todo equipamento/ferramentas da atividade está operacional e em boas condições?' },
  { id: 'plano_resgate', pergunta: 'Existe plano de resgate?' },
];

export const confinadoQuestions: ConfinedSpaceChecklistQuestion[] = [
  { id: 'entrada', section: 'Entrada', pergunta: 'A entrada é permitida?' },
  { id: 'meios_acesso', section: 'Entrada', pergunta: 'Foram fornecidos meios de acesso (por exemplo, escadas)?', allowNA: true },
  { id: 'pt_quente_emitida', section: 'Entrada', pergunta: 'Se trabalhos a quente foram realizados no espaço confinado, foi emitida Permissão para Trabalhos a Quente?' },
  { id: 'instrumentos_calibrados', section: 'Teste de atmosfera', pergunta: 'Os instrumentos usados nos testes atmosféricos estão corretamente calibrados?' },
  { id: 'atmosfera_testada_antes', section: 'Teste de atmosfera', pergunta: 'A atmosfera no espaço confinado foi testada antes da entrada?' },
  { id: 'testador_autorizado', section: 'Teste de atmosfera', pergunta: 'Os testes de gás são realizados por testador de gás autorizado?' },
  { id: 'oxigenio_faixa', section: 'Teste de atmosfera', pergunta: 'O oxigênio estava pelo menos a 19,5% e não ultrapassou 23,5%?' },
  { id: 'gases_limites', section: 'Teste de atmosfera', pergunta: 'Os gases tóxicos, inflamáveis ou asfixiantes estavam dentro dos limites exigidos?' },
  { id: 'monitoramento_durante', section: 'Monitoramento', pergunta: 'A atmosfera no espaço será monitorada enquanto o trabalho estiver em andamento?' },
  { id: 'monitoramento_continuo', section: 'Monitoramento', pergunta: 'Monitoramento contínuo?', allowNA: true },
  { id: 'monitoramento_periodico', section: 'Monitoramento', pergunta: 'Monitoramento periódico?', allowNA: true },
  { id: 'espaco_limpo', section: 'Limpeza / Ventilação', pergunta: 'O espaço foi limpo antes da entrada?' },
  { id: 'espaco_vaporizado', section: 'Limpeza / Ventilação', pergunta: 'O espaço foi vaporizado? Se sim, foi permitido esfriar?' },
  { id: 'espaco_ventilado', section: 'Limpeza / Ventilação', pergunta: 'O espaço foi ventilado antes da entrada?' },
  { id: 'ventilacao_continua', section: 'Limpeza / Ventilação', pergunta: 'A ventilação será contínua durante a ocupação do espaço confinado?' },
  { id: 'entrada_ar_segura', section: 'Limpeza / Ventilação', pergunta: 'A entrada de ar para ventilação está em área livre de substâncias perigosas?' },
  { id: 'reteste_antes_entrada', section: 'Limpeza / Ventilação', pergunta: 'Se a atmosfera era inaceitável e ventilada, foi feito RETESTE antes da entrada?' },
  { id: 'isolamento_sistemas', section: 'Isolamento', pergunta: 'O espaço está isolado de outros sistemas e/ou fontes de energia?' },
  { id: 'bloqueio_eletrico', section: 'Isolamento', pergunta: 'Os equipamentos elétricos estão bloqueados?' },
  { id: 'desconexoes_quando_possivel', section: 'Isolamento', pergunta: 'São usadas desconexões quando possível?' },
  { id: 'bloqueio_mecanico', section: 'Isolamento', pergunta: 'Equipamentos mecânicos estão bloqueados/obstruídos/desconectados quando necessário?' },
  { id: 'linhas_tampadas_drenadas', section: 'Isolamento', pergunta: 'As linhas sob pressão são tampadas e drenadas?' },
  { id: 'epi_especial', section: 'Equipamento / Proteção respiratória', pergunta: 'São permitidas roupas/EPIs especiais (botas, uniformes químicos, óculos etc.)?' },
  { id: 'ferramentas_especiais', section: 'Equipamento / Proteção respiratória', pergunta: 'São necessárias ferramentas especiais (à prova de faísca, baixa tensão)?' },
  { id: 'protecao_respiratoria_disponivel', section: 'Equipamento / Proteção respiratória', pergunta: 'A proteção respiratória necessária está disponível conforme avaliação de riscos?', allowNA: true },
  { id: 'protecao_respiratoria_adequada', section: 'Equipamento / Proteção respiratória', pergunta: 'A proteção respiratória disponível é adequada?' },
  { id: 'treinamento_entrada', section: 'Capacitação', pergunta: 'Colaboradores designados para entrar no espaço confinado foram treinados adequadamente?' },
  { id: 'treinamento_respiratoria', section: 'Capacitação', pergunta: 'Colaboradores foram treinados no uso da proteção respiratória necessária?' },
  { id: 'primeiros_socorros_rcp', section: 'Capacitação', pergunta: 'A quantidade de pessoas treinadas em primeiros socorros/RCP é adequada?' },
  { id: 'pessoal_reserva_suficiente', section: 'Stand-by / Resgate', pergunta: 'A atribuição de pessoal foi suficiente para stand-by na atividade?' },
  { id: 'reserva_treinada', section: 'Stand-by / Resgate', pergunta: 'Os colaboradores de reserva foram treinados adequadamente?' },
  { id: 'registro_entrada_saida', section: 'Stand-by / Resgate', pergunta: 'A folha de registro de entrada/saída está disponível e atualizada?' },
  { id: 'comunicacao_constante', section: 'Stand-by / Resgate', pergunta: 'Colaboradores de reserva manterão comunicação visual/auditiva constante com quem está dentro?' },
  { id: 'procedimentos_resgate_disponiveis', section: 'Stand-by / Resgate', pergunta: 'Procedimentos de resgate estão disponíveis e podem ser seguidos em emergência?' },
  { id: 'equipamento_resgate_proximo', section: 'Stand-by / Resgate', pergunta: 'Equipamento/veículo de resgate está disponível nas proximidades e acessível?' },
  { id: 'responsaveis_resgate_treinados', section: 'Stand-by / Resgate', pergunta: 'Responsáveis pelo resgate são treinados adequadamente?' },
  { id: 'resgate_informado', section: 'Stand-by / Resgate', pergunta: 'Responsáveis pelo resgate foram informados sobre a atividade antes do início?' },
  { id: 'meios_comunicacao_apoio_externo', section: 'Stand-by / Resgate', pergunta: 'Estão disponíveis meios de comunicação e números de apoio externo para emergência?' },
];

export const escavacaoQuestions: ExcavationChecklistQuestion[] = [
  { id: 'servicos_publicos_notificados', section: 'Local de trabalho', pergunta: 'Antes de começar, os serviços públicos foram notificados e os serviços agrupados localizados?' },
  { id: 'instalacoes_subterraneas_protegidas', section: 'Local de trabalho', pergunta: 'As instalações subterrâneas (se houver) foram desconectadas ou devidamente protegidas?' },
  { id: 'linhas_aereas_observadas', section: 'Local de trabalho', pergunta: 'As linhas de transmissão aéreas foram observadas e medidas foram tomadas para evitar contato?' },
  { id: 'sinalizacao_barricadas', section: 'Local de trabalho', pergunta: 'Foram aplicadas sinalizações adequadas e fornecidas barricadas/isolamento?' },
  { id: 'equipamento_aterros_posicionados', section: 'Local de trabalho', pergunta: 'Equipamentos e aterros estão corretamente posicionados para tráfego seguro e progresso da construção?' },
  { id: 'orgaos_notificados_interrupcao', section: 'Local de trabalho', pergunta: 'Se houver interrupção de estrada, os órgãos responsáveis foram notificados?' },
  { id: 'planejamento_escavacao', section: 'Atividade', pergunta: 'Foi feito planejamento para garantir escavação conforme requisitos?' },
  { id: 'escoramento_nr18', section: 'Atividade', pergunta: 'Foi feito acompanhamento adequado da escavação (NR18: acima de 1,20m com barreiras laterais/escoras)?' },
  { id: 'rampas_equipamentos', section: 'Atividade', pergunta: 'Foram fornecidas rampas adequadas para acesso de equipamentos?' },
  { id: 'riscos_espaco_confinado_considerados', section: 'Atividade', pergunta: 'Riscos de espaço confinado/perigos atmosféricos foram considerados?' },
  { id: 'medidas_confinado_vigor', section: 'Atividade', pergunta: 'Se trincheira/escavação for espaço confinado, medidas preventivas estão em vigor?' },
  { id: 'estruturas_reforcadas_engenheiro', section: 'Atividade', pergunta: 'Estruturas subterrâneas foram reforçadas/escoradas ou engenheiro registrou que não é necessário?', optional: true },
  { id: 'substancias_perigosas_eliminadas', section: 'Atividade', pergunta: 'Foram eliminadas substâncias perigosas/resíduos/contaminantes durante a atividade?' },
  { id: 'meios_remocao_agua', section: 'Atividade', pergunta: 'Foram fornecidos meios para remover água da escavação?' },
  { id: 'pocos_fossas_isolados', section: 'Atividade', pergunta: 'Poços/fossas abertas estão cobertos, sinalizados e/ou isolados?' },
  { id: 'checklist_equipamento_pesado', section: 'Atividade', pergunta: 'Equipamento pesado envolvido na atividade foi inspecionado/checklistado?' },
  { id: 'operadores_certificados', section: 'Atividade', pergunta: 'Todos os operadores de equipamentos possuem certificações e qualificações?' },
  { id: 'sinalizadores_designados', section: 'Atividade', pergunta: 'Foram designados sinalizadores/lanternas para controlar movimentos de equipamentos pesados?' },
  { id: 'acessorios_rigging_ok', section: 'Atividade', pergunta: 'Acessórios de equipamentos (correntes, polias, cordas, rigging) estão em boas condições?' },
];

export const recomendacoesQuestions: ChecklistQuestion[] = [
  {
    id: 'interrupcao_risco_grave',
    pergunta:
      'O trabalho deve ser interrompido imediatamente caso seja detectado risco grave e iminente. Considera-se grave e iminente risco toda condição ou situação de trabalho que possa causar acidente ou doença relacionada ao trabalho com lesão à integridade física do trabalhador.',
  },
  {
    id: 'nova_pte_apos_interrupcao',
    pergunta:
      'Qualquer interrupção da atividade da equipe por qualquer motivo implicará na emissão de novo PTE. Esta permissão deverá ser exposta no local de trabalho até o seu término. Após o trabalho, esta permissão deverá ser arquivada.',
  },
];

export const riscoRapidoQuestions: RapidRiskChecklistQuestion[] = [
  {
    id: 'ciente_perigos_riscos',
    secao: 'basica',
    pergunta:
      'Estou ciente dos perigos e riscos desta tarefa que vou realizar? Sei como lidar com eles para que não ocorram acidentes?',
  },
  {
    id: 'competencia_qualificacao_treinamento',
    secao: 'basica',
    pergunta:
      'Tenho as competências, o conhecimento, as qualificações, o treinamento e a experiência necessária para essa atividade?',
  },
  {
    id: 'ferramentas_medidas_epi_adequados',
    secao: 'basica',
    pergunta:
      'Tenho as ferramentas corretas, em bom estado, as medidas preventivas, o equipamento adequado e os equipamentos de proteção individual (EPI) para essa atividade?',
  },
  {
    id: 'verificacao_preuso_equipamentos',
    secao: 'basica',
    pergunta:
      'Verifiquei os equipamentos, ferramentas, medidas preventivas, veículos, máquinas e EPI antes de usá-los para garantir que não haja danos?',
  },
  {
    id: 'apr_metodo_atualizados',
    secao: 'basica',
    pergunta:
      'Existe uma verificação de riscos/declaração de método atualizada, onde diz sobre todos os riscos potenciais de segurança e descreve medidas protetivas adequadas?',
  },
  {
    id: 'repasse_com_equipes',
    secao: 'basica',
    pergunta:
      'Repassei as informações com meus colegas de trabalho, empresas terceirizadas e contratantes para garantir que todos estejam cientes da atividade?',
  },
  {
    id: 'sabe_agir_emergencia',
    secao: 'basica',
    pergunta:
      'Você sabe o que fazer em caso de emergência (primeiros socorros, princípio de incêndio, rotas de fuga etc.)?',
  },
  {
    id: 'ambiente_limpo_organizado',
    secao: 'basica',
    pergunta:
      'O meu ambiente de trabalho está limpo e organizado (sem riscos de queda, sem objetos ou lixo espalhado)?',
  },
  {
    id: 'regras_seguranca_cumpridas',
    secao: 'basica',
    pergunta:
      'Todas as regras de segurança foram cumpridas (bloqueio de reenergização, LOTO, procedimentos, declaração de método de execução, APR etc.)?',
  },
  {
    id: 'controle_prevencao_incendio',
    secao: 'basica',
    pergunta:
      'Tenho equipamento/medidas para prevenir e controlar um incêndio? Tenho treinamento adequado para utilizar o equipamento?',
  },
  {
    id: 'controle_prevencao_derramamento',
    secao: 'basica',
    pergunta:
      'Tenho equipamento/medidas para prevenir e controlar um derramamento/contaminação? Tenho treinamento adequado para utilizar o equipamento?',
  },
  {
    id: 'condicoes_ambientais_seguras',
    secao: 'basica',
    pergunta:
      'As condições ambientais são seguras para executar a atividade?',
  },
  {
    id: 'requer_permissao_especifica',
    secao: 'adicional',
    pergunta:
      'Este trabalho requer uma permissão específica/verificação dupla (altura, elétrico, içamento, quente, espaço confinado)?',
  },
  {
    id: 'condicao_incomum_detectada',
    secao: 'adicional',
    pergunta:
      'Há alguma outra condição incomum detectada que precisa ser controlada?',
  },
  {
    id: 'outra_autorizacao_especifica',
    secao: 'adicional',
    pergunta:
      'Há alguma outra autorização específica?',
  },
];

// =================================================================
// DADOS INICIAIS DOS CHECKLISTS
// =================================================================

export const initialChecklists = {
  analise_risco_rapida_checklist: riscoRapidoQuestions.map((item) => ({
    id: item.id,
    pergunta: item.pergunta,
    secao: item.secao,
    resposta: undefined as RapidRiskChecklistAnswer | undefined,
  })),
  recomendacoes_gerais_checklist: recomendacoesQuestions.map((item) => ({
    id: item.id,
    pergunta: item.pergunta,
    resposta: undefined as GeneralRecommendationAnswer | undefined,
    justificativa: '',
  })),
  trabalho_altura_checklist: alturaQuestions.map((item) => ({
    id: item.id,
    pergunta: item.pergunta,
    resposta: undefined as HeightChecklistAnswer | undefined,
    justificativa: '',
    anexo_nome: '',
  })),
  trabalho_eletrico_checklist: eletricoQuestions.map((item) => ({
    id: item.id,
    pergunta: item.pergunta,
    resposta: undefined as HeightChecklistAnswer | undefined,
    justificativa: '',
    anexo_nome: '',
  })),
  trabalho_quente_checklist: quenteQuestions.map((item) => ({
    id: item.id,
    pergunta: item.pergunta,
    resposta: undefined as HeightChecklistAnswer | undefined,
    justificativa: '',
    anexo_nome: '',
  })),
  trabalho_espaco_confinado_checklist: confinadoQuestions.map((item) => ({
    id: item.id,
    pergunta: item.pergunta,
    resposta: undefined as HeightChecklistAnswer | undefined,
    justificativa: '',
    anexo_nome: '',
  })),
  trabalho_escavacao_checklist: escavacaoQuestions.map((item) => ({
    id: item.id,
    pergunta: item.pergunta,
    resposta: undefined as HeightChecklistAnswer | undefined,
    justificativa: '',
    anexo_nome: '',
  })),
};

// =================================================================
// SCHEMA DE VALIDAÇÃO (ZOD)
// =================================================================

export const ptSchema = z.object({
  numero: z.string().min(1, 'O número é obrigatório'),
  titulo: z.string().min(5, 'O título deve ter pelo menos 5 caracteres'),
  descricao: z.string().optional(),
  data_hora_inicio: z.string(),
  data_hora_fim: z.string(),
  status: z.enum(['Pendente', 'Aprovada', 'Cancelada', 'Encerrada', 'Expirada']),
  company_id: z.string().min(1, 'Selecione uma empresa'),
  site_id: z.string().min(1, 'Selecione um site'),
  apr_id: z.string().optional(),
  responsavel_id: z.string().min(1, 'Selecione um responsável'),
  trabalho_altura: z.boolean(),
  espaco_confinado: z.boolean(),
  trabalho_quente: z.boolean(),
  eletricidade: z.boolean(),
  escavacao: z.boolean(),
  analise_risco_rapida_checklist: z.array(
    z.object({
      id: z.string(),
      pergunta: z.string(),
      secao: z.enum(['basica', 'adicional']),
      resposta: z.enum(['Sim', 'Não']).optional(),
    }),
  ),
  analise_risco_rapida_observacoes: z.string().optional(),
  recomendacoes_gerais_checklist: z.array(
    z.object({
      id: z.string(),
      pergunta: z.string(),
      resposta: z.enum(['Ciente', 'Não']).optional(),
      justificativa: z.string().optional(),
    }),
  ),
  trabalho_altura_checklist: z.array(
    z.object({
      id: z.string(),
      pergunta: z.string(),
      resposta: z.enum(['Sim', 'Não', 'Não aplicável']).optional(),
      justificativa: z.string().optional(),
      anexo_nome: z.string().optional(),
    }),
  ),
  trabalho_eletrico_checklist: z.array(
    z.object({
      id: z.string(),
      pergunta: z.string(),
      resposta: z.enum(['Sim', 'Não', 'Não aplicável']).optional(),
      justificativa: z.string().optional(),
      anexo_nome: z.string().optional(),
    }),
  ),
  trabalho_quente_checklist: z.array(
    z.object({
      id: z.string(),
      pergunta: z.string(),
      resposta: z.enum(['Sim', 'Não', 'Não aplicável']).optional(),
      justificativa: z.string().optional(),
      anexo_nome: z.string().optional(),
    }),
  ),
  trabalho_espaco_confinado_checklist: z.array(
    z.object({
      id: z.string(),
      pergunta: z.string(),
      resposta: z.enum(['Sim', 'Não', 'Não aplicável']).optional(),
      justificativa: z.string().optional(),
      anexo_nome: z.string().optional(),
    }),
  ),
  trabalho_escavacao_checklist: z.array(
    z.object({
      id: z.string(),
      pergunta: z.string(),
      resposta: z.enum(['Sim', 'Não', 'Não aplicável']).optional(),
      justificativa: z.string().optional(),
      anexo_nome: z.string().optional(),
    }),
  ),
  executantes: z.array(z.string()).min(1, 'Selecione pelo menos um executante'),
  auditado_por_id: z.string().optional(),
  data_auditoria: z.string().optional(),
  resultado_auditoria: z.string().optional(),
  notas_auditoria: z.string().optional(),
}).superRefine((data, ctx) => {
  const requireJustificationWhenNeeded = (
    resposta: string | undefined,
    justificativa: string | undefined,
    pathPrefix: string,
    index: number,
  ) => {
    if ((resposta === 'Não' || resposta === 'Não aplicável') && !justificativa?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe a justificativa para esta resposta.',
        path: [pathPrefix, index, 'justificativa'],
      });
    }
  };

  data.analise_risco_rapida_checklist.forEach((item, index) => {
    if (!item.resposta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selecione uma resposta.',
        path: ['analise_risco_rapida_checklist', index, 'resposta'],
      });
    }
  });

  const hasBasicNo = data.analise_risco_rapida_checklist.some(
    (item) => item.secao === 'basica' && item.resposta === 'Não',
  );
  if (hasBasicNo && !data.analise_risco_rapida_observacoes?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'Descreva as medidas corretivas no campo de observações antes de continuar.',
      path: ['analise_risco_rapida_observacoes'],
    });
  }

  data.recomendacoes_gerais_checklist.forEach((item, index) => {
    if (!item.resposta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selecione uma resposta.',
        path: ['recomendacoes_gerais_checklist', index, 'resposta'],
      });
      return;
    }

    requireJustificationWhenNeeded(
      item.resposta,
      item.justificativa,
      'recomendacoes_gerais_checklist',
      index,
    );
  });

  if (data.trabalho_altura) {
    data.trabalho_altura_checklist.forEach((item, index) => {
      if (!item.resposta) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Selecione uma resposta.',
          path: ['trabalho_altura_checklist', index, 'resposta'],
        });
        return;
      }

      const config = alturaQuestions.find((q) => q.id === item.id);
      if (!config?.allowNA && item.resposta === 'Não aplicável') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Este item não permite "Não aplicável".',
          path: ['trabalho_altura_checklist', index, 'resposta'],
        });
      }

      requireJustificationWhenNeeded(
        item.resposta,
        item.justificativa,
        'trabalho_altura_checklist',
        index,
      );
    });
  }

  if (data.eletricidade) {
    data.trabalho_eletrico_checklist.forEach((item, index) => {
      if (!item.resposta) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Selecione uma resposta.',
          path: ['trabalho_eletrico_checklist', index, 'resposta'],
        });
        return;
      }

      requireJustificationWhenNeeded(
        item.resposta,
        item.justificativa,
        'trabalho_eletrico_checklist',
        index,
      );
    });
  }

  if (data.trabalho_quente) {
    data.trabalho_quente_checklist.forEach((item, index) => {
      if (!item.resposta) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Selecione uma resposta.',
          path: ['trabalho_quente_checklist', index, 'resposta'],
        });
        return;
      }
      const config = quenteQuestions.find((q) => q.id === item.id);
      if (!config?.allowNA && item.resposta === 'Não aplicável') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Este item não permite "Não aplicável".',
          path: ['trabalho_quente_checklist', index, 'resposta'],
        });
      }

      requireJustificationWhenNeeded(
        item.resposta,
        item.justificativa,
        'trabalho_quente_checklist',
        index,
      );
    });
  }

  if (data.espaco_confinado) {
    data.trabalho_espaco_confinado_checklist.forEach((item, index) => {
      if (!item.resposta) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Selecione uma resposta.',
          path: ['trabalho_espaco_confinado_checklist', index, 'resposta'],
        });
        return;
      }
      const config = confinadoQuestions.find(
        (q) => q.id === item.id,
      );
      if (!config?.allowNA && item.resposta === 'Não aplicável') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Este item não permite "Não aplicável".',
          path: ['trabalho_espaco_confinado_checklist', index, 'resposta'],
        });
      }

      requireJustificationWhenNeeded(
        item.resposta,
        item.justificativa,
        'trabalho_espaco_confinado_checklist',
        index,
      );
    });
  }

  if (data.escavacao) {
    data.trabalho_escavacao_checklist.forEach((item, index) => {
      const config = escavacaoQuestions.find((q) => q.id === item.id);
      if (!item.resposta && !config?.optional) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Selecione uma resposta.',
          path: ['trabalho_escavacao_checklist', index, 'resposta'],
        });
        return;
      }

      if (item.resposta) {
        requireJustificationWhenNeeded(
          item.resposta,
          item.justificativa,
          'trabalho_escavacao_checklist',
          index,
        );
      }
    });
  }
});

export type PtFormData = z.infer<typeof ptSchema>;