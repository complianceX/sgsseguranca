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

type AprRiskBand = {
  minScore: number;
  maxScore: number;
  categoria: AprRiskCategory;
  prioridade: AprRiskPriority;
};

export const APR_RISK_BANDS: AprRiskBand[] = [
  {
    minScore: 1,
    maxScore: 4,
    categoria: "Aceitável",
    prioridade: "Não prioritário",
  },
  {
    minScore: 5,
    maxScore: 9,
    categoria: "Atenção",
    prioridade: "Prioridade básica",
  },
  {
    minScore: 10,
    maxScore: 16,
    categoria: "Substancial",
    prioridade: "Prioridade preferencial",
  },
  {
    minScore: 17,
    maxScore: 25,
    categoria: "Crítico",
    prioridade: "Prioridade máxima",
  },
];

export const APR_PROBABILITY_OPTIONS = [
  { value: "1", label: "1 - Improvável" },
  { value: "2", label: "2 - Remota" },
  { value: "3", label: "3 - Ocasional" },
  { value: "4", label: "4 - Provável" },
  { value: "5", label: "5 - Frequente" },
] as const;

export const APR_SEVERITY_OPTIONS = [
  { value: "1", label: "1 - Insignificante" },
  { value: "2", label: "2 - Menor" },
  { value: "3", label: "3 - Moderada" },
  { value: "4", label: "4 - Grave" },
  { value: "5", label: "5 - Catastrófica" },
] as const;

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
  const rule = APR_RISK_BANDS.find(
    (item) => score >= item.minScore && score <= item.maxScore,
  );

  return {
    score,
    categoria: rule?.categoria ?? "",
    prioridade: rule?.prioridade ?? "",
  };
}
