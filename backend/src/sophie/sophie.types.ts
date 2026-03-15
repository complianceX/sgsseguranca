export type SophieRiskLevel = 'baixo' | 'moderado' | 'alto' | 'critico';

export type SophieAgentType =
  | 'fisico'
  | 'quimico'
  | 'biologico'
  | 'ergonomico'
  | 'acidente'
  | string;

export type SophieControls = {
  eliminacao: string[];
  substituicao: string[];
  engenharia: string[];
  administrativas: string[];
  epi: string[];
};

export type SophieRule = {
  id: string;
  when: {
    atividade_contains?: string[];
    setor_contains?: string[];
    maquina_contains?: string[];
    processo_contains?: string[];
    material_contains?: string[];
    ambiente_contains?: string[];
  };
  outputs: {
    perigos: string[];
    agentes?: SophieAgentType[];
    normas?: string[];
    controles?: Partial<SophieControls>;
  };
};

export type SophieKnowledgeBase = {
  rules: SophieRule[];
};

export type SophieAnalyzeInput = {
  atividade?: string;
  setor?: string;
  maquina?: string;
  processo?: string;
  material?: string;
  ambiente?: string;
  probabilidade?: number;
  severidade?: number;
};

export type SophieAnalyzeResult = {
  matchedRuleIds: string[];
  perigos: string[];
  agentes: SophieAgentType[];
  normas: string[];
  controles: SophieControls;
  // Matriz de risco (se disponível)
  probabilidade?: number;
  severidade?: number;
  nivel_de_risco?: number;
  classificacao?: SophieRiskLevel;
};
