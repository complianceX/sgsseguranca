export type DdsThemeSeed = {
  tema: string;
  conteudo: string;
};

type Angle = {
  titleSuffix: string;
  sections: (hazard: string) => string[];
};

const joinSections = (parts: string[]) =>
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n');

const ANGLES: Angle[] = [
  {
    titleSuffix: 'Checklist rápido (5 pontos)',
    sections: (hazard) => [
      `FOCO DO DDS: ${hazard}.`,
      `ANTES DE INICIAR: pare 30s e confirme as 5 checagens abaixo.`,
      [
        `1) Permissão/Planejamento: tarefa autorizada e entendimento do método.`,
        `2) EPC/isolamento: barreiras, sinalização e área segregada quando aplicável.`,
        `3) EPI correto: CA vigente, ajuste e integridade (sem improviso).`,
        `4) Condição do local: piso, iluminação, acesso, ordem e limpeza.`,
        `5) Resposta a emergência: rota, telefone, extintor/kit e responsável definidos.`,
      ].join('\n'),
      `SE ALGO NÃO ESTIVER OK: interrompa e corrija antes de prosseguir.`,
    ],
  },
  {
    titleSuffix: 'Erros comuns e como evitar',
    sections: (hazard) => [
      `RISCO PRINCIPAL: ${hazard}.`,
      `ERROS COMUNS: pressa, improviso, confiar no costume, e executar sem isolamento/checagem.`,
      `COMO EVITAR: combine pare/olhe/avalie/aja, use checklist, e valide EPC antes do EPI (EPI é a última barreira).`,
      `PONTO DE OURO: se houver dúvida, trate como risco real e peça apoio.`,
    ],
  },
  {
    titleSuffix: 'Padrão operacional seguro (passo a passo)',
    sections: (hazard) => [
      `SITUAÇÃO: ${hazard}.`,
      [
        `PASSO A PASSO:`,
        `1) Defina a tarefa e o limite de atuação (o que entra e o que não entra).`,
        `2) Identifique perigos (energia, altura, partes móveis, tráfego, produtos, clima).`,
        `3) Aplique EPC primeiro (isolamento, guarda-corpo, ventilação, travas, bloqueio).`,
        `4) Confirme EPI correto e ajuste (sem folgas e sem adornos).`,
        `5) Execute com comunicação clara e parada imediata em condição insegura.`,
      ].join('\n'),
      `REGISTRO NO DDS: descreva o controle aplicado e quem validou.`,
    ],
  },
];

const buildCategoryThemes = (opts: {
  categoryPrefix: string;
  hazards: string[];
  extraGuidance: string;
}): DdsThemeSeed[] => {
  const themes: DdsThemeSeed[] = [];
  for (const hazard of opts.hazards) {
    for (const angle of ANGLES) {
      const tema = `${opts.categoryPrefix}: ${hazard} — ${angle.titleSuffix}`;
      const conteudo = joinSections([
        ...angle.sections(hazard),
        opts.extraGuidance,
      ]);
      themes.push({ tema, conteudo });
    }
  }
  return themes;
};

const EPI_HAZARDS = [
  'Capacete (impacto e choque elétrico)',
  'Óculos de segurança (partículas e respingos)',
  'Protetor auricular (ruído e perda auditiva)',
  'Respirador (poeiras, fumos e vapores)',
  'Luvas anticorte (lâminas e rebarbas)',
  'Luvas químicas (contato com produtos)',
  'Botina com biqueira (queda de materiais)',
  'Calçado antiderrapante (escorregamento)',
  'Protetor facial (esmerilhamento e corte)',
  'Vestimenta FR (arco elétrico e calor)',
  'Cinturão/talabarte (altura e retenção)',
  'Máscara de solda (radiação e respingos)',
  'Proteção solar (trabalho a céu aberto)',
  'Colete refletivo (tráfego interno)',
  'Higiene e guarda do EPI (contaminação)',
];

const ALTURA_HAZARDS = [
  'Trabalho em altura com cinturão paraquedista',
  'Ancoragem e linha de vida (ponto certificado)',
  'Andaime (piso completo e guarda-corpo)',
  'Escada (3 pontos de apoio e travamento)',
  'Queda de ferramentas (amarras e isolamento)',
  'Acesso a telhado (bordas e fragilidade)',
  'Plataforma elevatória (checklist e operação)',
  'Resgate em altura (plano e tempo de resposta)',
  'Clima: vento/chuva (critério de parada)',
  'Talabarte duplo (progressão segura)',
  'Trava-quedas (compatibilidade e inspeção)',
  'Içamento e movimentação (zona de exclusão)',
  'Aberturas no piso (tampa/guarda-corpo)',
  'Trabalho próximo a redes elétricas (distância)',
  'Comunicação em altura (sinais e rádio)',
];

const ELETRICIDADE_HAZARDS = [
  'Bloqueio e etiquetagem (LOTO) antes de manutenção',
  'Teste de ausência de tensão (instrumento adequado)',
  'Arco elétrico (EPIs e distância segura)',
  'Painéis energizados (barreiras e procedimento)',
  'Aterramento temporário (quando aplicável)',
  'Cabos e extensões (integridade e bitola)',
  'Ferramentas isoladas 1000V (inspeção)',
  'Trabalho com gerador (backfeed e aterramento)',
  'Ambiente úmido (proteção e risco aumentado)',
  'Risco de choque por contato indireto (carcaças)',
  'Sinalização e área restrita (pessoas não autorizadas)',
  'EPI dielétrico (luvas e tapetes quando aplicável)',
  'Ordem/limpeza em quadros (aquecimento e faíscas)',
  'Energia acumulada (capacitores e descarregamento)',
  'Roteiro de emergência (socorro e desligamento)',
];

const MAQUINAS_HAZARDS = [
  'Proteções fixas e móveis (não operar sem guarda)',
  'Partes girantes (eixo, correia, polia)',
  'Pontos de esmagamento (prensas e dobradeiras)',
  'Zona de corte (serras, esmeril, lixadeira)',
  'Travamento mecânico (bloqueio antes de ajuste)',
  'Ferramenta inadequada (improviso e acidentes)',
  'Falha de manutenção (vibração, ruído, aquecimento)',
  'Partida inesperada (chave geral e LOTO)',
  'Área de trabalho desorganizada (tropeços e contato)',
  'Uso de ar comprimido (projeção e limpeza indevida)',
  'Troca de disco (aperto, rotação e integridade)',
  'Cavacos e rebarbas (luva adequada e ferramenta)',
  'Retrocesso/kickback (serra e ângulo de corte)',
  'Sinalização e permissões (somente operadores)',
  'Parada de emergência (acesso e teste)',
];

const QUIMICOS_HAZARDS = [
  'Leitura da FISPQ (perigos e primeiros socorros)',
  'Armazenamento (compatibilidade e ventilação)',
  'Rotulagem (não usar recipiente sem identificação)',
  'Diluição e preparo (ordem correta e respingos)',
  'Contato com pele/olhos (lava-olhos e EPI)',
  'Inalação de vapores (ventilação e respirador)',
  'Derramamento (contenção e descarte correto)',
  'Mistura de produtos (reação e gases perigosos)',
  'Trabalho com solventes (inflamabilidade)',
  'Higiene (não comer/beber na área)',
  'Transporte interno (tampa, bandeja e rota)',
  'Resíduos (classe e coleta adequada)',
  'Produtos corrosivos (proteção e manuseio)',
  'Alergênicos/irritantes (sinais e afastamento)',
  'Chuveiro de emergência (acesso e teste)',
];

const VEICULOS_HAZARDS = [
  'Tráfego interno (rota e velocidade controlada)',
  'Manobra em ré (spotter e sinalização)',
  'Pedestres x equipamentos (segregação física)',
  'Pontos cegos (posicionamento seguro)',
  'Carga e amarração (queda de materiais)',
  'Uso de cinto (condutor e passageiros)',
  'Celular e distração (tolerância zero)',
  'Empilhadeira (garfos, carga e estabilidade)',
  'Operação em rampas (ângulo e frenagem)',
  'Condições do piso (buracos, lama, óleo)',
  'Inspeção pré-uso (pneus, freios, luzes, buzina)',
  'Sinalização (cones, fitas e barreiras)',
  'Abastecimento (derramamento e ignição)',
  'Área de carga/descarga (zona de exclusão)',
  'Convivência com terceiros (visitantes e prestadores)',
];

const ERGONOMIA_HAZARDS = [
  'Levantamento manual de cargas (postura e limite)',
  'Transporte de cargas (caminho e apoios)',
  'Empurrar/puxar carrinhos (força e manutenção)',
  'Postura estática (pausas e alternância)',
  'Movimentos repetitivos (rodízio e micro-pausas)',
  'Trabalho acima do ombro (plataforma e ajuste)',
  'Altura de bancada (ajuste e alcance)',
  'Uso de ferramentas vibratórias (exposição e luvas)',
  'Dor/parestesia (sinais e reporte imediato)',
  'Organização do posto (5S e ergonomia)',
  'Uso de escadas improvisadas (proibido; usar acesso correto)',
  'Pegada e preensão (luvas e ferramenta adequada)',
  'Visão/iluminação (fadiga e erros)',
  'Trabalho em calor (hidratação e pausas)',
  'Trabalho em frio (destreza e risco de corte/quedas)',
];

export const DDS_THEME_LIBRARY: DdsThemeSeed[] = [
  ...buildCategoryThemes({
    categoryPrefix: 'EPI',
    hazards: EPI_HAZARDS,
    extraGuidance:
      'NOTA: EPC primeiro, EPI por último. Verifique CA e ajuste antes de entrar na área.',
  }),
  ...buildCategoryThemes({
    categoryPrefix: 'Altura',
    hazards: ALTURA_HAZARDS,
    extraGuidance:
      'NOTA: trabalho em altura exige permissão, ancoragem certificada e critério de parada por clima.',
  }),
  ...buildCategoryThemes({
    categoryPrefix: 'Eletricidade',
    hazards: ELETRICIDADE_HAZARDS,
    extraGuidance:
      'NOTA: aplique LOTO, teste ausência de tensão e restrinja acesso de não autorizados.',
  }),
  ...buildCategoryThemes({
    categoryPrefix: 'Máquinas',
    hazards: MAQUINAS_HAZARDS,
    extraGuidance:
      'NOTA: nunca remova proteções. Ajuste/manutenção somente com bloqueio e parada total.',
  }),
  ...buildCategoryThemes({
    categoryPrefix: 'Químicos',
    hazards: QUIMICOS_HAZARDS,
    extraGuidance:
      'NOTA: consulte FISPQ, rotule recipientes e trate derramamento como emergência controlada.',
  }),
  ...buildCategoryThemes({
    categoryPrefix: 'Veículos',
    hazards: VEICULOS_HAZARDS,
    extraGuidance:
      'NOTA: segregue pedestres, reduza velocidade e use spotter em manobras críticas.',
  }),
  ...buildCategoryThemes({
    categoryPrefix: 'Ergonomia',
    hazards: ERGONOMIA_HAZARDS,
    extraGuidance:
      'NOTA: dor é sinal. Ajuste posto, use ajuda mecânica e pratique pausas curtas regulares.',
  }),
].slice(0, 300);
