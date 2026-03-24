"use client";

import { useMemo } from "react";
import { calculateAprRiskEvaluation } from "@/lib/apr-risk-matrix";

export type AprRiskCategoria =
  | "Aceitável"
  | "Atenção"
  | "Substancial"
  | "Crítico";

export type AprActionCriteriaVariant = "short" | "long";

const ACTION_CRITERIA_SHORT: Record<AprRiskCategoria, string> = {
  "Aceitável": "Não são requeridos controles adicionais.",
  "Atenção": "Reavaliar e adotar medidas complementares.",
  "Substancial": "Não iniciar sem redução de risco.",
  "Crítico": "Interromper e agir imediatamente.",
};

const ACTION_CRITERIA_LONG: Record<AprRiskCategoria, string> = {
  "Aceitável":
    "Não são requeridos controles adicionais. Condição dentro dos parâmetros.",
  "Atenção":
    "Reavaliar periodicamente e adotar medidas complementares quando necessário.",
  "Substancial":
    "Trabalho não deve ser iniciado/continuado sem redução de risco e controles eficazes.",
  "Crítico":
    "Interromper o processo e implementar ações imediatas antes da execução.",
};

export type AprRiskEvaluation = ReturnType<typeof calculateAprRiskEvaluation> & {
  actionCriteria?: string;
};

export type AprRiskSummary = {
  total: number;
  aceitavel: number;
  atencao: number;
  substancial: number;
  critico: number;
  incompletas: number;
  semMedidasPreventivas: number;
  prontas: number;
};

export function getCategoriaBadgeClass(categoria?: string) {
  switch (categoria) {
    case "Aceitável":
      return "risk-badge-acceptable";
    case "Atenção":
      return "risk-badge-attention";
    case "Substancial":
      return "risk-badge-substantial";
    case "Crítico":
      return "risk-badge-critical";
    default:
      return "bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]";
  }
}

export function getPrioridadeBadgeClass(prioridade?: string) {
  switch (prioridade) {
    case "Prioridade máxima":
      return "border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--color-danger)]";
    case "Prioridade preferencial":
      return "border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--color-warning)]";
    case "Prioridade básica":
      return "border border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)]";
    case "Não prioritário":
      return "border border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]";
    default:
      return "border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]";
  }
}

function asCategoria(value?: string): AprRiskCategoria | null {
  switch (value) {
    case "Aceitável":
    case "Atenção":
    case "Substancial":
    case "Crítico":
      return value;
    default:
      return null;
  }
}

export function getActionCriteriaText(
  categoria?: string,
  variant: AprActionCriteriaVariant = "short",
) {
  const normalized = asCategoria(categoria);
  if (!normalized) return undefined;
  return variant === "long"
    ? ACTION_CRITERIA_LONG[normalized]
    : ACTION_CRITERIA_SHORT[normalized];
}

export function evaluateAprRisk(
  probabilidade: string,
  severidade: string,
): AprRiskEvaluation {
  const calc = calculateAprRiskEvaluation(probabilidade, severidade);
  return {
    ...calc,
    actionCriteria: getActionCriteriaText(calc.categoria, "short"),
  };
}

type SummaryItem = {
  probabilidade?: string;
  severidade?: string;
  medidas_prevencao?: string;
  atividade_processo?: string;
  agente_ambiental?: string;
  condicao_perigosa?: string;
  fontes_circunstancias?: string;
  possiveis_lesoes?: string;
};

function hasMeaningfulContent(item?: SummaryItem | null) {
  return Boolean(
    item?.atividade_processo ||
      item?.agente_ambiental ||
      item?.condicao_perigosa ||
      item?.fontes_circunstancias ||
      item?.possiveis_lesoes ||
      item?.probabilidade ||
      item?.severidade ||
      item?.medidas_prevencao,
  );
}

export function computeAprRiskSummary(
  items: SummaryItem[] | null,
): AprRiskSummary {
  const summary: AprRiskSummary = {
    total: 0,
    aceitavel: 0,
    atencao: 0,
    substancial: 0,
    critico: 0,
    incompletas: 0,
    semMedidasPreventivas: 0,
    prontas: 0,
  };

  (items ?? []).forEach((item) => {
    const started = hasMeaningfulContent(item);

    if (!started) {
      return;
    }

    summary.total += 1;

    const p = String(item?.probabilidade || "");
    const s = String(item?.severidade || "");
    const hasEvaluation = Boolean(p && s);
    const hasMeasures = Boolean(String(item?.medidas_prevencao || "").trim());
    const hasIdentification = Boolean(
      item?.atividade_processo ||
        item?.agente_ambiental ||
        item?.condicao_perigosa ||
        item?.fontes_circunstancias ||
        item?.possiveis_lesoes,
    );
    if (!hasEvaluation) {
      summary.incompletas += 1;
    }

    if (started && !hasMeasures) {
      summary.semMedidasPreventivas += 1;
    }

    if (hasIdentification && hasEvaluation && hasMeasures) {
      summary.prontas += 1;
    }

    if (!hasEvaluation) {
      return;
    }

    const calc = calculateAprRiskEvaluation(p, s);
    switch (calc.categoria) {
      case "Aceitável":
        summary.aceitavel += 1;
        break;
      case "Atenção":
        summary.atencao += 1;
        break;
      case "Substancial":
        summary.substancial += 1;
        break;
      case "Crítico":
        summary.critico += 1;
        break;
    }
  });

  return summary;
}

export function useAprCalculations() {
  return useMemo(
    () => ({
      evaluateRisk: evaluateAprRisk,
      computeRiskSummary: computeAprRiskSummary,
      getActionCriteriaText,
      getCategoriaBadgeClass,
      getPrioridadeBadgeClass,
    }),
    [],
  );
}
