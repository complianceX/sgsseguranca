"use client";

import { useEffect, useMemo, useState } from "react";
import { isBefore } from "date-fns";
import { ShieldCheck } from "lucide-react";
import {
  dashboardService,
  type DashboardPendingQueueResponse,
  type DashboardSummaryResponse,
} from "@/services/dashboardService";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import { isTemporarilyVisibleDashboardRoute } from "@/lib/temporarilyHiddenModules";

const EMPTY_PENDING_QUEUE: DashboardPendingQueueResponse = {
  degraded: false,
  failedSources: [],
  summary: {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    documents: 0,
    health: 0,
    actions: 0,
  },
  items: [],
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function resolveComplianceLabel(score: number | null) {
  if (score == null) return "Calculando";
  if (score >= 85) return "Excelente";
  if (score >= 70) return "Controlado";
  if (score >= 50) return "Atenção";
  return "Crítico";
}

function resolveComplianceTone(score: number | null) {
  if (score == null) return "info";
  if (score >= 85) return "success";
  if (score >= 70) return "info";
  if (score >= 50) return "warning";
  return "danger";
}

function resolveComplianceStroke(score: number | null) {
  if (score == null) return "var(--ds-color-border-default)";
  if (score >= 85) return "var(--ds-color-success)";
  if (score >= 70) return "var(--ds-color-info)";
  if (score >= 50) return "var(--ds-color-warning)";
  return "var(--ds-color-danger)";
}

function resolveComplianceMessage(score: number | null) {
  if (score == null) return "Consolidando dados de conformidade da empresa.";
  if (score >= 85)
    return "Excelente aderência operacional. Mantenha o ritmo e a rastreabilidade.";
  if (score >= 70)
    return "Nível controlado. Pequenos ajustes elevam o desempenho rapidamente.";
  if (score >= 50)
    return "Ponto de atenção. Priorize regularizações para reduzir exposição.";
  return "Cenário crítico. Recomendado plano de ação imediato e acompanhamento diário.";
}

function resolveToneClasses(score: number | null) {
  if (score == null) {
    return "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]";
  }
  if (score >= 85) {
    return "border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)]";
  }
  if (score >= 70) {
    return "border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)]";
  }
  if (score >= 50) {
    return "border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)]";
  }
  return "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)]";
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expiringEpis, setExpiringEpis] = useState<
    DashboardSummaryResponse["expiringEpis"]
  >([]);
  const [expiringTrainings, setExpiringTrainings] = useState<
    DashboardSummaryResponse["expiringTrainings"]
  >([]);
  const [pendingQueue, setPendingQueue] =
    useState<DashboardPendingQueueResponse>(EMPTY_PENDING_QUEUE);

  const showEpiModule = isTemporarilyVisibleDashboardRoute("/dashboard/epis");
  const showTrainingModule = isTemporarilyVisibleDashboardRoute(
    "/dashboard/trainings",
  );

  useEffect(() => {
    let active = true;

    async function loadDashboardData() {
      try {
        const [summaryR, pendingQueueR] = await Promise.allSettled([
          dashboardService.getSummary(),
          dashboardService.getPendingQueue(),
        ]);

        if (!active) return;

        const failedSummary = summaryR.status === "rejected";
        const failedQueue = pendingQueueR.status === "rejected";

        if (summaryR.status === "fulfilled") {
          setExpiringEpis(summaryR.value.expiringEpis || []);
          setExpiringTrainings(summaryR.value.expiringTrainings || []);
        }

        if (pendingQueueR.status === "fulfilled") {
          setPendingQueue(pendingQueueR.value);
        } else {
          setPendingQueue(EMPTY_PENDING_QUEUE);
        }

        if (failedSummary || failedQueue) {
          setLoadError(
            "Não foi possível carregar todos os dados do score. Exibindo modo resumido.",
          );
        } else {
          setLoadError(null);
        }
      } catch (error) {
        if (!active) return;
        console.error("Erro ao carregar score de conformidade:", error);
        setLoadError("Falha ao carregar o score de conformidade.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDashboardData();

    return () => {
      active = false;
    };
  }, []);

  const expiredEpisCount = useMemo(
    () =>
      expiringEpis.filter((epi) =>
        isBefore(new Date(epi.validade_ca || ""), new Date()),
      ).length,
    [expiringEpis],
  );

  const expiredTrainingsCount = useMemo(
    () =>
      expiringTrainings.filter((training) =>
        isBefore(new Date(training.data_vencimento), new Date()),
      ).length,
    [expiringTrainings],
  );

  const complianceScore = useMemo(() => {
    if (loading) {
      return null;
    }

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
    expiredEpisCount,
    expiredTrainingsCount,
    loading,
    pendingQueue.summary.critical,
    pendingQueue.summary.high,
    pendingQueue.summary.total,
    showEpiModule,
    showTrainingModule,
  ]);

  const complianceLabel = useMemo(
    () => resolveComplianceLabel(complianceScore),
    [complianceScore],
  );

  const complianceTone = useMemo(
    () => resolveComplianceTone(complianceScore),
    [complianceScore],
  );

  const complianceCircle = useMemo(() => {
    const size = 240;
    const strokeWidth = 16;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const score = complianceScore ?? 0;
    const progress = score / 100;
    const strokeDashoffset = circumference * (1 - progress);

    const angle = progress * 2 * Math.PI - Math.PI / 2;
    const dotX = size / 2 + radius * Math.cos(angle);
    const dotY = size / 2 + radius * Math.sin(angle);

    return {
      size,
      radius,
      strokeWidth,
      circumference,
      strokeDashoffset,
      score,
      dotX,
      dotY,
      strokeColor: resolveComplianceStroke(complianceScore),
    };
  }, [complianceScore]);

  return (
    <div className="ds-dashboard-shell">
      <section className="ds-dashboard-panel overflow-hidden p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Score de Conformidade
            </p>
            <h1 className="mt-2 text-2xl font-bold text-[var(--ds-color-text-primary)]">
              Painel único de conformidade
            </h1>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Visão executiva simplificada para acompanhar o desempenho geral da
              empresa.
            </p>
          </div>
          <StatusPill tone={complianceTone}>{complianceLabel}</StatusPill>
        </div>

        {loadError ? (
          <div className="mt-4 rounded-xl border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-4 py-3 text-sm text-[var(--ds-color-warning)]">
            {loadError}
          </div>
        ) : null}

        <div
          className={cn(
            "mt-6 rounded-2xl border p-5 sm:p-6",
            resolveToneClasses(complianceScore),
          )}
        >
          <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
            <div
              className="relative mx-auto h-64 w-64"
              role="img"
              aria-label={
                complianceScore == null
                  ? "Conformidade em cálculo"
                  : `Conformidade da empresa em ${complianceScore}%`
              }
            >
              <div className="absolute inset-4 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.92)_20%,_rgba(255,255,255,0)_70%)]" />
              <svg
                viewBox={`0 0 ${complianceCircle.size} ${complianceCircle.size}`}
                className="h-full w-full -rotate-90"
              >
                <defs>
                  <linearGradient
                    id="compliance-ring-gradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop
                      offset="0%"
                      stopColor={complianceCircle.strokeColor}
                      stopOpacity="0.65"
                    />
                    <stop
                      offset="100%"
                      stopColor={complianceCircle.strokeColor}
                      stopOpacity="1"
                    />
                  </linearGradient>
                </defs>
                <circle
                  cx={complianceCircle.size / 2}
                  cy={complianceCircle.size / 2}
                  r={complianceCircle.radius}
                  fill="none"
                  stroke="var(--ds-color-border-subtle)"
                  strokeWidth={complianceCircle.strokeWidth}
                  opacity="0.45"
                />
                <circle
                  cx={complianceCircle.size / 2}
                  cy={complianceCircle.size / 2}
                  r={complianceCircle.radius}
                  fill="none"
                  stroke="url(#compliance-ring-gradient)"
                  strokeWidth={complianceCircle.strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${complianceCircle.circumference} ${complianceCircle.circumference}`}
                  strokeDashoffset={complianceCircle.strokeDashoffset}
                  style={{
                    transition: "stroke-dashoffset 500ms ease, stroke 500ms ease",
                    filter: `drop-shadow(0 0 10px ${complianceCircle.strokeColor})`,
                  }}
                />
                {complianceScore != null ? (
                  <circle
                    cx={complianceCircle.dotX}
                    cy={complianceCircle.dotY}
                    r="7"
                    fill={complianceCircle.strokeColor}
                    stroke="white"
                    strokeWidth="2"
                  />
                ) : null}
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-5xl font-bold leading-none text-[var(--ds-color-text-primary)]">
                  {complianceScore == null ? "—" : complianceCircle.score}
                </p>
                <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                  %
                </p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
                Índice Geral
              </p>
              <p className="mt-2 text-4xl font-bold text-[var(--ds-color-text-primary)]">
                {complianceScore == null ? "—" : `${complianceScore}/100`}
              </p>
              <p className="mt-3 max-w-2xl text-sm text-[var(--ds-color-text-secondary)]">
                {resolveComplianceMessage(complianceScore)}
              </p>

              <div className="mt-5">
                <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--ds-color-surface-base)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${complianceCircle.score}%`,
                      background: `linear-gradient(90deg, ${complianceCircle.strokeColor}99 0%, ${complianceCircle.strokeColor} 100%)`,
                      transition: "width 500ms ease",
                    }}
                  />
                </div>
              </div>

              <p className="mt-4 text-xs text-[var(--ds-color-text-muted)]">
                Atualizado automaticamente com base em pendências e vencimentos
                de conformidade do ambiente.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="mt-5 flex items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent" />
          </div>
        ) : null}
      </section>
    </div>
  );
}
