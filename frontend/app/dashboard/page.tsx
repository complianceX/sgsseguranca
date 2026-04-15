"use client";

import { useEffect, useMemo, useState } from "react";
import {
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
import { CACHE_KEYS, DASHBOARD_CACHE_TTL_MS } from "@/lib/cache/cacheKeys";
import { cn } from "@/lib/utils";
import { isTemporarilyVisibleDashboardRoute } from "@/lib/temporarilyHiddenModules";

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_PENDING_QUEUE: DashboardPendingQueueResponse = {
  degraded: false,
  failedSources: [],
  summary: {
    total: 0,
    totalFound: 0,
    hasMore: false,
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

function parseValidDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDueDate(
  dateStr: string | null,
): { label: string; overdue: boolean } {
  if (!dateStr) return { label: "—", overdue: false };
  const date = parseValidDate(dateStr);
  if (!date) {
    return { label: "—", overdue: false };
  }

  const now = new Date();
  const overdue = date.getTime() < now.getTime();
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
  { card: string; border: string; value: string; iconBg: string; icon: string; accent: string; glow: string }
> = {
  danger: {
    card: "bg-gradient-to-br from-[var(--ds-color-danger-subtle)] to-[var(--ds-color-surface-base)]",
    border: "border-[var(--ds-color-danger-border)]",
    value: "text-[var(--ds-color-danger)]",
    iconBg: "bg-[var(--ds-color-danger)]",
    icon: "text-white",
    accent: "bg-[var(--ds-color-danger)]",
    glow: "shadow-[0_4px_24px_-4px_var(--ds-color-danger)]",
  },
  warning: {
    card: "bg-gradient-to-br from-[var(--ds-color-warning-subtle)] to-[var(--ds-color-surface-base)]",
    border: "border-[var(--ds-color-warning-border)]",
    value: "text-[var(--ds-color-warning)]",
    iconBg: "bg-[var(--ds-color-warning)]",
    icon: "text-white",
    accent: "bg-[var(--ds-color-warning)]",
    glow: "shadow-[0_4px_24px_-4px_var(--ds-color-warning)]",
  },
  success: {
    card: "bg-gradient-to-br from-[var(--ds-color-success-subtle)] to-[var(--ds-color-surface-base)]",
    border: "border-[var(--ds-color-success-border)]",
    value: "text-[var(--ds-color-success)]",
    iconBg: "bg-[var(--ds-color-success)]",
    icon: "text-white",
    accent: "bg-[var(--ds-color-success)]",
    glow: "shadow-[0_4px_24px_-4px_var(--ds-color-success)]",
  },
  info: {
    card: "bg-gradient-to-br from-[var(--ds-color-info-subtle)] to-[var(--ds-color-surface-base)]",
    border: "border-[var(--ds-color-info-border)]",
    value: "text-[var(--ds-color-info)]",
    iconBg: "bg-[var(--ds-color-info)]",
    icon: "text-white",
    accent: "bg-[var(--ds-color-info)]",
    glow: "shadow-[0_4px_24px_-4px_var(--ds-color-info)]",
  },
  neutral: {
    card: "bg-[var(--ds-color-surface-muted)]",
    border: "border-[var(--ds-color-border-default)]",
    value: "text-[var(--title)]",
    iconBg: "bg-[var(--ds-color-border-strong)]",
    icon: "text-white",
    accent: "bg-[var(--ds-color-border-strong)]",
    glow: "shadow-[var(--ds-shadow-xs)]",
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
        "relative flex flex-col gap-3 overflow-hidden rounded-[1.35rem] border p-5 transition-all duration-200 hover:scale-[1.015] hover:-translate-y-0.5",
        t.card,
        t.border,
        t.glow,
      )}
    >
      {/* Accent bar */}
      <div className={cn("absolute inset-x-0 top-0 h-1", t.accent)} />
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
          {label}
        </p>
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl shadow-sm",
            t.iconBg,
          )}
        >
          <Icon className={cn("h-5 w-5", t.icon)} />
        </span>
      </div>
      <div className="flex items-end gap-2">
        <p className={cn("text-[32px] font-black leading-none tracking-[-0.04em]", t.value)}>
          {value == null ? (
            <span className="h-8 w-16 animate-pulse rounded-lg bg-[var(--ds-color-border-subtle)] inline-block" />
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
  const strokeWidth = 10;
  const size = 160;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (score ?? 0) / 100);
  const { stroke: strokeClass, text: textClass } = resolveScoreClasses(score);

  // Glow color derived from tone
  const glowColor =
    score == null
      ? "transparent"
      : score >= 85
        ? "var(--ds-color-success)"
        : score >= 70
          ? "var(--ds-color-info)"
          : score >= 50
            ? "var(--ds-color-warning)"
            : "var(--ds-color-danger)";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Glow halo */}
      {score != null && (
        <div
          className="absolute inset-4 rounded-full opacity-20 blur-xl"
          style={{ background: glowColor }}
        />
      )}
      <svg viewBox={`0 0 ${size} ${size}`} className="relative h-full w-full -rotate-90">
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
          className={cn(strokeClass, "[transition:stroke-dashoffset_800ms_cubic-bezier(0.4,0,0.2,1),stroke_600ms_ease]")}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className={cn("text-[30px] font-black leading-none tracking-tight", textClass)}>
          {score == null ? "—" : score}
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--ds-color-text-secondary)]">
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
    <div className="flex items-center justify-between border-b border-[var(--ds-color-border-default)] bg-gradient-to-r from-[var(--ds-color-surface-muted)] to-[var(--ds-color-surface-base)] px-5 py-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
          {overline}
        </p>
        <h2 className="text-[14px] font-bold text-[var(--title)]">
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

  // Estados separados para que summary e fila de pendencias carreguem
  // de forma independente — o usuario ve cada secao assim que seu dado chega.
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);

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

  // revalidateArgs: [] porque getSummary e getPendingQueue nao recebem argumentos.
  const dashboardSummaryCache = useCachedFetch(
    CACHE_KEYS.dashboardSummary,
    dashboardService.getSummary,
    DASHBOARD_CACHE_TTL_MS,
    { revalidateOnFocus: true, revalidateArgs: [] },
  );
  const pendingQueueCache = useCachedFetch(
    CACHE_KEYS.dashboardPendingQueue,
    dashboardService.getPendingQueue,
    DASHBOARD_CACHE_TTL_MS,
    { revalidateOnFocus: true, revalidateArgs: [] },
  );

  // Carrega summary de forma independente
  useEffect(() => {
    let active = true;

    async function loadSummary() {
      try {
        const summary = await dashboardSummaryCache.fetch();
        if (!active) return;
        setExpiringEpis(summary.expiringEpis ?? []);
        setExpiringTrainings(summary.expiringTrainings ?? []);
        setPendingApprovals(summary.pendingApprovals ?? EMPTY_APPROVALS);
        setRiskSummary(summary.riskSummary ?? EMPTY_RISK);
        setSummaryError(null);
      } catch {
        if (!active) return;
        setSummaryError("Dados de resumo indisponíveis.");
      } finally {
        if (active) setSummaryLoading(false);
      }
    }

    void loadSummary();
    return () => { active = false; };
  }, [dashboardSummaryCache]);

  // Carrega fila de pendencias de forma independente
  useEffect(() => {
    let active = true;

    async function loadQueue() {
      try {
        const queue = await pendingQueueCache.fetch();
        if (!active) return;
        setPendingQueue(queue);
        setQueueError(null);
      } catch {
        if (!active) return;
        setQueueError("Fila de pendências indisponível.");
      } finally {
        if (active) setQueueLoading(false);
      }
    }

    void loadQueue();
    return () => { active = false; };
  }, [pendingQueueCache]);

  // loading global: true enquanto qualquer secao ainda estiver carregando
  const loading = summaryLoading || queueLoading;
  const loadError = summaryError ?? queueError;

  const expiredEpisCount = useMemo(
    () => {
      const now = Date.now();
      return expiringEpis.filter((e) => {
        const dueDate = parseValidDate(e.validade_ca);
        return dueDate ? dueDate.getTime() < now : false;
      }).length;
    },
    [expiringEpis],
  );

  const expiredTrainingsCount = useMemo(
    () => {
      const now = Date.now();
      return expiringTrainings.filter((t) => {
        const expiryDate = parseValidDate(t.data_vencimento);
        return expiryDate ? expiryDate.getTime() < now : false;
      }).length;
    },
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
      <div className="animate-fade-up relative overflow-hidden rounded-2xl border border-[var(--ds-color-border-default)] bg-gradient-to-br from-[var(--ds-color-surface-base)] via-[var(--ds-color-surface-muted)] to-[var(--ds-color-surface-base)] px-6 py-5 shadow-[var(--ds-shadow-sm)]">
        {/* Decorative glow orbs */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[var(--ds-color-action-primary)] opacity-[0.07] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 left-1/3 h-32 w-32 rounded-full bg-[var(--ds-color-info)] opacity-[0.04] blur-2xl" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ds-color-text-secondary)]">
              Painel Operacional
            </p>
            <h1 className="mt-0.5 text-[26px] font-black leading-tight tracking-[-0.03em] text-[var(--title)]">
              {greeting}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-0.5 text-[13px] capitalize text-[var(--ds-color-text-secondary)]">
              {dateLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loadError && (
              <p className="rounded-lg border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-3 py-1.5 text-xs text-[var(--ds-color-warning-fg)]">
                {loadError}
              </p>
            )}
            {!queueLoading && pendingQueue.summary.critical > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-[var(--ds-color-danger)] animate-pulse" />
                <span className="text-xs font-bold text-[var(--ds-color-danger)]">
                  {pendingQueue.summary.critical} crítico{pendingQueue.summary.critical !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            {!queueLoading && pendingQueue.summary.slaBreached > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-3 py-2">
                <Clock className="h-3 w-3 text-[var(--ds-color-warning)]" />
                <span className="text-xs font-bold text-[var(--ds-color-warning-fg)]">
                  {pendingQueue.summary.slaBreached} SLA vencido{pendingQueue.summary.slaBreached !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            {!queueLoading && pendingQueue.summary.critical === 0 && pendingQueue.summary.slaBreached === 0 && (
              <div className="flex items-center gap-1.5 rounded-xl border border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ds-color-success)]" />
                <span className="text-xs font-bold text-[var(--ds-color-success-fg)]">Operação normal</span>
              </div>
            )}
            {!queueLoading && (
              <div className="flex items-center gap-1.5 rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 shadow-[var(--ds-shadow-xs)]">
                <Clock className="h-3.5 w-3.5 text-[var(--ds-color-text-secondary)]" />
                <span className="text-xs font-semibold text-[var(--ds-color-text-secondary)]">
                  {pendingQueue.summary.hasMore
                    ? `${pendingQueue.summary.total}+ pendências`
                    : `${pendingQueue.summary.total} pendências`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. Critical Alert Banner ───────────────────────────────── */}
      {!queueLoading && pendingQueue.summary.critical > 0 && (
        <div
          className="relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-[var(--ds-color-danger-border)] bg-gradient-to-r from-[var(--ds-color-danger-subtle)] to-[var(--ds-color-surface-base)] px-5 py-4 shadow-[0_2px_16px_-4px_var(--ds-color-danger)]"
          role="alert"
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[var(--ds-color-danger)]" />
          <div className="flex items-center gap-3 pl-2">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-color-danger)] text-white shadow-[0_0_12px_2px_var(--ds-color-danger)]">
              <ShieldAlert className="h-5 w-5" />
              <span className="absolute inset-0 animate-ping rounded-xl bg-[var(--ds-color-danger)] opacity-20" />
            </span>
            <div>
              <p className="text-sm font-bold text-[var(--ds-color-text-primary)]">
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
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--ds-color-danger)] px-4 py-2 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            Ver agora <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {!queueLoading && pendingQueue.degraded && (
        <div className="rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-5 py-3.5 text-sm text-[var(--ds-color-warning-fg)]" role="status">
          A fila operacional foi carregada com ressalvas.
          {pendingQueue.failedSources?.length
            ? ` Fontes indisponíveis: ${pendingQueue.failedSources.join(", ")}.`
            : ''}
        </div>
      )}

      {/* ── 3. KPI Cards ───────────────────────────────────────────── */}
      <div className="animate-fade-up grid grid-cols-2 gap-4 lg:grid-cols-4 [animation-delay:60ms]">
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
          value={queueLoading ? null : criticalHighTotal}
          sublabel={`${pendingQueue.summary.critical} críticas · ${pendingQueue.summary.high} altas`}
          tone={criticalHighTone}
          icon={AlertTriangle}
          trend={criticalHighTotal > 0 ? "up" : "stable"}
        />
        <KpiCard
          label="SLA operacional"
          value={queueLoading ? null : pendingQueue.summary.slaBreached}
          sublabel={`${pendingQueue.summary.slaDueToday} vencem hoje · ${pendingQueue.summary.slaDueSoon} próximos`}
          tone={pendingQueue.summary.slaBreached > 0 ? "danger" : pendingQueue.summary.slaDueToday > 0 ? "warning" : "success"}
          icon={Clock}
        />
        <KpiCard
          label="Documentos e saúde"
          value={queueLoading ? null : docHealthTotal}
          sublabel={`${pendingQueue.summary.documents} docs · ${pendingQueue.summary.health} saúde`}
          tone={docHealthTone}
          icon={FileText}
        />
      </div>

      {/* ── 4. Main Content ────────────────────────────────────────── */}
      <div className="animate-fade-up grid gap-5 lg:grid-cols-[1fr_280px] [animation-delay:120ms]">
        {/* Fila de Prioridades */}
        <section
          id="priority-table"
          className="overflow-hidden rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]"
        >
          <SectionHeader
            overline="Fila de Prioridades"
            title="Itens que requerem ação"
            trailing={
              pendingQueue.summary.hasMore ? (
                <span className="rounded-md bg-[var(--ds-color-surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ds-color-text-secondary)]">
                  {pendingQueue.summary.totalFound} encontrados · exibindo {pendingQueue.summary.total}
                </span>
              ) : pendingQueue.summary.total > 10 ? (
                <span className="rounded-md bg-[var(--ds-color-surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ds-color-text-secondary)]">
                  +{pendingQueue.summary.total - 10} na fila
                </span>
              ) : null
            }
          />

          {queueLoading ? (
            <div className="space-y-px p-1">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-4">
                  <div className="mt-1 h-10 w-1 shrink-0 animate-pulse rounded-full bg-[var(--ds-color-border-subtle)]" />
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-1.5">
                      <div className="h-4 w-12 animate-pulse rounded bg-[var(--ds-color-border-subtle)]" />
                      <div className="h-4 w-16 animate-pulse rounded bg-[var(--ds-color-border-subtle)]" />
                    </div>
                    <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--ds-color-border-subtle)]" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--ds-color-border-subtle)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : !queueLoading && priorityItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ds-color-success-subtle)]">
                <CheckCircle2 className="h-8 w-8 text-[var(--ds-color-success)]" />
                <span className="absolute inset-0 animate-ping rounded-full bg-[var(--ds-color-success)] opacity-10" />
              </span>
              <div>
                <p className="text-sm font-bold text-[var(--ds-color-text-primary)]">
                  Nenhuma pendência crítica ou alta
                </p>
                <p className="mt-0.5 text-xs text-[var(--ds-color-text-secondary)]">
                  Operação dentro dos parâmetros. Mantenha o ritmo.
                </p>
              </div>
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
                      className="group relative flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[var(--ds-color-surface-muted)]"
                    >
                      {/* Left color strip — always visible */}
                      <span
                        className={cn(
                          "absolute inset-y-0 left-0 w-[3px] rounded-r-full transition-all duration-200 group-hover:w-[4px]",
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
                    complianceTone === "success" && "bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success-fg)]",
                    complianceTone === "info"    && "bg-[var(--ds-color-info-subtle)] text-[var(--ds-color-info-fg)]",
                    complianceTone === "warning" && "bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning-fg)]",
                    complianceTone === "danger"  && "bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger-fg)]",
                    complianceTone === "neutral" && "bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]",
                  )}
                >
                  {resolveComplianceLabel(complianceScore)}
                </span>
                <p className="max-w-[220px] text-xs leading-relaxed text-[var(--ds-color-text-secondary)]">
                  {resolveComplianceMessage(complianceScore)}
                </p>
              </div>
            </div>
          </div>

          {/* Distribuição de Riscos */}
          <div className="overflow-hidden rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]">
            <div className="border-b border-[var(--ds-color-border-default)] bg-gradient-to-r from-[var(--ds-color-surface-muted)] to-[var(--ds-color-surface-base)] px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
                Distribuição de Riscos
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
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
                const pct =
                  riskTotal > 0
                    ? Math.round((value / riskTotal) * 100)
                    : 0;
                return (
                  <div key={label}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 rounded-full", dot)} />
                        <span className="text-xs font-semibold text-[var(--ds-color-text-secondary)]">
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
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--ds-color-surface-muted)]">
                      <div
                        ref={(el) => {
                          if (el) el.style.width = `${pct}%`;
                        }}
                        className={cn(
                          "h-full rounded-full transition-all duration-700",
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
            <div className="border-b border-[var(--ds-color-border-default)] bg-gradient-to-r from-[var(--ds-color-surface-muted)] to-[var(--ds-color-surface-base)] px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
                Fila por Categoria
              </p>
            </div>
            <div className="space-y-1.5 p-3">
              {(() => {
                const cats = [
                  { label: "Documentos",       value: pendingQueue.summary.documents, Icon: FileText, color: "bg-[var(--ds-color-info)]" },
                  { label: "Saúde Ocupacional", value: pendingQueue.summary.health,    Icon: Users,    color: "bg-[var(--ds-color-success)]" },
                  { label: "Ações Corretivas",  value: pendingQueue.summary.actions,   Icon: Zap,      color: "bg-[var(--ds-color-warning)]" },
                ];
                const catTotal = cats.reduce((s, c) => s + c.value, 0);
                return cats.map(({ label, value, Icon, color }) => {
                  const pct = catTotal > 0 ? Math.round((value / catTotal) * 100) : 0;
                  return (
                    <div key={label} className="rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--ds-color-surface-muted)]">
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-[var(--ds-color-text-secondary)]" />
                          <span className="text-xs font-semibold text-[var(--ds-color-text-secondary)]">
                            {label}
                          </span>
                        </div>
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
                      <div className="h-1 overflow-hidden rounded-full bg-[var(--ds-color-surface-muted)]">
                        <div
                          ref={(el) => { if (el) el.style.width = `${pct}%`; }}
                          className={cn("h-full rounded-full transition-all duration-700 opacity-70", color)}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Acesso Rápido ───────────────────────────────────────── */}
      <section className="animate-fade-up [animation-delay:180ms]">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ds-color-text-secondary)]">
          Acesso rápido
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {[
            {
              label: "APRs",
              href: "/dashboard/aprs",
              badge: pendingApprovals.aprs,
              Icon: ShieldAlert,
            },
            {
              label: "PTs",
              href: "/dashboard/pts",
              badge: pendingApprovals.pts,
              Icon: FileText,
            },
            { label: "DDS", href: "/dashboard/dds", badge: 0, Icon: Users },
            {
              label: "Checklists",
              href: "/dashboard/checklist-models",
              badge: pendingApprovals.checklists,
              Icon: CheckCircle2,
            },
            {
              label: "Não Conform.",
              href: "/dashboard/nonconformities",
              badge: pendingApprovals.nonconformities,
              Icon: AlertTriangle,
            },
            { label: "Auditorias", href: "/dashboard/audits", badge: 0, Icon: ShieldCheck },
          ].map(({ label, href, badge, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col gap-2 rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-4 py-3.5 shadow-[var(--ds-shadow-xs)] transition-all hover:border-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-surface-muted)] hover:shadow-[var(--ds-shadow-sm)] hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ds-color-surface-muted)] transition-colors group-hover:bg-[var(--ds-color-action-primary)] group-hover:text-white">
                  <Icon className="h-4 w-4 text-[var(--ds-color-text-secondary)] transition-colors group-hover:text-white" />
                </span>
                {badge > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--ds-color-warning)] px-1 text-[11px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </div>
              <span className="text-[13px] font-semibold text-[var(--ds-color-text-secondary)] transition-colors group-hover:text-[var(--title)]">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
