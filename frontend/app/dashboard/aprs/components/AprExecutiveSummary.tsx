"use client";

import { useMemo } from "react";
import { useWatch, type Control } from "react-hook-form";
import { AlertTriangle, Info, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AprFormData } from "./aprForm.schema";
import { useAprCalculations } from "./useAprCalculations";

export type AprExecutiveSummaryVariant = "panel" | "badges" | "breakdown";

export function AprExecutiveSummary({
  control,
  variant,
  compactMode,
  onToggleCompactMode,
}: {
  control: Control<AprFormData>;
  variant: AprExecutiveSummaryVariant;
  compactMode?: boolean;
  onToggleCompactMode?: () => void;
}) {
  const { computeRiskSummary } = useAprCalculations();
  const riskItems = useWatch({ control, name: "itens_risco", defaultValue: [] });

  const riskSummary = useMemo(
    () => computeRiskSummary(riskItems ?? []),
    [computeRiskSummary, riskItems],
  );

  if (riskSummary.total <= 0) return null;

  if (variant === "badges") {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[var(--ds-color-text-muted)]">
          Riscos:
        </span>
        {riskSummary.aceitavel > 0 && (
          <span className="risk-badge-acceptable rounded-full px-2 py-0.5 text-[10px] font-semibold">
            {riskSummary.aceitavel} Aceitável
          </span>
        )}
        {riskSummary.atencao > 0 && (
          <span className="risk-badge-attention rounded-full px-2 py-0.5 text-[10px] font-semibold">
            {riskSummary.atencao} Atenção
          </span>
        )}
        {riskSummary.substancial > 0 && (
          <span className="risk-badge-substantial rounded-full px-2 py-0.5 text-[10px] font-semibold">
            {riskSummary.substancial} Substancial
          </span>
        )}
        {riskSummary.critico > 0 && (
          <span className="risk-badge-critical rounded-full px-2 py-0.5 text-[10px] font-semibold">
            {riskSummary.critico} Crítico
          </span>
        )}
        {riskSummary.incompletas > 0 && (
          <span className="rounded-full border border-dashed border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-warning)]">
            {riskSummary.incompletas} Incompleta(s)
          </span>
        )}
      </div>
    );
  }

  if (variant === "breakdown") {
    return (
      <div className="mt-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
          Distribuição de riscos
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
            <strong>{riskSummary.aceitavel}</strong>
            <span className="text-xs text-[var(--ds-color-text-muted)]">
              Aceitável
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-info)]" />
            <strong>{riskSummary.atencao}</strong>
            <span className="text-xs text-[var(--ds-color-text-muted)]">
              Atenção
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-warning)]" />
            <strong>{riskSummary.substancial}</strong>
            <span className="text-xs text-[var(--ds-color-text-muted)]">
              Substancial
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-danger)]" />
            <strong>{riskSummary.critico}</strong>
            <span className="text-xs text-[var(--ds-color-text-muted)]">
              Crítico
            </span>
          </span>
          {riskSummary.incompletas > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--color-warning)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              <strong>{riskSummary.incompletas}</strong>
              <span className="text-xs">Incompletas</span>
            </span>
          )}
        </div>
        {riskSummary.critico > 0 && (
          <p className="mt-2 text-xs font-semibold text-[var(--color-danger)]">
            {riskSummary.critico} risco(s) crítico(s) identificado(s) — verifique
            as medidas de controle antes de prosseguir.
          </p>
        )}
      </div>
    );
  }

  const isCompact = Boolean(compactMode);
  return (
    <div className="mb-4 rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
            Resumo executivo da matriz
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
            {riskSummary.total} risco(s) identificado(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleCompactMode}
            className="inline-flex items-center gap-1.5 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--color-card)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-card-muted)]"
            title={isCompact ? "Expandir todas as linhas" : "Modo compacto"}
          >
            {isCompact ? (
              <Maximize2 className="h-3.5 w-3.5" />
            ) : (
              <Minimize2 className="h-3.5 w-3.5" />
            )}
            {isCompact ? "Expandir" : "Compactar"}
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-[var(--ds-radius-lg)] bg-[color:var(--color-card-muted)]/18 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
            Total
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--ds-color-text-primary)]">
            {riskSummary.total}
          </p>
        </div>
        <div className="rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-success-subtle)] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-success)]">
            Aceitável
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--color-success)]">
            {riskSummary.aceitavel}
          </p>
        </div>
        <div className="rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-info-subtle)] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-info)]">
            Atenção
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--color-info)]">
            {riskSummary.atencao}
          </p>
        </div>
        <div className="rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-warning-subtle)] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-warning)]">
            Substancial
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--color-warning)]">
            {riskSummary.substancial}
          </p>
        </div>
        <div className="rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-danger-subtle)] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-danger)]">
            Crítico
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--color-danger)]">
            {riskSummary.critico}
          </p>
        </div>
        {riskSummary.incompletas > 0 && (
          <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-warning)]">
              Incompletas
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--color-warning)]">
              {riskSummary.incompletas}
            </p>
          </div>
        )}
      </div>
      {riskSummary.critico > 0 && (
        <p className="mt-3 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-3 py-2 text-sm font-semibold text-[var(--color-danger)]">
          {riskSummary.critico} risco(s) crítico(s) — interrompa o processo e
          implemente ações imediatas.
        </p>
      )}
      {riskSummary.incompletas > 0 && (
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-2 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-3 py-2 text-xs font-semibold text-[var(--color-warning)]",
          )}
        >
          <Info className="h-3.5 w-3.5 shrink-0" />
          {riskSummary.incompletas} linha(s) sem probabilidade/severidade
          preenchidas.
        </div>
      )}
    </div>
  );
}

