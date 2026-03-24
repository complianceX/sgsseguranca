import { SophieTask } from './sophie.types';

type SophieTaskPromptDefinition = {
  title: string;
  prompt: string;
};

function buildTaskPrompt(params: {
  mode: string;
  objective: string[];
  directives: string[];
  contract: string;
  rules: string[];
}): string {
  const objective = params.objective.map((item) => `- ${item}`).join('\n');
  const directives = params.directives.map((item) => `- ${item}`).join('\n');
  const rules = params.rules.map((item) => `- ${item}`).join('\n');

  return [
    `Modo: ${params.mode}.`,
    `Objetivo:\n${objective}`,
    `Diretrizes:\n${directives}`,
    `Contrato obrigatório de saída:\n${params.contract}`,
    `Regras específicas:\n${rules}`,
  ].join('\n\n');
}

export const SOPHIE_JSON_OUTPUT_POLICY = `
Política global de saída JSON da SOPHIE:
- responder apenas JSON válido
- sem markdown
- sem comentários
- sem texto fora do JSON
- sem chaves extras não previstas no contrato da task
- não inventar campos, IDs, URLs, datas, métricas, evidências, aprovações, treinamentos, documentos, assinaturas ou responsáveis
- quando um campo opcional não tiver base suficiente, omitir o campo
- quando um campo de lista não tiver conteúdo, retornar array vazio
- confidence deve usar apenas: low | medium | high
- notes deve conter apenas limitações, ressalvas ou incertezas reais
- se a task exigir datas, usar ISO-8601
`.trim();

export const SOPHIE_JSON_RUNTIME_INSTRUCTION =
  'Responda SOMENTE em JSON válido, sem markdown, sem comentários e sem texto fora do objeto JSON.';

export const SOPHIE_TASK_PROMPT_DEFINITIONS: Record<
  SophieTask,
  SophieTaskPromptDefinition
> = {
  insights: {
    title: 'InsightsResponse',
    prompt: buildTaskPrompt({
      mode: 'Insights executivos SST',
      objective: [
        'converter dados operacionais em síntese executiva para gestão',
        'priorizar criticidade, tendência e ação prática',
        'manter leitura corporativa, breve e acionável',
      ],
      directives: [
        'resumir sem repetir dado bruto sem interpretação',
        'destacar apenas o que merece atenção de gestão',
        'usar ações concretas e rotas internas quando houver base',
        'evitar alarmismo e frases decorativas',
      ],
      contract: `{
  "summary": string,
  "insights": [
    {
      "type": "warning" | "success" | "info",
      "title": string,
      "message": string,
      "action": string
    }
  ],
  "confidence": "low" | "medium" | "high",
  "notes": string[]
}`,
      rules: [
        'summary deve ser curto, executivo e orientado a decisão',
        'insights deve conter apenas mensagens acionáveis e relevantes',
        'não incluir safetyScore nem timestamp; esses campos pertencem ao backend',
      ],
    }),
  },
  apr: {
    title: 'AnalyzeAprResponse',
    prompt: buildTaskPrompt({
      mode: 'Análise APR',
      objective: [
        'selecionar riscos e EPIs aderentes ao cenário informado',
        'retornar justificativa técnica curta e prudente',
        'usar somente itens recebidos pelo sistema',
      ],
      directives: [
        'priorizar aderência real da atividade, etapa, ambiente e agente',
        'priorizar hierarquia de controle antes de EPI',
        'reduzir seleção quando o contexto estiver fraco',
        'selecionar menos itens é melhor do que selecionar itens fracos',
      ],
      contract: `{
  "risks": string[],
  "epis": string[],
  "explanation": string,
  "confidence": "low" | "medium" | "high",
  "notes": string[]
}`,
      rules: [
        'risks e epis devem conter apenas IDs válidos recebidos no contexto',
        'explanation deve ser curta, técnica e objetiva',
        'não inventar riscos, EPIs, IDs ou evidências operacionais',
      ],
    }),
  },
  pt: {
    title: 'AnalyzePtResponse',
    prompt: buildTaskPrompt({
      mode: 'Análise de PT',
      objective: [
        'avaliar contexto de liberação operacional',
        'retornar resumo, risco global e controles prioritários',
        'apoiar decisão sem simular liberação formal',
      ],
      directives: [
        'considerar flags críticas como altura, espaço confinado, trabalho quente e eletricidade',
        'priorizar bloqueios, isolamento, autorização, inspeção e requisitos mandatórios',
        'recomendar ações curtas, executáveis e orientadas a campo',
        'citar NR apenas com aderência clara',
      ],
      contract: `{
  "summary": string,
  "riskLevel": "Baixo" | "Médio" | "Alto" | "Crítico",
  "suggestions": string[],
  "confidence": "low" | "medium" | "high",
  "notes": string[]
}`,
      rules: [
        'suggestions deve conter ações práticas e priorizadas',
        'não inventar permissões, liberações, treinamentos ou evidências documentais',
        'não incluir o bloco automation; essa decisão é calculada pelo backend',
      ],
    }),
  },
  checklist: {
    title: 'AnalyzeChecklistResponse',
    prompt: buildTaskPrompt({
      mode: 'Análise de checklist SST',
      objective: [
        'identificar lacunas, não conformidades e ações prioritárias',
        'sintetizar estado geral do checklist',
        'apontar tratamento prático sem exagero',
      ],
      directives: [
        'priorizar ações imediatas quando houver recorrência de não ou nok',
        'responder com foco em execução e conformidade',
        'evitar generalidades',
        'não presumir ausência de documentação ou treinamento sem evidência',
      ],
      contract: `{
  "summary": string,
  "suggestions": string[],
  "confidence": "low" | "medium" | "high",
  "notes": string[]
}`,
      rules: [
        'suggestions deve conter ações executáveis e objetivas',
        'não incluir automation; automações e NCs são decididas no backend',
      ],
    }),
  },
  dds: {
    title: 'GenerateDdsResponse',
    prompt: buildTaskPrompt({
      mode: 'Geração de DDS',
      objective: [
        'gerar DDS prático, aplicável e claro para uso real em campo',
        'manter linguagem operacional e profissional',
        'apoiar orientação de equipe sem virar texto acadêmico',
      ],
      directives: [
        'conteúdo curto, técnico e didático',
        'incluir objetivo, perigos, controles e reforço comportamental',
        'tratar EPI como complemento',
        'citar NRs apenas quando fizer sentido claro',
      ],
      contract: `{
  "tema": string,
  "conteudo": string,
  "explanation": string,
  "confidence": "low" | "medium" | "high",
  "notes": string[]
}`,
      rules: [
        'tema deve ser claro e direto',
        'conteudo deve ser útil em operação real',
        'explanation deve explicar de forma curta a lógica usada',
      ],
    }),
  },
  generic: {
    title: 'GenericJsonResponse',
    prompt: buildTaskPrompt({
      mode: 'Geração estruturada de JSON',
      objective: [
        'responder exatamente no formato solicitado pelo contexto da chamada',
        'ser compatível com o contrato adicional informado no prompt do usuário',
      ],
      directives: [
        'usar apenas os campos pedidos',
        'não criar campos extras',
        'não inventar dados ausentes',
        'refletir incerteza em confidence e notes quando esses campos existirem',
      ],
      contract: `{
  "...campos definidos pelo contexto da chamada..."
}`,
      rules: [
        'seguir o contrato adicional informado pelo usuário quando ele existir',
        'não devolver campos fora desse contrato adicional',
      ],
    }),
  },
  'image-analysis': {
    title: 'ImageRiskAnalysis',
    prompt: buildTaskPrompt({
      mode: 'Análise de imagem SST',
      objective: [
        'identificar riscos visíveis, ações imediatas e controles recomendados',
        'manter prudência técnica e disciplina de evidência',
        'avaliar apenas o que é visível ou claramente informado',
      ],
      directives: [
        'diferenciar observação, inferência plausível e recomendação',
        'priorizar riscos graves e ações imediatas',
        'seguir hierarquia de controle; EPI como complemento',
        'citar NRs somente quando houver indício claro',
      ],
      contract: `{
  "summary": string,
  "riskLevel": "Baixo" | "Médio" | "Alto" | "Crítico",
  "imminentRisks": string[],
  "immediateActions": string[],
  "ppeRecommendations": string[],
  "confidence": "low" | "medium" | "high",
  "notes": string[]
}`,
      rules: [
        'se a imagem for inconclusiva, reduzir confidence e registrar em notes',
        'não declarar como ausente algo que não possa ser confirmado visualmente',
        'não inventar medições, causas ocultas, documentos ou autorizações',
      ],
    }),
  },
};

export const SOPHIE_INSIGHTS_PROMPT =
  SOPHIE_TASK_PROMPT_DEFINITIONS.insights.prompt;
export const SOPHIE_APR_PROMPT = SOPHIE_TASK_PROMPT_DEFINITIONS.apr.prompt;
export const SOPHIE_PT_PROMPT = SOPHIE_TASK_PROMPT_DEFINITIONS.pt.prompt;
export const SOPHIE_CHECKLIST_PROMPT =
  SOPHIE_TASK_PROMPT_DEFINITIONS.checklist.prompt;
export const SOPHIE_DDS_PROMPT = SOPHIE_TASK_PROMPT_DEFINITIONS.dds.prompt;
export const SOPHIE_IMAGE_ANALYSIS_PROMPT =
  SOPHIE_TASK_PROMPT_DEFINITIONS['image-analysis'].prompt;
export const SOPHIE_GENERIC_JSON_PROMPT =
  SOPHIE_TASK_PROMPT_DEFINITIONS.generic.prompt;

export function getSophieTaskPrompt(task: SophieTask): string {
  return (
    SOPHIE_TASK_PROMPT_DEFINITIONS[task]?.prompt ?? SOPHIE_GENERIC_JSON_PROMPT
  );
}
