"use client";

import { useEffect, useMemo, useState } from "react";
import { isBefore, format, isToday, isTomorrow, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import {
  dashboardService,
  type DashboardPendingQueueResponse,
  type DashboardSummaryResponse,
} from "@/services/dashboardService";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { isTemporarilyVisibleDashboardRoute } from "@/lib/temporarilyHiddenModules";

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_PENDING_QUEUE: DashboardPendingQueueResponse = {
  degraded: false,
  failedSources: [],
  summary: { total: 0, critical: 0, high: 0, medium: 0, documents: 0, health: 0, actions: 0 },
  items: [],
};

type PendingApprovals = DashboardSummaryResponse["pendingApprovals"];
type RiskSummary = DashboardSummaryResponse["riskSummary"];

const EMPTY_APPROVALS: PendingApprovals = { aprs: 0, pts: 0, checklists: 0, nonconformities: 0 };
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
  if (score >= 85) return "Excelente aderência operacional. Mantenha o ritmo.";
  if (score >= 70) return "Pequenos ajustes elevarão o desempenho rapidamente.";
  if (score >= 50) return "Priorize regularizações para reduzir exposição.";
  return "Plano de ação imediato recomendado. Acompanhe diariamente.";
}

function resolveGreeting(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatDueDate(dateStr: string | null): { label: string; overdue: boolean } {
  if (!dateStr) return { label: "—", overdue: false };
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const overdue = isBefore(date, now);
    const diff = differenceInDays(date, now);
    if (overdue) return { label: `Venceu há ${Math.abs(diff)}d`, overdue: true };
    if (isToday(date)) return { label: "Vence hoje", overdue: false };
    if (isTomorrow(date)) return { label: "Vence amanhã", overdue: false };
    if (diff <= 7) return { label: `${diff}d restantes`, overdue: false };
    return { label: format(date, "dd/MM/yy", { locale: ptBR }), overdue: false };
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
    badge: "bg-red-100 text-red-700 border border-red-200",
    dot: "bg-red-500",
    label: "Crítico",
  },
  high: {
    badge: "bg-amber-100 text-amber-700 border border-amber-200",
    dot: "bg-amber-500",
    label: "Alto",
  },
  medium: {
    badge: "bg-blue-100 text-blue-700 border border-blue-200",
    dot: "bg-blue-400",
    label: "Médio",
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

type KpiTone = "danger" | "warning" | "success" | "info" | "neutral";

const KPI_TONE_MAP: Record<KpiTone, { border: string; value: string; iconBg: string; icon: string }> = {
  danger:  { border: "border-red-200",    value: "text-red-600",   iconBg: "bg-red-50",    icon: "text-red-500" },
  warning: { border: "border-amber-200",  value: "text-amber-600", iconBg: "bg-amber-50",  icon: "text-amber-500" },
  success: { border: "border-green-200",  value: "text-green-700", iconBg: "bg-green-50",  icon: "text-green-600" },
  info:    { border: "border-blue-200",   value: "text-blue-700",  iconBg: "bg-blue-50",   icon: "text-blue-600" },
  neutral: { border: "border-[var(--ds-color-border-subtle)]", value: "text-[var(--ds-color-text-primary)]", iconBg: "bg-[var(--ds-color-surface-subtle)]", icon: "text-[var(--ds-color-text-muted)]" },
};

function KpiCard({
  label,
  value,
  sublabel,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number | null;
  sublabel?: string;
  tone: KpiTone;
  icon: React.ElementType;
}) {
  const t = KPI_TONE_MAP[tone];
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-white p-5", t.border)}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
          {label}
        </p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", t.iconBg)}>
          <Icon className={cn("h-4 w-4", t.icon)} />
        </span>
      </div>
      <p className={cn("text-[28px] font-bold leading-none", t.value)}>
        {value == null ? (
          <span className="text-xl text-[var(--ds-color-text-muted)]">—</span>
        ) : (
          value
        )}
      </p>
      {sublabel && (
        <p className="text-[11px] leading-tight text-[var(--ds-color-text-muted)]">{sublabel}</p>
      )}
    </div>
  );
}

function resolveScoreClasses(score: number | null): { stroke: string; text: string } {
  if (score == null) return { stroke: "stroke-slate-400", text: "text-slate-400" };
  if (score >= 85) return { stroke: "stroke-green-700", text: "text-green-700" };
  if (score >= 70) return { stroke: "stroke-blue-700", text: "text-blue-700" };
  if (score >= 50) return { stroke: "stroke-amber-600", text: "text-amber-600" };
  return { stroke: "stroke-red-600", text: "text-red-600" };
}

function ScoreRing({ score }: { score: number | null }) {
  const strokeWidth = 13;
  const radius = (140 - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (score ?? 0) / 100);
  const { stroke: strokeClass, text: textClass } = resolveScoreClasses(score);

  return (
    <div className="relative h-[140px] w-[140px]">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          className="stroke-slate-100"
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
        <p className={cn("text-2xl font-bold leading-none", textClass)}>
          {score == null ? "—" : score}
        </p>
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
          %
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expiringEpis, setExpiringEpis] = useState<DashboardSummaryResponse["expiringEpis"]>([]);
  const [expiringTrainings, setExpiringTrainings] = useState<DashboardSummaryResponse["expiringTrainings"]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovals>(EMPTY_APPROVALS);
  const [riskSummary, setRiskSummary] = useState<RiskSummary>(EMPTY_RISK);
  const [pendingQueue, setPendingQueue] = useState<DashboardPendingQueueResponse>(EMPTY_PENDING_QUEUE);

  const showEpiModule = isTemporarilyVisibleDashboardRoute("/dashboard/epis");
  const showTrainingModule = isTemporarilyVisibleDashboardRoute("/dashboard/trainings");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [summaryR, queueR] = await Promise.allSettled([
          dashboardService.getSummary(),
          dashboardService.getPendingQueue(),
        ]);

        if (!active) return;

        if (summaryR.status === "fulfilled") {
          setExpiringEpis(summaryR.value.expiringEpis ?? []);
          setExpiringTrainings(summaryR.value.expiringTrainings ?? []);
          setPendingApprovals(summaryR.value.pendingApprovals ?? EMPTY_APPROVALS);
          setRiskSummary(summaryR.value.riskSummary ?? EMPTY_RISK);
        }

        if (queueR.status === "fulfilled") {
          setPendingQueue(queueR.value);
        }

        const anyFailed =
          summaryR.status === "rejected" || queueR.status === "rejected";
        setLoadError(
          anyFailed
            ? "Alguns dados não puderam ser carregados. Exibindo visão parcial."
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
  }, []);

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
    const totalPenalty = Math.min(14, Math.max(0, pendingQueue.summary.total - 5) * 1.2);
    const epiPenalty = showEpiModule ? Math.min(14, expiredEpisCount * 3.5) : 0;
    const trainingPenalty = showTrainingModule ? Math.min(14, expiredTrainingsCount * 3.5) : 0;
    return clampScore(100 - criticalPenalty - highPenalty - totalPenalty - epiPenalty - trainingPenalty);
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
  const dateLabel = format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  const firstName = (user?.nome ?? "").split(" ")[0];

  const totalPendingApprovals =
    pendingApprovals.aprs +
    pendingApprovals.pts +
    pendingApprovals.checklists +
    pendingApprovals.nonconformities;

  const priorityItems = useMemo(
    () =>
      pendingQueue.items
        .filter((i) => i.priority === "critical" || i.priority === "high")
        .slice(0, 12),
    [pendingQueue.items],
  );

  const riskTotal = riskSummary.alto + riskSummary.medio + riskSummary.baixo;

  const criticalHighTotal = pendingQueue.summary.critical + pendingQueue.summary.high;
  const criticalHighTone: KpiTone =
    pendingQueue.summary.critical > 0
      ? "danger"
      : pendingQueue.summary.high > 0
      ? "warning"
      : "success";

  const docHealthTotal = pendingQueue.summary.documents + pendingQueue.summary.health;
  const docHealthTone: KpiTone = docHealthTotal > 0 ? "warning" : "success";

  const approvalTone: KpiTone = totalPendingApprovals > 0 ? "warning" : "success";

  return (
    <div className="space-y-5">

      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold capitalize text-[var(--ds-color-text-muted)]">
            {dateLabel}
          </p>
          <h1 className="mt-1 text-xl font-bold text-[var(--ds-color-text-primary)]">
            {greeting}{firstName ? `, ${firstName}` : ""}.
          </h1>
        </div>
        {loadError && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
            {loadError}
          </p>
        )}
      </div>

      {/* ── 2. Critical Alert Banner ────────────────────────────────────────── */}
      {!loading && pendingQueue.summary.critical > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
            <p className="text-sm font-semibold text-red-800">
              {pendingQueue.summary.critical}{" "}
              {pendingQueue.summary.critical === 1
                ? "item crítico requer"
                : "itens críticos requerem"}{" "}
              atenção imediata
            </p>
          </div>
          <a
            href="#priority-table"
            className="flex shrink-0 items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-900"
          >
            Ver agora <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {/* ── 3. KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Conformidade geral"
          value={loading ? null : `${complianceScore ?? 0}%`}
          sublabel={loading ? "Calculando..." : resolveComplianceLabel(complianceScore)}
          tone={complianceTone}
          icon={ShieldCheck}
        />
        <KpiCard
          label="Pendências críticas"
          value={loading ? null : criticalHighTotal}
          sublabel={`${pendingQueue.summary.critical} críticas · ${pendingQueue.summary.high} altas`}
          tone={criticalHighTone}
          icon={AlertTriangle}
        />
        <KpiCard
          label="Documentos e saúde"
          value={loading ? null : docHealthTotal}
          sublabel={`${pendingQueue.summary.documents} docs · ${pendingQueue.summary.health} saúde`}
          tone={docHealthTone}
          icon={FileText}
        />
        <KpiCard
          label="Aprovações pendentes"
          value={loading ? null : totalPendingApprovals}
          sublabel={`APR ${pendingApprovals.aprs} · PT ${pendingApprovals.pts} · NC ${pendingApprovals.nonconformities}`}
          tone={approvalTone}
          icon={CheckCircle2}
        />
      </div>

      {/* ── 4. Main Content: Tabela + Painel lateral ────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_272px]">

        {/* Fila de Prioridades */}
        <section
          id="priority-table"
          className="overflow-hidden rounded-xl border border-[var(--ds-color-border-subtle)] bg-white"
        >
          <div className="flex items-center justify-between border-b border-[var(--ds-color-border-subtle)] px-5 py-3.5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
                Fila de Prioridades
              </p>
              <h2 className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                Itens que requerem ação hoje
              </h2>
            </div>
            {pendingQueue.summary.total > 12 && (
              <span className="text-xs text-[var(--ds-color-text-muted)]">
                +{pendingQueue.summary.total - 12} na fila
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-14">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent" />
            </div>
          ) : priorityItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                Nenhuma pendência crítica ou alta
              </p>
              <p className="text-xs text-[var(--ds-color-text-muted)]">
                Excelente — mantenha o ritmo operacional.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--ds-color-border-subtle)]">
              {priorityItems.map((item) => {
                const pCfg = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.medium;
                const due = formatDueDate(item.dueDate);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--ds-color-surface-subtle)]"
                    >
                      <span
                        className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", pCfg.dot)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold",
                              pCfg.badge,
                            )}
                          >
                            {pCfg.label}
                          </span>
                          <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {MODULE_LABELS[item.module] ?? item.module}
                          </span>
                          {item.site && (
                            <span className="text-[10px] text-[var(--ds-color-text-muted)]">
                              {item.site}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-[var(--ds-color-text-primary)]">
                          {item.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[var(--ds-color-text-muted)]">
                          {item.description}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {due.label !== "—" && (
                          <p
                            className={cn(
                              "text-[10px] font-semibold",
                              due.overdue
                                ? "text-red-600"
                                : "text-[var(--ds-color-text-muted)]",
                            )}
                          >
                            {due.label}
                          </p>
                        )}
                        {item.responsible && (
                          <p className="mt-0.5 text-[10px] text-[var(--ds-color-text-muted)]">
                            {item.responsible}
                          </p>
                        )}
                        <ArrowRight className="mt-1 ml-auto h-3 w-3 text-[var(--ds-color-text-muted)]" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Coluna lateral: Score + Riscos + Fila por categoria */}
        <div className="flex flex-col gap-4">

          {/* Score de Conformidade */}
          <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-white p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
              Score de Conformidade
            </p>
            <div className="mt-4 flex flex-col items-center gap-2">
              <ScoreRing score={complianceScore} />
              <div className="text-center">
                <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  {resolveComplianceLabel(complianceScore)}
                </p>
                <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-[var(--ds-color-text-muted)]">
                  {resolveComplianceMessage(complianceScore)}
                </p>
              </div>
            </div>
          </div>

          {/* Distribuição de Riscos */}
          <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-white p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
              Distribuição de Riscos
            </p>
            <div className="space-y-3">
              {[
                { label: "Alto", value: riskSummary.alto, bar: "bg-red-500", text: "text-red-600" },
                { label: "Médio", value: riskSummary.medio, bar: "bg-amber-400", text: "text-amber-700" },
                { label: "Baixo", value: riskSummary.baixo, bar: "bg-green-500", text: "text-green-700" },
              ].map(({ label, value, bar, text }) => {
                const pct = riskTotal > 0 ? Math.round((value / riskTotal) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-[var(--ds-color-text-secondary)]">
                        {label}
                      </span>
                      <span className={cn("text-xs font-bold", text)}>
                        {value}{" "}
                        <span className="font-normal text-[var(--ds-color-text-muted)]">
                          ({pct}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        ref={(el) => {
                          if (el) el.style.width = `${pct}%`;
                        }}
                        className={cn("h-full rounded-full transition-all duration-500", bar)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fila por Categoria */}
          <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-white p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
              Fila por Categoria
            </p>
            <div className="space-y-2">
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
                  label: "Ações",
                  value: pendingQueue.summary.actions,
                  Icon: Zap,
                },
              ].map(({ label, value, Icon }) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg bg-[var(--ds-color-surface-subtle)] px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-[var(--ds-color-text-muted)]" />
                    <span className="text-xs text-[var(--ds-color-text-secondary)]">
                      {label}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      value > 0
                        ? "text-[var(--ds-color-text-primary)]"
                        : "text-[var(--ds-color-text-muted)]",
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

      {/* ── 5. Acesso Rápido ────────────────────────────────────────────────── */}
      <section>
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
          Acesso rápido
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "APRs", href: "/dashboard/aprs", badge: pendingApprovals.aprs },
            { label: "PTs", href: "/dashboard/pts", badge: pendingApprovals.pts },
            { label: "DDS", href: "/dashboard/dds", badge: 0 },
            { label: "Checklists", href: "/dashboard/checklist-models", badge: pendingApprovals.checklists },
            { label: "Não Conform.", href: "/dashboard/nonconformities", badge: pendingApprovals.nonconformities },
            { label: "Auditorias", href: "/dashboard/audits", badge: 0 },
          ].map(({ label, href, badge }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between rounded-xl border border-[var(--ds-color-border-subtle)] bg-white px-4 py-3 text-sm font-medium text-[var(--ds-color-text-secondary)] transition-colors hover:border-[var(--ds-color-primary-border)] hover:bg-[var(--ds-color-surface-subtle)] hover:text-[var(--ds-color-text-primary)]"
            >
              {label}
              {badge > 0 && (
                <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1 text-[10px] font-bold text-amber-700">
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
