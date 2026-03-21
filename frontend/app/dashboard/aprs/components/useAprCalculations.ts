"use client";

import { useCallback, useMemo } from "react";
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

export function useAprCalculations() {
  const shortCriteria = useMemo(() => ACTION_CRITERIA_SHORT, []);
  const longCriteria = useMemo(() => ACTION_CRITERIA_LONG, []);

  const getActionCriteriaText = useCallback(
    (categoria?: string, variant: AprActionCriteriaVariant = "short") => {
      const normalized = asCategoria(categoria);
      if (!normalized) return undefined;
      return variant === "long"
        ? longCriteria[normalized]
        : shortCriteria[normalized];
    },
    [longCriteria, shortCriteria],
  );

  const evaluateRisk = useCallback(
    (probabilidade: string, severidade: string): AprRiskEvaluation => {
      const calc = calculateAprRiskEvaluation(probabilidade, severidade);
      return {
        ...calc,
        actionCriteria: getActionCriteriaText(calc.categoria, "short"),
      };
    },
    [getActionCriteriaText],
  );

  const computeRiskSummary = useCallback(
    (
      items: Array<{ probabilidade?: string; severidade?: string }> | null,
    ): AprRiskSummary => {
      const summary: AprRiskSummary = {
        total: 0,
        aceitavel: 0,
        atencao: 0,
        substancial: 0,
        critico: 0,
        incompletas: 0,
      };

      (items ?? []).forEach((item) => {
        summary.total += 1;
        const p = String(item?.probabilidade || "");
        const s = String(item?.severidade || "");
        if (!p || !s) {
          summary.incompletas += 1;
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
    },
    [],
  );

  return {
    evaluateRisk,
    computeRiskSummary,
    getActionCriteriaText,
    getCategoriaBadgeClass,
  };
}

