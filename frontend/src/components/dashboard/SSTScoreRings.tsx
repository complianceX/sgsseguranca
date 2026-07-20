"use client";

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { UseDashboardDataResult } from "@/hooks/useDashboardData";
import { isTemporarilyVisibleDashboardRoute } from "@/lib/temporarilyHiddenModules";
import { DashboardSectionBoundary } from "@/components/dashboard/DashboardSectionBoundary";
import {
  calcComplianceScore,
  resolveComplianceLabel,
  resolveComplianceMessage,
} from "@/lib/dashboard/compliance";
import { parseValidDate } from "@/lib/dashboard/utils";

const EMPTY_LIST: never[] = [];
const EMPTY_RISK_SUMMARY = { alto: 0, medio: 0, baixo: 0 };

function resolveScoreClasses(
  score: number | null,
): { stroke: string; text: string } {
  if (score == null) {
    return {
      stroke: "stroke-[var(--ds-color-border-strong)]",
      text: "text-[var(--ds-color-text-secondary)]",
    };
  }
  if (score >= 85) {
    return {
      stroke: "stroke-[var(--ds-color-success)]",
      text: "text-[var(--ds-color-success)]",
    };
  }
  if (score >= 70) {
    return {
      stroke: "stroke-[var(--ds-color-info)]",
      text: "text-[var(--ds-color-info)]",
    };
  }
  if (score >= 50) {
    return {
      stroke: "stroke-[var(--ds-color-warning)]",
      text: "text-[var(--ds-color-warning)]",
    };
  }
  return {
    stroke: "stroke-[var(--ds-color-danger)]",
    text: "text-[var(--ds-color-danger)]",
  };
}

const ScoreRing = memo(function ScoreRing({ score }: { score: number | null }) {
  const strokeWidth = 9;
  const size = 132;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (score ?? 0) / 100);
  const { stroke: strokeClass, text: textClass } = resolveScoreClasses(score);

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score de conformidade: ${score ?? "calculando"} pontos`}
    >
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
        <p className={cn("text-[26px] font-black leading-none tabular-nums", textClass)}>
          {score == null ? "—" : score}
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ds-color-text-secondary)]">
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

function SSTScoreRingsComponent({
  dashboardData,
}: {
  dashboardData: UseDashboardDataResult;
}) {
  const showEpiModule = isTemporarilyVisibleDashboardRoute("/dashboard/epis");
  const showTrainingModule = isTemporarilyVisibleDashboardRoute("/dashboard/trainings");
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

  const complianceScore = useMemo(
    () =>
      calcComplianceScore({
        loading,
        pendingSummary: pendingQueue.summary,
        expiredEpisCount,
        expiredTrainingsCount,
        includeEpiPenalty: showEpiModule,
        includeTrainingPenalty: showTrainingModule,
      }),
    [loading, pendingQueue.summary, expiredEpisCount, expiredTrainingsCount, showEpiModule, showTrainingModule],
  );

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
          className="overflow-hidden rounded-lg border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]"
        >
          <div className="border-b border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] px-4 py-3.5 sm:px-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
              Score de Conformidade
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 px-5 py-5">
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
        className="overflow-hidden rounded-lg border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]"
      >
        <div className="border-b border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] px-4 py-3.5 sm:px-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
            Distribuição de Riscos
          </p>
        </div>
        <div className="space-y-3.5 px-4 py-3.5 sm:px-5">
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
        className="overflow-hidden rounded-lg border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]"
      >
        <div className="border-b border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] px-4 py-3.5 sm:px-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
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
