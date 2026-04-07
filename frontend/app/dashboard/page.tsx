"use client";

import { useEffect, useMemo, useState } from "react";
import {
  isBefore,
  format,
  isToday,
  isTomorrow,
  differenceInDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import {
  dashboardService,
  type DashboardPendingQueueResponse,
  type DashboardSummaryResponse,
} from "@/services/dashboardService";
import { useAuth } from "@/context/AuthContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { cn } from "@/lib/utils";
import { isTemporarilyVisibleDashboardRoute } from "@/lib/temporarilyHiddenModules";

// ─── Constants ────────────────────────────────────────────────────────────────

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
    slaBreached: 0,
    slaDueToday: 0,
    slaDueSoon: 0,
  },
  items: [],
};

type PendingApprovals = DashboardSummaryResponse["pendingApprovals"];
type RiskSummary = DashboardSummaryResponse["riskSummary"];

const EMPTY_APPROVALS: PendingApprovals = {
  aprs: 0,
  pts: 0,
  checklists: 0,
  nonconformities: 0,
};
const EMPTY_RISK: RiskSummary = { alto: 0, medio: 0, baixo: 0 };
const DASHBOARD_CACHE_TTL_MS = 60_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  if (score >= 85)
    return "Excelente aderência operacional. Mantenha o ritmo.";
  if (score >= 70) return "Pequenos ajustes elevarão o desempenho.";
  if (score >= 50) return "Priorize regularizações para reduzir exposição.";
  return "Plano de ação imediato recomendado.";
}

function resolveGreeting(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatDueDate(
  dateStr: string | null,
): { label: string; overdue: boolean } {
  if (!dateStr) return { label: "—", overdue: false };
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const overdue = isBefore(date, now);
    const diff = differenceInDays(date, now);
    if (overdue)
      return { label: `Venceu há ${Math.abs(diff)}d`, overdue: true };
    if (isToday(date)) return { label: "Vence hoje", overdue: false };
    if (isTomorrow(date)) return { label: "Amanhã", overdue: false };
    if (diff <= 7) return { label: `${diff}d restantes`, overdue: false };
    return {
      label: format(date, "dd/MM/yy", { locale: ptBR }),
      overdue: false,
    };
  } catch {
    return { label: "—", overdue: false };
  }
}

const MODULE_LABELS: Record<string, string> = {
  apr: "APR",
  pt: "PT",
  dds: "DDS",
  inspection: "Inspeção",
  checklist: "Checklist",
  nonconformity: "NC",
  audit: "Auditoria",
  medical_exam: "Exame",
  training: "Treinamento",
  rdo: "RDO",
};

const PRIORITY_CONFIG = {
  critical: {
    badge:
      "bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger-fg)] border border-[var(--ds-color-danger-border)]",
    dot: "bg-[var(--ds-color-danger)]",
    label: "Crítico",
  },
  high: {
    badge:
      "bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning-fg)] border border-[var(--ds-color-warning-border)]",
    dot: "bg-[var(--ds-color-warning)]",
    label: "Alto",
  },
  medium: {
    badge:
      "bg-[var(--ds-color-info-subtle)] text-[var(--ds-color-info-fg)] border border-[var(--ds-color-info-border)]",
    dot: "bg-[var(--ds-color-info)]",
    label: "Médio",
  },
};

const SLA_CONFIG = {
  breached: {
    label: 'SLA vencido',
    className:
      'bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger-fg)] border border-[var(--ds-color-danger-border)]',
  },
  due_today: {
    label: 'Vence hoje',
    className:
      'bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning-fg)] border border-[var(--ds-color-warning-border)]',
  },
  due_soon: {
    label: 'Vence em breve',
    className:
      'bg-[var(--ds-color-info-subtle)] text-[var(--ds-color-info-fg)] border border-[var(--ds-color-info-border)]',
  },
  on_track: {
    label: 'Dentro do SLA',
    className:
      'bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success-fg)] border border-[var(--ds-color-success-border)]',
  },
  unscheduled: {
    label: 'Sem SLA',
    className:
      'bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] border border-[var(--ds-color-border-default)]',
  },
} as const;

// ─── KPI Card ─────────────────────────────────────────────────────────────────

type KpiTone = "danger" | "warning" | "success" | "info" | "neutral";

const KPI_TONE: Record<
  KpiTone,
  { card: string; border: string; value: string; iconBg: string; icon: string; accent: string }
> = {
  danger: {
    card: "bg-[var(--ds-color-surface-base)]",
    border: "border-[var(--ds-color-danger-border)]",
    value: "text-[var(--ds-color-danger)]",
    iconBg: "bg-[var(--ds-color-danger-subtle)]",
    icon: "text-[var(--ds-color-danger-fg)]",
    accent: "bg-[var(--ds-color-danger)]",
  },
  warning: {
    card: "bg-[var(--ds-color-surface-base)]",
    border: "border-[var(--ds-color-warning-border)]",
    value: "text-[var(--ds-color-warning)]",
    iconBg: "bg-[var(--ds-color-warning-subtle)]",
    icon: "text-[var(--ds-color-warning-fg)]",
    accent: "bg-[var(--ds-color-warning)]",
  },
  success: {
    card: "bg-[var(--ds-color-surface-base)]",
    border: "border-[var(--ds-color-success-border)]",
    value: "text-[var(--ds-color-success)]",
    iconBg: "bg-[var(--ds-color-success-subtle)]",
    icon: "text-[var(--ds-color-success-fg)]",
    accent: "bg-[var(--ds-color-success)]",
  },
  info: {
    card: "bg-[var(--ds-color-surface-base)]",
    border: "border-[var(--ds-color-info-border)]",
    value: "text-[var(--ds-color-info)]",
    iconBg: "bg-[var(--ds-color-info-subtle)]",
    icon: "text-[var(--ds-color-info-fg)]",
    accent: "bg-[var(--ds-color-info)]",
  },
  neutral: {
    card: "bg-[var(--ds-color-surface-muted)]/92",
    border: "border-[var(--ds-color-border-default)]",
    value: "text-[var(--title)]",
    iconBg: "bg-white/75",
    icon: "text-[var(--ds-color-text-secondary)]",
    accent: "bg-[var(--ds-color-border-strong)]",
  },
};

function KpiCard({
  label,
  value,
  sublabel,
  tone,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string | number | null;
  sublabel?: string;
  tone: KpiTone;
  icon: React.ElementType;
  trend?: "up" | "down" | "stable";
}) {
  const t = KPI_TONE[tone];
  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-[1.35rem] border p-5 shadow-[var(--ds-shadow-xs)] transition-[border-color,box-shadow]",
        t.card,
        t.border,
      )}
    >
      {/* Accent bar */}
      <div
        className={cn("absolute inset-x-0 top-0 h-[3px]", t.accent)}
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
          {label}
        </p>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            t.iconBg,
          )}
        >
          <Icon className={cn("h-4 w-4", t.icon)} />
        </span>
      </div>
      <div className="flex items-end gap-2">
        <p className={cn("text-[30px] font-extrabold leading-none tracking-[-0.04em]", t.value)}>
          {value == null ? (
            <span className="text-xl text-[var(--ds-color-text-muted)]">
              —
            </span>
          ) : (
            value
          )}
        </p>
        {trend && trend !== "stable" && (
          <span className="mb-1">
            {trend === "down" ? (
              <TrendingDown className="h-4 w-4 text-[var(--ds-color-success)]" />
            ) : (
              <TrendingUp className="h-4 w-4 text-[var(--ds-color-danger)]" />
            )}
          </span>
        )}
      </div>
      {sublabel && (
        <p className="text-xs leading-tight text-[var(--ds-color-text-secondary)]">
          {sublabel}
        </p>
      )}
    </div>
  );
}

// ─── Score Ring ────────────────────────────────────────────────────────────────

function resolveScoreClasses(
  score: number | null,
): { stroke: string; text: string } {
  if (score == null)
    return { stroke: "stroke-[var(--ds-color-border-strong)]", text: "text-[var(--ds-color-text-secondary)]" };
  if (score >= 85)
    return { stroke: "stroke-[var(--ds-color-success)]", text: "text-[var(--ds-color-success)]" };
  if (score >= 70)
    return { stroke: "stroke-[var(--ds-color-info)]", text: "text-[var(--ds-color-info)]" };
  if (score >= 50)
    return { stroke: "stroke-[var(--ds-color-warning)]", text: "text-[var(--ds-color-warning)]" };
  return { stroke: "stroke-[var(--ds-color-danger)]", text: "text-[var(--ds-color-danger)]" };
}

function ScoreRing({ score }: { score: number | null }) {
  const strokeWidth = 12;
  const radius = (140 - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (score ?? 0) / 100);
  const { stroke: strokeClass, text: textClass } =
    resolveScoreClasses(score);

  return (
    <div className="relative h-[140px] w-[140px]">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          className="stroke-[var(--ds-color-surface-muted)]"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          className={cn(
            strokeClass,
            "[transition:stroke-dashoffset_600ms_ease,stroke_600ms_ease]",
          )}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className={cn("text-[26px] font-bold leading-none", textClass)}>
          {score == null ? "—" : score}
        </p>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
          pontos
        </p>
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  overline,
  title,
  trailing,
}: {
  overline: string;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] px-5 py-3.5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
          {overline}
        </p>
        <h2 className="text-[13px] font-semibold text-[var(--title)]">
          {title}
        </h2>
      </div>
      {trailing}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expiringEpis, setExpiringEpis] = useState<
    DashboardSummaryResponse["expiringEpis"]
  >([]);
  const [expiringTrainings, setExpiringTrainings] = useState<
    DashboardSummaryResponse["expiringTrainings"]
  >([]);
  const [pendingApprovals, setPendingApprovals] =
    useState<PendingApprovals>(EMPTY_APPROVALS);
  const [riskSummary, setRiskSummary] = useState<RiskSummary>(EMPTY_RISK);
  const [pendingQueue, setPendingQueue] =
    useState<DashboardPendingQueueResponse>(EMPTY_PENDING_QUEUE);

  const showEpiModule = isTemporarilyVisibleDashboardRoute("/dashboard/epis");
  const showTrainingModule = isTemporarilyVisibleDashboardRoute(
    "/dashboard/trainings",
  );
  const dashboardSummaryCache = useCachedFetch(
    CACHE_KEYS.dashboardSummary,
    dashboardService.getSummary,
    DASHBOARD_CACHE_TTL_MS,
  );
  const pendingQueueCache = useCachedFetch(
    CACHE_KEYS.dashboardPendingQueue,
    dashboardService.getPendingQueue,
    DASHBOARD_CACHE_TTL_MS,
  );

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [summaryR, queueR] = await Promise.allSettled([
          dashboardSummaryCache.fetch(),
          pendingQueueCache.fetch(),
        ]);

        if (!active) return;

        if (summaryR.status === "fulfilled") {
          setExpiringEpis(summaryR.value.expiringEpis ?? []);
          setExpiringTrainings(summaryR.value.expiringTrainings ?? []);
          setPendingApprovals(
            summaryR.value.pendingApprovals ?? EMPTY_APPROVALS,
          );
          setRiskSummary(summaryR.value.riskSummary ?? EMPTY_RISK);
        }

        if (queueR.status === "fulfilled") {
          setPendingQueue(queueR.value);
        }

        const anyFailed =
          summaryR.status === "rejected" || queueR.status === "rejected";
        setLoadError(
          anyFailed
            ? "Alguns dados não puderam ser carregados."
            : null,
        );
      } catch {
        if (!active) return;
        setLoadError("Falha ao carregar o painel.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [dashboardSummaryCache, pendingQueueCache]);

  const expiredEpisCount = useMemo(
    () =>
      expiringEpis.filter((e) =>
        isBefore(new Date(e.validade_ca ?? ""), new Date()),
      ).length,
    [expiringEpis],
  );

  const expiredTrainingsCount = useMemo(
    () =>
      expiringTrainings.filter((t) =>
        isBefore(new Date(t.data_vencimento), new Date()),
      ).length,
    [expiringTrainings],
  );

  const complianceScore = useMemo(() => {
    if (loading) return null;
    const criticalPenalty = Math.min(40, pendingQueue.summary.critical * 8);
    const highPenalty = Math.min(18, pendingQueue.summary.high * 2.5);
    const totalPenalty = Math.min(
      14,
      Math.max(0, pendingQueue.summary.total - 5) * 1.2,
    );
    const epiPenalty = showEpiModule
      ? Math.min(14, expiredEpisCount * 3.5)
      : 0;
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

  const complianceTone: KpiTone =
    complianceScore == null
      ? "neutral"
      : complianceScore >= 85
        ? "success"
        : complianceScore >= 70
          ? "info"
          : complianceScore >= 50
            ? "warning"
            : "danger";

  const now = new Date();
  const greeting = resolveGreeting(now.getHours());
  const dateLabel = format(now, "EEEE, d 'de' MMMM", { locale: ptBR });
  const firstName = (user?.nome ?? "").split(" ")[0];

  const priorityItems = useMemo(
    () =>
      pendingQueue.items
        .filter((i) => i.priority === "critical" || i.priority === "high")
        .slice(0, 10),
    [pendingQueue.items],
  );

  const riskTotal =
    riskSummary.alto + riskSummary.medio + riskSummary.baixo;

  const criticalHighTotal =
    pendingQueue.summary.critical + pendingQueue.summary.high;
  const criticalHighTone: KpiTone =
    pendingQueue.summary.critical > 0
      ? "danger"
      : pendingQueue.summary.high > 0
        ? "warning"
        : "success";

  const docHealthTotal =
    pendingQueue.summary.documents + pendingQueue.summary.health;
  const docHealthTone: KpiTone = docHealthTotal > 0 ? "warning" : "success";
  return (
    <div className="space-y-6">
      {/* ── 1. Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--title)]">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-0.5 text-[13px] capitalize text-[var(--ds-color-text-secondary)]">
            {dateLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loadError && (
            <p className="rounded-lg border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-3 py-1.5 text-xs text-[var(--ds-color-warning-fg)]">
              {loadError}
            </p>
          )}
          {!loading && (
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-1.5 shadow-[var(--ds-shadow-xs)]">
              <Clock className="h-3.5 w-3.5 text-[var(--ds-color-text-secondary)]" />
              <span className="text-xs font-medium text-[var(--ds-color-text-secondary)]">
                {pendingQueue.summary.total} pendências
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. Critical Alert Banner ───────────────────────────────── */}
      {!loading && pendingQueue.summary.critical > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-5 py-3.5 shadow-[var(--ds-shadow-xs)]" role="alert">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ds-color-danger)] text-white">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                {pendingQueue.summary.critical}{" "}
                {pendingQueue.summary.critical === 1
                  ? "item crítico requer"
                  : "itens críticos requerem"}{" "}
                atenção imediata
              </p>
              <p className="text-xs text-[var(--ds-color-text-secondary)]">
                Revise os itens abaixo antes de prosseguir com a operação.
              </p>
            </div>
          </div>
          <a
            href="#priority-table"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-color-danger)] transition-colors hover:bg-[var(--ds-color-danger)] hover:text-white"
          >
            Ver agora <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {!loading && pendingQueue.degraded && (
        <div className="rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-5 py-3.5 text-sm text-[var(--ds-color-warning-fg)]" role="status">
          A fila operacional foi carregada com ressalvas.
          {pendingQueue.failedSources?.length
            ? ` Fontes indisponíveis: ${pendingQueue.failedSources.join(", ")}.`
            : ''}
        </div>
      )}

      {/* ── 3. KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Conformidade geral"
          value={loading ? null : `${complianceScore ?? 0}%`}
          sublabel={
            loading
              ? "Calculando..."
              : resolveComplianceLabel(complianceScore)
          }
          tone={complianceTone}
          icon={ShieldCheck}
        />
        <KpiCard
          label="Pendências críticas"
          value={loading ? null : criticalHighTotal}
          sublabel={`${pendingQueue.summary.critical} críticas · ${pendingQueue.summary.high} altas`}
          tone={criticalHighTone}
          icon={AlertTriangle}
          trend={criticalHighTotal > 0 ? "up" : "stable"}
        />
        <KpiCard
          label="SLA operacional"
          value={loading ? null : pendingQueue.summary.slaBreached}
          sublabel={`${pendingQueue.summary.slaDueToday} vencem hoje · ${pendingQueue.summary.slaDueSoon} próximos`}
          tone={pendingQueue.summary.slaBreached > 0 ? "danger" : pendingQueue.summary.slaDueToday > 0 ? "warning" : "success"}
          icon={Clock}
        />
        <KpiCard
          label="Documentos e saúde"
          value={loading ? null : docHealthTotal}
          sublabel={`${pendingQueue.summary.documents} docs · ${pendingQueue.summary.health} saúde`}
          tone={docHealthTone}
          icon={FileText}
        />
      </div>

      {/* ── 4. Main Content ────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        {/* Fila de Prioridades */}
        <section
          id="priority-table"
          className="overflow-hidden rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]"
        >
          <SectionHeader
            overline="Fila de Prioridades"
            title="Itens que requerem ação"
            trailing={
              pendingQueue.summary.total > 10 ? (
                <span className="rounded-md bg-[var(--ds-color-surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ds-color-text-secondary)]">
                  +{pendingQueue.summary.total - 10} na fila
                </span>
              ) : null
            }
          />

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-[color:var(--ds-color-action-primary)] border-t-transparent" />
            </div>
          ) : priorityItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ds-color-success-subtle)]">
                <CheckCircle2 className="h-6 w-6 text-[var(--ds-color-success)]" />
              </span>
              <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                Nenhuma pendência crítica ou alta
              </p>
              <p className="text-xs text-[var(--ds-color-text-secondary)]">
                Mantenha o ritmo operacional.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--ds-color-border-subtle)]">
              {priorityItems.map((item) => {
                const pCfg =
                  PRIORITY_CONFIG[item.priority] ??
                  PRIORITY_CONFIG.medium;
                const slaCfg =
                  SLA_CONFIG[item.slaStatus] ?? SLA_CONFIG.unscheduled;
                const due = formatDueDate(item.dueDate);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--ds-color-surface-muted)]"
                    >
                      <span
                        className={cn(
                          "mt-2 h-2 w-2 shrink-0 rounded-full",
                          pCfg.dot,
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold",
                              pCfg.badge,
                            )}
                          >
                            {pCfg.label}
                          </span>
                          <span className="inline-flex items-center rounded bg-[var(--ds-color-surface-muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ds-color-text-secondary)]">
                            {MODULE_LABELS[item.module] ?? item.module}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold",
                              slaCfg.className,
                            )}
                          >
                            {slaCfg.label}
                          </span>
                          {item.site && (
                            <span className="text-[11px] text-[var(--ds-color-text-secondary)]">
                              {item.site}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-[var(--ds-color-text-primary)]">
                          {item.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[var(--ds-color-text-secondary)]">
                          {item.description}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {due.label !== "—" && (
                          <p
                            className={cn(
                              "text-[11px] font-semibold",
                              due.overdue
                                ? "text-[var(--ds-color-danger)]"
                                : "text-[var(--ds-color-text-secondary)]",
                            )}
                          >
                            {due.label}
                          </p>
                        )}
                        {item.daysToDue != null && item.slaStatus === "on_track" ? (
                          <p className="mt-0.5 text-[11px] text-[var(--ds-color-text-secondary)]">
                            {item.daysToDue}d para o SLA
                          </p>
                        ) : null}
                        {item.overdueByDays != null ? (
                          <p className="mt-0.5 text-[11px] font-semibold text-[var(--ds-color-danger)]">
                            {item.overdueByDays}d fora do SLA
                          </p>
                        ) : null}
                        {item.responsible && (
                          <p className="mt-0.5 text-[11px] text-[var(--ds-color-text-secondary)]">
                            {item.responsible}
                          </p>
                        )}
                        <ArrowRight className="mt-1.5 ml-auto h-3.5 w-3.5 text-[var(--ds-color-border-strong)] transition-colors group-hover:text-[var(--ds-color-action-primary)]" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Coluna lateral */}
        <div className="flex flex-col gap-5">
          {/* Score de Conformidade */}
          <div className="overflow-hidden rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]">
            <div className="border-b border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] px-5 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
                Score de Conformidade
              </p>
            </div>
            <div className="flex flex-col items-center gap-3 px-5 py-5">
              <ScoreRing score={complianceScore} />
              <div className="text-center">
                <p className="text-sm font-bold text-[var(--ds-color-text-primary)]">
                  {resolveComplianceLabel(complianceScore)}
                </p>
                <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-[var(--ds-color-text-secondary)]">
                  {resolveComplianceMessage(complianceScore)}
                </p>
              </div>
            </div>
          </div>

          {/* Distribuição de Riscos */}
          <div className="overflow-hidden rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]">
            <div className="border-b border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] px-5 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
                Distribuição de Riscos
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              {[
                {
                  label: "Alto",
                  value: riskSummary.alto,
                  bar: "bg-[var(--ds-color-danger)]",
                  text: "text-[var(--ds-color-danger)]",
                },
                {
                  label: "Médio",
                  value: riskSummary.medio,
                  bar: "bg-[var(--ds-color-warning)]",
                  text: "text-[var(--ds-color-warning)]",
                },
                {
                  label: "Baixo",
                  value: riskSummary.baixo,
                  bar: "bg-[var(--ds-color-success)]",
                  text: "text-[var(--ds-color-success)]",
                },
              ].map(({ label, value, bar, text }) => {
                const pct =
                  riskTotal > 0
                    ? Math.round((value / riskTotal) * 100)
                    : 0;
                return (
                  <div key={label}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--ds-color-text-secondary)]">
                        {label}
                      </span>
                      <span
                        className={cn("text-xs font-bold", text)}
                      >
                        {value}{" "}
                        <span className="font-normal text-[var(--ds-color-text-secondary)]">
                          ({pct}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--ds-color-surface-muted)]">
                      <div
                        ref={(el) => {
                          if (el) el.style.width = `${pct}%`;
                        }}
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          bar,
                        )}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fila por Categoria */}
          <div className="overflow-hidden rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]">
            <div className="border-b border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] px-5 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
                Fila por Categoria
              </p>
            </div>
            <div className="space-y-1 p-3">
              {[
                {
                  label: "Documentos",
                  value: pendingQueue.summary.documents,
                  Icon: FileText,
                },
                {
                  label: "Saúde Ocupacional",
                  value: pendingQueue.summary.health,
                  Icon: Users,
                },
                {
                  label: "Ações Corretivas",
                  value: pendingQueue.summary.actions,
                  Icon: Zap,
                },
              ].map(({ label, value, Icon }) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--ds-color-surface-muted)]"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 text-[var(--ds-color-text-secondary)]" />
                    <span className="text-xs font-medium text-[var(--ds-color-text-secondary)]">
                      {label}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "min-w-[24px] rounded-md px-1.5 py-0.5 text-center text-xs font-bold",
                      value > 0
                        ? "bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning-fg)]"
                        : "text-[var(--ds-color-text-secondary)]",
                    )}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Acesso Rápido ───────────────────────────────────────── */}
      <section>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
          Acesso rápido
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {[
            {
              label: "APRs",
              href: "/dashboard/aprs",
              badge: pendingApprovals.aprs,
            },
            {
              label: "PTs",
              href: "/dashboard/pts",
              badge: pendingApprovals.pts,
            },
            { label: "DDS", href: "/dashboard/dds", badge: 0 },
            {
              label: "Checklists",
              href: "/dashboard/checklist-models",
              badge: pendingApprovals.checklists,
            },
            {
              label: "Não Conform.",
              href: "/dashboard/nonconformities",
              badge: pendingApprovals.nonconformities,
            },
            { label: "Auditorias", href: "/dashboard/audits", badge: 0 },
          ].map(({ label, href, badge }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center justify-between rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-4 py-3 text-[13px] font-medium text-[var(--ds-color-text-secondary)] shadow-[var(--ds-shadow-xs)] transition-[border-color,background-color,box-shadow] hover:border-[var(--ds-color-primary-border)] hover:bg-[var(--ds-color-surface-muted)] hover:shadow-[var(--ds-shadow-sm)]"
            >
              <span className="transition-colors group-hover:text-[var(--title)]">
                {label}
              </span>
              {badge > 0 && (
                <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--ds-color-warning-subtle)] px-1 text-[11px] font-bold text-[var(--ds-color-warning-fg)]">
                  {badge}
                </span>
              )}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
