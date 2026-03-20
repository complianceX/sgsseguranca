export type AprRiskCategory =
  | "Aceitável"
  | "Atenção"
  | "Substancial"
  | "Crítico";

export type AprRiskPriority =
  | "Não prioritário"
  | "Prioridade básica"
  | "Prioridade preferencial"
  | "Prioridade máxima";

export type AprRiskEvaluation = {
  score: number;
  categoria: AprRiskCategory | "";
  prioridade: AprRiskPriority | "";
};

const RULES: Array<{
  scores: number[];
  categoria: AprRiskCategory;
  prioridade: AprRiskPriority;
}> = [
  {
    scores: [1, 2],
    categoria: "Aceitável",
    prioridade: "Não prioritário",
  },
  {
    scores: [3, 4],
    categoria: "Atenção",
    prioridade: "Prioridade básica",
  },
  {
    scores: [6],
    categoria: "Substancial",
    prioridade: "Prioridade preferencial",
  },
  {
    scores: [9],
    categoria: "Crítico",
    prioridade: "Prioridade máxima",
  },
];

export function calculateAprRiskEvaluation(
  probabilidade?: string | number,
  severidade?: string | number,
): AprRiskEvaluation {
  const probability = Number(probabilidade || 0);
  const severity = Number(severidade || 0);

  if (!probability || !severity) {
    return {
      score: 0,
      categoria: "",
      prioridade: "",
    };
  }

  const score = probability * severity;
  const rule = RULES.find((item) => item.scores.includes(score));

  return {
    score,
    categoria: rule?.categoria ?? "",
    prioridade: rule?.prioridade ?? "",
  };
}
