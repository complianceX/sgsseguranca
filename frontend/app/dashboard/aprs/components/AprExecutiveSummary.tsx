"use client";

import { useMemo } from "react";
import { useWatch, type Control } from "react-hook-form";
import { AlertTriangle, Info, Maximize2, Minimize2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AprFormData } from "./aprForm.schema";
import { useAprCalculations } from "./useAprCalculations";

export type AprExecutiveSummaryVariant = "panel" | "badges" | "breakdown";

type Tone =
  | "neutral"
  | "success"
  | "info"
  | "warning"
  | "danger";

const summaryToneMap: Record<
  Tone,
  { container: string; label: string; value: string }
> = {
  neutral: {
    container:
      "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/22",
    label: "text-[var(--ds-color-text-muted)]",
    value: "text-[var(--ds-color-text-primary)]",
  },
  success: {
    container:
      "border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)]/72",
    label: "text-[var(--color-success)]",
    value: "text-[var(--color-success)]",
  },
  info: {
    container:
      "border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)]/72",
    label: "text-[var(--color-info)]",
    value: "text-[var(--color-info)]",
  },
  warning: {
    container:
      "border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)]/72",
    label: "text-[var(--color-warning)]",
    value: "text-[var(--color-warning)]",
  },
  danger: {
    container:
      "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)]/72",
    label: "text-[var(--color-danger)]",
    value: "text-[var(--color-danger)]",
  },
};

function SummaryMetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: Tone;
}) {
  const styles = summaryToneMap[tone];
  return (
    <div
      className={cn(
        "rounded-[var(--ds-radius-xl)] border px-3 py-3 shadow-[var(--ds-shadow-xs)]",
        styles.container,
      )}
    >
      <p className={cn("text-[10px] font-semibold uppercase tracking-[0.16em]", styles.label)}>
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-black leading-none", styles.value)}>
        {value}
      </p>
    </div>
  );
}

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
        <span className="font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
          Matriz
        </span>
        {riskSummary.aceitavel > 0 && (
          <span className="risk-badge-acceptable rounded-full px-2.5 py-1 text-[10px] font-semibold">
            {riskSummary.aceitavel} Aceitável
          </span>
        )}
        {riskSummary.atencao > 0 && (
          <span className="risk-badge-attention rounded-full px-2.5 py-1 text-[10px] font-semibold">
            {riskSummary.atencao} Atenção
          </span>
        )}
        {riskSummary.substancial > 0 && (
          <span className="risk-badge-substantial rounded-full px-2.5 py-1 text-[10px] font-semibold">
            {riskSummary.substancial} Substancial
          </span>
        )}
        {riskSummary.critico > 0 && (
          <span className="risk-badge-critical rounded-full px-2.5 py-1 text-[10px] font-semibold">
            {riskSummary.critico} Crítico
          </span>
        )}
        {riskSummary.incompletas > 0 && (
          <span className="rounded-full border border-dashed border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-warning)]">
            {riskSummary.incompletas} Incompletas
          </span>
        )}
        {riskSummary.semMedidasPreventivas > 0 && (
          <span className="rounded-full border border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-info)]">
            {riskSummary.semMedidasPreventivas} sem medidas
          </span>
        )}
      </div>
    );
  }

  if (variant === "breakdown") {
    return (
      <div className="mt-4 rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ds-color-surface-muted)_42%,transparent),transparent)] px-4 py-4 shadow-[var(--ds-shadow-xs)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
              Distribuição de riscos
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
              {riskSummary.total} linha(s) na matriz
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-color-text-secondary)]">
            <ShieldCheck className="h-3.5 w-3.5" />
            {riskSummary.prontas} linha(s) pronta(s)
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-7">
          <SummaryMetricCard label="Total" value={riskSummary.total} tone="neutral" />
          <SummaryMetricCard label="Aceitável" value={riskSummary.aceitavel} tone="success" />
          <SummaryMetricCard label="Atenção" value={riskSummary.atencao} tone="info" />
          <SummaryMetricCard
            label="Substancial"
            value={riskSummary.substancial}
            tone="warning"
          />
          <SummaryMetricCard label="Crítico" value={riskSummary.critico} tone="danger" />
          <SummaryMetricCard
            label="Incompletas"
            value={riskSummary.incompletas}
            tone="warning"
          />
          <SummaryMetricCard
            label="Sem medidas"
            value={riskSummary.semMedidasPreventivas}
            tone="info"
          />
        </div>
      </div>
    );
  }

  const isCompact = Boolean(compactMode);

  return (
    <div className="mb-4 overflow-hidden rounded-[calc(var(--ds-radius-xl)+2px)] border border-[var(--ds-color-border-subtle)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ds-color-surface-muted)_55%,transparent),transparent)] shadow-[var(--ds-shadow-sm)]">
      <div className="flex flex-col gap-4 border-b border-[var(--ds-color-border-subtle)] px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
            Resumo executivo da APR
          </p>
          <h3 className="mt-2 text-lg font-black text-[var(--ds-color-text-primary)]">
            Preenchimento com leitura operacional imediata
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ds-color-text-secondary)]">
            Acompanhe criticidade, linhas prontas, pendências e lacunas de controle
            sem sair da grade principal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-color-text-secondary)]">
            <ShieldCheck className="h-3.5 w-3.5" />
            {riskSummary.prontas} linha(s) pronta(s)
          </div>
          <button
            type="button"
            onClick={onToggleCompactMode}
            className="inline-flex items-center gap-1.5 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-xs font-semibold text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]"
            title={isCompact ? "Expandir todas as linhas" : "Modo compacto"}
          >
            {isCompact ? (
              <Maximize2 className="h-3.5 w-3.5" />
            ) : (
              <Minimize2 className="h-3.5 w-3.5" />
            )}
            {isCompact ? "Expandir linhas" : "Modo compacto"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <SummaryMetricCard label="Total de riscos" value={riskSummary.total} tone="neutral" />
        <SummaryMetricCard label="Aceitáveis" value={riskSummary.aceitavel} tone="success" />
        <SummaryMetricCard label="Atenção" value={riskSummary.atencao} tone="info" />
        <SummaryMetricCard
          label="Substanciais"
          value={riskSummary.substancial}
          tone="warning"
        />
        <SummaryMetricCard label="Críticos" value={riskSummary.critico} tone="danger" />
        <SummaryMetricCard
          label="Incompletas"
          value={riskSummary.incompletas}
          tone="warning"
        />
        <SummaryMetricCard
          label="Sem medidas"
          value={riskSummary.semMedidasPreventivas}
          tone="info"
        />
      </div>

      {(riskSummary.critico > 0 ||
        riskSummary.incompletas > 0 ||
        riskSummary.semMedidasPreventivas > 0) && (
        <div className="grid gap-3 border-t border-[var(--ds-color-border-subtle)] px-4 py-4 lg:grid-cols-3">
          {riskSummary.critico > 0 && (
            <div className="flex items-start gap-2 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-3 py-3 text-sm font-semibold text-[var(--color-danger)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {riskSummary.critico} risco(s) crítico(s) exigem ação imediata.
            </div>
          )}
          {riskSummary.incompletas > 0 && (
            <div className="flex items-start gap-2 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-3 py-3 text-sm font-semibold text-[var(--color-warning)]">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              {riskSummary.incompletas} linha(s) ainda sem matriz completa.
            </div>
          )}
          {riskSummary.semMedidasPreventivas > 0 && (
            <div className="flex items-start gap-2 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] px-3 py-3 text-sm font-semibold text-[var(--color-info)]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              {riskSummary.semMedidasPreventivas} linha(s) sem medida preventiva descrita.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
