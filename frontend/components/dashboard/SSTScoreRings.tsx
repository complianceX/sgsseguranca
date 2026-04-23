"use client";

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/hooks/useDashboardData";
import { isTemporarilyVisibleDashboardRoute } from "@/lib/temporarilyHiddenModules";
import { DashboardSectionBoundary } from "@/components/dashboard/DashboardSectionBoundary";

function clampScore(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function resolveComplianceLabel(score: number | null) {
  if (score == null) return "Calculando";
  if (score >= 85) return "Excelente";
  if (score >= 70) return "Controlado";
  if (score >= 50) return "Atenção";
  return "Crítico";
}

function resolveComplianceMessage(score: number | null) {
  if (score == null) return "Consolidando dados de conformidade.";
  if (score >= 85) return "Excelente aderência operacional. Mantenha o ritmo.";
  if (score >= 70) return "Pequenos ajustes elevarão o desempenho.";
  if (score >= 50) return "Priorize regularizações para reduzir exposição.";
  return "Plano de ação imediato recomendado.";
}

function parseValidDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const EMPTY_LIST: never[] = [];
const EMPTY_RISK_SUMMARY = { alto: 0, medio: 0, baixo: 0 };

function resolveScoreClasses(
  score: number | null,
): { stroke: string; text: string; glow: string } {
  if (score == null) {
    return {
      stroke: "stroke-[var(--ds-color-border-strong)]",
      text: "text-[var(--ds-color-text-secondary)]",
      glow: "transparent",
    };
  }
  if (score >= 85) {
    return {
      stroke: "stroke-[var(--ds-color-success)]",
      text: "text-[var(--ds-color-success)]",
      glow: "var(--ds-color-success)",
    };
  }
  if (score >= 70) {
    return {
      stroke: "stroke-[var(--ds-color-info)]",
      text: "text-[var(--ds-color-info)]",
      glow: "var(--ds-color-info)",
    };
  }
  if (score >= 50) {
    return {
      stroke: "stroke-[var(--ds-color-warning)]",
      text: "text-[var(--ds-color-warning)]",
      glow: "var(--ds-color-warning)",
    };
  }
  return {
    stroke: "stroke-[var(--ds-color-danger)]",
    text: "text-[var(--ds-color-danger)]",
    glow: "var(--ds-color-danger)",
  };
}

const ScoreRing = memo(function ScoreRing({ score }: { score: number | null }) {
  const strokeWidth = 10;
  const size = 156;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (score ?? 0) / 100);
  const { stroke: strokeClass, text: textClass, glow } = resolveScoreClasses(score);

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score de conformidade: ${score ?? "calculando"} pontos`}
    >
      {score != null && (
        <div
          className="absolute inset-4 rounded-full opacity-15 blur-2xl"
          style={{ background: glow }}
          aria-hidden="true"
        />
      )}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="relative h-full w-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-[var(--ds-color-surface-muted)]"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={cn(
            strokeClass,
            "motion-safe:[transition:stroke-dashoffset_900ms_cubic-bezier(0.4,0,0.2,1),stroke_600ms_ease]",
          )}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className={cn("text-[28px] font-black leading-none tracking-tight", textClass)}>
          {score == null ? "—" : score}
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--ds-color-text-secondary)]">
          pontos
        </p>
      </div>
    </div>
  );
});

const ProgressBar = memo(function ProgressBar({
  pct,
  colorClass,
  ariaLabel,
}: {
  pct: number;
  colorClass: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-[var(--ds-color-surface-muted)]"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div
        className={cn(
          "h-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-700 ease-out",
          colorClass,
        )}
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  );
});

function SSTScoreRingsComponent() {
  const showEpiModule = isTemporarilyVisibleDashboardRoute("/dashboard/epis");
  const showTrainingModule = isTemporarilyVisibleDashboardRoute("/dashboard/trainings");

  const dashboardData = useDashboardData();
  const summaryLoading = dashboardData.summary.loading;
  const queueLoading = dashboardData.pendingQueue.loading;
  const summary = dashboardData.summary.data;
  const pendingQueue = dashboardData.pendingQueue.data;

  const expiringEpis = summary?.expiringEpis ?? EMPTY_LIST;
  const expiringTrainings = summary?.expiringTrainings ?? EMPTY_LIST;
  const riskSummary = summary?.riskSummary ?? EMPTY_RISK_SUMMARY;

  const loading = summaryLoading || queueLoading;

  const expiredEpisCount = useMemo(() => {
    const now = Date.now();
    return expiringEpis.filter((e) => {
      const d = parseValidDate(e.validade_ca);
      return d ? d.getTime() < now : false;
    }).length;
  }, [expiringEpis]);

  const expiredTrainingsCount = useMemo(() => {
    const now = Date.now();
    return expiringTrainings.filter((t) => {
      const d = parseValidDate(t.data_vencimento);
      return d ? d.getTime() < now : false;
    }).length;
  }, [expiringTrainings]);

  const complianceScore = useMemo(() => {
    if (loading) return null;
    const criticalPenalty = Math.min(40, pendingQueue.summary.critical * 8);
    const highPenalty = Math.min(18, pendingQueue.summary.high * 2.5);
    const totalPenalty = Math.min(
      14,
      Math.max(0, pendingQueue.summary.total - 5) * 1.2,
    );
    const epiPenalty = showEpiModule ? Math.min(14, expiredEpisCount * 3.5) : 0;
    const trainingPenalty = showTrainingModule
      ? Math.min(14, expiredTrainingsCount * 3.5)
      : 0;
    return clampScore(
      100 -
        criticalPenalty -
        highPenalty -
        totalPenalty -
        epiPenalty -
        trainingPenalty,
    );
  }, [
    loading,
    pendingQueue.summary,
    expiredEpisCount,
    expiredTrainingsCount,
    showEpiModule,
    showTrainingModule,
  ]);

  const complianceTone =
    complianceScore == null
      ? "neutral"
      : complianceScore >= 85
        ? "success"
        : complianceScore >= 70
          ? "info"
          : complianceScore >= 50
            ? "warning"
            : "danger";

  const riskTotal = riskSummary.alto + riskSummary.medio + riskSummary.baixo;

  return (
    <div className="flex flex-col gap-5">
      <DashboardSectionBoundary fallbackTitle="Score SST">
        <section
          aria-label="Score de conformidade geral"
          className="overflow-hidden rounded-2xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]"
        >
          <div className="border-b border-[var(--ds-color-border-default)] bg-gradient-to-r from-[var(--ds-color-surface-muted)] to-[var(--ds-color-surface-base)] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
              Score de Conformidade
            </p>
          </div>
          <div className="flex flex-col items-center gap-4 px-5 py-6">
            <ScoreRing score={complianceScore} />
            <div className="flex flex-col items-center gap-2 text-center">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold",
                  complianceTone === "success" &&
                    "bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success-fg)]",
                  complianceTone === "info" &&
                    "bg-[var(--ds-color-info-subtle)] text-[var(--ds-color-info-fg)]",
                  complianceTone === "warning" &&
                    "bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning-fg)]",
                  complianceTone === "danger" &&
                    "bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger-fg)]",
                  complianceTone === "neutral" &&
                    "bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]",
                )}
              >
                {resolveComplianceLabel(complianceScore)}
              </span>
              <p className="max-w-[200px] text-xs leading-relaxed text-[var(--ds-color-text-secondary)]">
                {resolveComplianceMessage(complianceScore)}
              </p>
            </div>
          </div>
        </section>
      </DashboardSectionBoundary>

      <section
        aria-label="Distribuição de riscos"
        className="overflow-hidden rounded-2xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]"
      >
        <div className="border-b border-[var(--ds-color-border-default)] bg-gradient-to-r from-[var(--ds-color-surface-muted)] to-[var(--ds-color-surface-base)] px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
            Distribuição de Riscos
          </p>
        </div>
        <div className="space-y-3.5 px-5 py-4">
          {[
            {
              label: "Alto",
              value: riskSummary.alto,
              bar: "bg-[var(--ds-color-danger)]",
              dot: "bg-[var(--ds-color-danger)]",
              text: "text-[var(--ds-color-danger)]",
            },
            {
              label: "Médio",
              value: riskSummary.medio,
              bar: "bg-[var(--ds-color-warning)]",
              dot: "bg-[var(--ds-color-warning)]",
              text: "text-[var(--ds-color-warning)]",
            },
            {
              label: "Baixo",
              value: riskSummary.baixo,
              bar: "bg-[var(--ds-color-success)]",
              dot: "bg-[var(--ds-color-success)]",
              text: "text-[var(--ds-color-success)]",
            },
          ].map(({ label, value, bar, dot, text }) => {
            const pct = riskTotal > 0 ? Math.round((value / riskTotal) * 100) : 0;
            return (
              <div key={label}>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden="true" />
                    <span className="text-xs font-semibold text-[var(--ds-color-text-primary)]">
                      {label}
                    </span>
                  </div>
                  <span className={cn("text-xs font-bold tabular-nums", text)}>
                    {value}
                    <span className="ml-1 font-normal text-[var(--ds-color-text-secondary)]">
                      ({pct}%)
                    </span>
                  </span>
                </div>
                <ProgressBar
                  pct={pct}
                  colorClass={bar}
                  ariaLabel={`Risco ${label}: ${value} itens, ${pct}%`}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section
        aria-label="Fila por categoria"
        className="overflow-hidden rounded-2xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]"
      >
        <div className="border-b border-[var(--ds-color-border-default)] bg-gradient-to-r from-[var(--ds-color-surface-muted)] to-[var(--ds-color-surface-base)] px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
            Fila por Categoria
          </p>
        </div>
        <div className="space-y-1.5 p-3">
          {(() => {
            const cats = [
              {
                label: "Documentos",
                value: pendingQueue.summary.documents,
                color: "bg-[var(--ds-color-info)]",
              },
              {
                label: "Saúde Ocupacional",
                value: pendingQueue.summary.health,
                color: "bg-[var(--ds-color-success)]",
              },
              {
                label: "Ações Corretivas",
                value: pendingQueue.summary.actions,
                color: "bg-[var(--ds-color-warning)]",
              },
            ];
            const catTotal = cats.reduce((s, c) => s + c.value, 0);
            return cats.map(({ label, value, color }) => {
              const pct = catTotal > 0 ? Math.round((value / catTotal) * 100) : 0;
              return (
                <div
                  key={label}
                  className="rounded-xl px-3 py-2.5 motion-safe:transition-colors hover:bg-[var(--ds-color-surface-muted)]"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--ds-color-text-secondary)]">
                      {label}
                    </span>
                    <span
                      className={cn(
                        "min-w-[22px] rounded-md px-1.5 py-0.5 text-center text-xs font-bold tabular-nums",
                        value > 0
                          ? "bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning-fg)]"
                          : "text-[var(--ds-color-text-secondary)]",
                      )}
                    >
                      {value}
                    </span>
                  </div>
                  <ProgressBar
                    pct={pct}
                    colorClass={cn(color, "opacity-70")}
                    ariaLabel={`${label}: ${value} itens, ${pct}%`}
                  />
                </div>
              );
            });
          })()}
        </div>
      </section>
    </div>
  );
}

export const SSTScoreRings = memo(SSTScoreRingsComponent);
