"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  type LucideIcon,
  CalendarClock,
  Shield,
  FileText,
  ClipboardCheck,
  AlertCircle,
  CheckCircle2,
  GraduationCap,
  AlertTriangle,
  FileStack,
  ArrowUpRight,
  MessageSquare,
  CheckCheck,
  LayoutDashboard,
  PlusCircle,
} from "lucide-react";
import {
  dashboardService,
  DashboardPendingQueueResponse,
  DashboardSummaryResponse,
} from "@/services/dashboardService";
import { useAuth } from "@/context/AuthContext";
import { format, isBefore } from "date-fns";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import { SophieSupportHub } from "@/components/SophieSupportHub";
import {
  isTemporarilyHiddenDashboardRoute,
  isTemporarilyVisibleDashboardRoute,
} from "@/lib/temporarilyHiddenModules";

type QueueFilter = "all" | "critical" | "documents" | "health" | "actions";

type QuickAction = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

type CriticalAlert = {
  id: string;
  title: string;
  message: string;
  href: string;
  tone: "danger" | "warning" | "info";
};

const QUEUE_FILTERS: Array<{ id: QueueFilter; label: string }> = [
  { id: "all", label: "Tudo" },
  { id: "critical", label: "Críticas" },
  { id: "documents", label: "Documentos" },
  { id: "health", label: "Saúde ocupacional" },
  { id: "actions", label: "Ações" },
];

function formatDateOnly(value?: string | number | Date | null) {
  if (!value) return "Sem prazo";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Sem prazo";
  return format(d, "dd/MM/yyyy");
}

function resolveQueuePriorityClasses(priority: "critical" | "high" | "medium") {
  switch (priority) {
    case "critical":
      return "bg-[color:var(--ds-color-danger)]";
    case "high":
      return "bg-[color:var(--ds-color-warning)]";
    default:
      return "bg-[color:var(--ds-color-info)]";
  }
}

function resolveQueueModuleIcon(module: string): LucideIcon {
  switch (module) {
    case "APR":
      return Shield;
    case "PT":
      return FileText;
    case "Checklist":
      return ClipboardCheck;
    case "NC":
      return AlertTriangle;
    case "Treinamento":
      return GraduationCap;
    case "ASO":
      return AlertCircle;
    case "Ação":
      return CheckCheck;
    default:
      return FileStack;
  }
}

type PendingQueueEntry = DashboardPendingQueueResponse["items"][number];

function buildPendingQueueSophieHref(item: PendingQueueEntry) {
  const params = new URLSearchParams({
    pendingContext: "true",
    module: item.module,
    category: item.category,
    title: item.title,
    description: item.description,
    priority: item.priority,
    status: item.status,
    href: item.href,
  });
  if (item.sourceId) params.set("sourceId", item.sourceId);
  if (item.siteId) params.set("site_id", item.siteId);
  if (item.site) params.set("site_name", item.site);
  if (item.responsible) params.set("responsible", item.responsible);
  if (item.dueDate) params.set("dueDate", item.dueDate);
  return `/dashboard/sst-agent?${params.toString()}`;
}

function resolveGreeting(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function resolveComplianceStrokeColor(score: number | null) {
  if (score == null) return "var(--ds-color-border-default)";
  if (score >= 85) return "var(--ds-color-success)";
  if (score >= 70) return "var(--ds-color-info)";
  if (score >= 50) return "var(--ds-color-warning)";
  return "var(--ds-color-danger)";
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [expiringEpis, setExpiringEpis] = useState<
    DashboardSummaryResponse["expiringEpis"]
  >([]);
  const [expiringTrainings, setExpiringTrainings] = useState<
    DashboardSummaryResponse["expiringTrainings"]
  >([]);
  const [pendingQueue, setPendingQueue] =
    useState<DashboardPendingQueueResponse>({
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
    });
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");

  const canUseAi = hasPermission("can_use_ai");
  const showEpiModule = isTemporarilyVisibleDashboardRoute("/dashboard/epis");
  const showTrainingModule = isTemporarilyVisibleDashboardRoute(
    "/dashboard/trainings",
  );
  const firstName = useMemo(() => {
    const fullName = String(user?.nome || "").trim();
    return fullName ? fullName.split(" ")[0] : "time";
  }, [user?.nome]);

  const nowLabel = useMemo(() => {
    return format(new Date(), "dd/MM/yyyy 'às' HH:mm");
  }, []);

  const quickActions = useMemo<QuickAction[]>(
    () =>
      [
        {
          href: "/dashboard/aprs/new",
          label: "Nova APR",
          description: "Análise preliminar de risco",
          icon: Shield,
        },
        {
          href: "/dashboard/pts/new",
          label: "Nova PT",
          description: "Permissão de trabalho",
          icon: FileText,
        },
        {
          href: "/dashboard/checklists/new",
          label: "Novo Checklist",
          description: "Inspeção operacional",
          icon: ClipboardCheck,
        },
        {
          href: "/dashboard/dds/new",
          label: "Novo DDS",
          description: "Diálogo diário de segurança",
          icon: PlusCircle,
        },
        {
          href: "/dashboard/inspections/new",
          label: "Nova Inspeção",
          description: "Relatório de inspeção",
          icon: AlertTriangle,
        },
        {
          href: "/dashboard/nonconformities/new",
          label: "Nova NC",
          description: "Não conformidade",
          icon: AlertCircle,
        },
      ].filter((action) =>
        isTemporarilyVisibleDashboardRoute(action.href),
      ),
    [],
  );

  const filteredPendingQueueItems = useMemo(() => {
    const visibleItems = pendingQueue.items.filter(
      (item) => !isTemporarilyHiddenDashboardRoute(item.href),
    );

    if (queueFilter === "all") return visibleItems.slice(0, 12);
    if (queueFilter === "critical")
      return visibleItems
        .filter((item) => item.priority === "critical")
        .slice(0, 12);
    return visibleItems
      .filter((item) => item.category === queueFilter)
      .slice(0, 12);
  }, [pendingQueue.items, queueFilter]);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [summaryR, pendingQueueR] = await Promise.allSettled([
          dashboardService.getSummary(),
          dashboardService.getPendingQueue(),
        ]);

        if (summaryR.status === "fulfilled") {
          const summary = summaryR.value;
          setExpiringEpis(summary.expiringEpis);
          setExpiringTrainings(summary.expiringTrainings);
        }

        if (pendingQueueR.status === "fulfilled") {
          setPendingQueue(pendingQueueR.value);
        }
      } catch (error) {
        console.error("Erro ao carregar dados do dashboard:", error);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  const expiredEpisCount = expiringEpis.filter((epi) =>
    isBefore(new Date(epi.validade_ca || ""), new Date()),
  ).length;
  const expiredTrainingsCount = expiringTrainings.filter((t) =>
    isBefore(new Date(t.data_vencimento), new Date()),
  ).length;

  const criticalDocumentsCount = useMemo(
    () =>
      pendingQueue.items.filter(
        (item) => item.category === "documents" && item.priority === "critical",
      ).length,
    [pendingQueue.items],
  );

  const criticalActionsCount = useMemo(
    () =>
      pendingQueue.items.filter(
        (item) => item.category === "actions" && item.priority === "critical",
      ).length,
    [pendingQueue.items],
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
    expiredEpisCount,
    expiredTrainingsCount,
    loading,
    pendingQueue.summary.critical,
    pendingQueue.summary.high,
    pendingQueue.summary.total,
    showEpiModule,
    showTrainingModule,
  ]);

  const complianceLabel = useMemo(() => {
    if (complianceScore == null) return "Calculando";
    if (complianceScore >= 85) return "Excelente";
    if (complianceScore >= 70) return "Controlado";
    if (complianceScore >= 50) return "Atenção";
    return "Crítico";
  }, [complianceScore]);

  const complianceToneClasses = useMemo(() => {
    if (complianceScore == null) {
      return "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-primary)]";
    }
    if (complianceScore >= 85) {
      return "border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)]";
    }
    if (complianceScore >= 70) {
      return "border-[var(--ds-color-info-border)] bg-[var(--ds-color-info-subtle)] text-[var(--ds-color-info)]";
    }
    if (complianceScore >= 50) {
      return "border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]";
    }
    return "border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]";
  }, [complianceScore]);

  const complianceCircle = useMemo(() => {
    const size = 136;
    const strokeWidth = 10;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const score = complianceScore ?? 0;
    const progress = score / 100;
    const strokeDashoffset = circumference * (1 - progress);

    return {
      size,
      strokeWidth,
      radius,
      circumference,
      strokeDashoffset,
      stroke: resolveComplianceStrokeColor(complianceScore),
      score,
    };
  }, [complianceScore]);

  const compliancePillars = useMemo(() => {
    const documentsScore = clampScore(
      100 - pendingQueue.summary.documents * 3 - criticalDocumentsCount * 8,
    );
    const queueScore = clampScore(
      100 - pendingQueue.summary.critical * 9 - pendingQueue.summary.high * 4,
    );
    const healthRawPenalty =
      (showEpiModule ? expiredEpisCount * 6 : 0) +
      (showTrainingModule ? expiredTrainingsCount * 6 : 0);
    const healthScore = clampScore(100 - healthRawPenalty);
    const actionsScore = clampScore(
      100 - pendingQueue.summary.actions * 3 - criticalActionsCount * 8,
    );

    return [
      { id: "documents", label: "Documentos", value: documentsScore },
      { id: "queue", label: "Pendências", value: queueScore },
      { id: "health", label: "Saúde ocupacional", value: healthScore },
      { id: "actions", label: "Ações corretivas", value: actionsScore },
    ];
  }, [
    criticalActionsCount,
    criticalDocumentsCount,
    expiredEpisCount,
    expiredTrainingsCount,
    pendingQueue.summary.actions,
    pendingQueue.summary.critical,
    pendingQueue.summary.documents,
    pendingQueue.summary.high,
    showEpiModule,
    showTrainingModule,
  ]);

  const criticalAlerts = useMemo<CriticalAlert[]>(() => {
    const alerts: CriticalAlert[] = [];

    if (pendingQueue.summary.critical > 0) {
      alerts.push({
        id: "critical-pending",
        title: "Pendências críticas ativas",
        message: `${pendingQueue.summary.critical} item(ns) exigem tratativa imediata.`,
        href: "/dashboard",
        tone: "danger",
      });
    }

    if (showTrainingModule && expiredTrainingsCount > 0) {
      alerts.push({
        id: "expired-trainings",
        title: "Treinamentos vencidos",
        message: `${expiredTrainingsCount} colaborador(es) podem estar com bloqueio operacional.`,
        href: "/dashboard/trainings",
        tone: "warning",
      });
    }

    if (showEpiModule && expiredEpisCount > 0) {
      alerts.push({
        id: "expired-epi",
        title: "EPIs com CA vencido",
        message: `${expiredEpisCount} registro(s) precisam de regularização.`,
        href: "/dashboard/epis",
        tone: "warning",
      });
    }

    if (pendingQueue.summary.actions > 0) {
      alerts.push({
        id: "pending-actions",
        title: "Ações corretivas em aberto",
        message: `${pendingQueue.summary.actions} ação(ões) aguardam conclusão e evidência.`,
        href: "/dashboard/corrective-actions",
        tone: "info",
      });
    }

    if (pendingQueue.degraded) {
      alerts.push({
        id: "degraded-data",
        title: "Dashboard em leitura parcial",
        message: "Uma ou mais fontes não responderam e exigem verificação.",
        href: "/dashboard",
        tone: "warning",
      });
    }

    return alerts.slice(0, 4);
  }, [
    expiredEpisCount,
    expiredTrainingsCount,
    pendingQueue.degraded,
    pendingQueue.summary.actions,
    pendingQueue.summary.critical,
    showEpiModule,
    showTrainingModule,
  ]);

  const kpis = [
    {
      label: "Pendências críticas",
      value: loading ? "—" : pendingQueue.summary.critical.toString(),
      tone: pendingQueue.summary.critical > 0 ? "danger" : "success",
    },
    {
      label: "Total de pendências",
      value: loading ? "—" : pendingQueue.summary.total.toString(),
      tone: pendingQueue.summary.total > 0 ? "warning" : "success",
    },
    ...(showEpiModule
      ? [
          {
            label: "EPIs vencidos",
            value: loading ? "—" : expiredEpisCount.toString(),
            tone: expiredEpisCount > 0 ? "danger" : "success",
          } as const,
        ]
      : []),
    ...(showTrainingModule
      ? [
          {
            label: "Treinamentos vencidos",
            value: loading ? "—" : expiredTrainingsCount.toString(),
            tone: expiredTrainingsCount > 0 ? "danger" : "success",
          } as const,
        ]
      : []),
  ] as const;

  const kpiToneClasses: Record<string, string> = {
    danger:
      "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]",
    warning:
      "border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]",
    success:
      "border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 text-[var(--ds-color-success)]",
  };

  return (
    <div className="ds-dashboard-shell">
      {/* ── Hero Operacional ── */}
      <section className="ds-hero-panel rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Centro Operacional SST
            </p>
            <h1 className="mt-2 text-xl font-bold text-[var(--ds-color-text-primary)] sm:text-2xl">
              {resolveGreeting(new Date().getHours())}, {firstName}
            </h1>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Priorize pendências críticas, mantenha documentos em conformidade e acelere emissões com rastreabilidade.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:w-auto">
            <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                Agora
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                {nowLabel}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                Pendências
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                {loading ? "—" : pendingQueue.summary.total}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                Críticas
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                {loading ? "—" : pendingQueue.summary.critical}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-[var(--ds-color-border-subtle)] pt-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
            <CalendarClock className="h-3.5 w-3.5" />
            Ações rápidas
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {quickActions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 transition-all hover:-translate-y-px hover:border-[var(--ds-color-action-primary)]/35 hover:bg-[var(--ds-color-primary-subtle)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--ds-color-text-primary)]">
                        {action.label}
                      </p>
                      <p className="truncate text-xs text-[var(--ds-color-text-muted)]">
                        {action.description}
                      </p>
                    </div>
                    <ActionIcon className="h-4 w-4 shrink-0 text-[var(--ds-color-action-primary)]" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Score + Alertas Críticos ── */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="ds-dashboard-panel p-5 xl:col-span-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
                Score de conformidade
              </p>
              <h2 className="mt-1 text-base font-bold text-[var(--ds-color-text-primary)]">
                Índice SST da operação
              </h2>
            </div>
            <StatusPill
              tone={
                complianceScore != null && complianceScore < 50
                  ? "danger"
                  : complianceScore != null && complianceScore < 70
                    ? "warning"
                    : complianceScore != null && complianceScore < 85
                      ? "info"
                      : "success"
              }
            >
              {complianceLabel}
            </StatusPill>
          </div>

          <div
            className={cn(
              "rounded-xl border px-4 py-3",
              complianceToneClasses,
            )}
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
                  Score geral
                </p>
                <p className="mt-1 text-3xl font-bold">
                  {complianceScore == null ? "—" : `${complianceScore}/100`}
                </p>
                <p className="mt-1 text-xs opacity-80">
                  Índice visual de conformidade da empresa
                </p>
              </div>

              <div
                className="relative mx-auto h-[8.5rem] w-[8.5rem] sm:mx-0"
                role="img"
                aria-label={
                  complianceScore == null
                    ? "Conformidade em cálculo"
                    : `Conformidade da empresa em ${complianceScore}%`
                }
              >
                <svg
                  viewBox={`0 0 ${complianceCircle.size} ${complianceCircle.size}`}
                  className="h-full w-full -rotate-90"
                >
                  <circle
                    cx={complianceCircle.size / 2}
                    cy={complianceCircle.size / 2}
                    r={complianceCircle.radius}
                    fill="none"
                    stroke="var(--ds-color-border-subtle)"
                    strokeWidth={complianceCircle.strokeWidth}
                  />
                  <circle
                    cx={complianceCircle.size / 2}
                    cy={complianceCircle.size / 2}
                    r={complianceCircle.radius}
                    fill="none"
                    stroke={complianceCircle.stroke}
                    strokeWidth={complianceCircle.strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={`${complianceCircle.circumference} ${complianceCircle.circumference}`}
                    strokeDashoffset={complianceCircle.strokeDashoffset}
                    style={{ transition: "stroke-dashoffset 420ms ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-[1.35rem] font-bold leading-none text-[var(--ds-color-text-primary)]">
                    {complianceScore == null ? "—" : `${complianceCircle.score}%`}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                    Conformidade
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {compliancePillars.map((pillar) => (
              <div
                key={pillar.id}
                className="rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2"
              >
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                  {pillar.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  {pillar.value}/100
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="ds-dashboard-panel p-5 xl:col-span-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
                Alertas críticos
              </p>
              <h2 className="mt-1 text-base font-bold text-[var(--ds-color-text-primary)]">
                Itens que exigem ação imediata
              </h2>
            </div>
            <StatusPill tone={criticalAlerts.length > 0 ? "warning" : "success"}>
              {criticalAlerts.length > 0
                ? `${criticalAlerts.length} ativo(s)`
                : "Sem alertas"}
            </StatusPill>
          </div>

          {criticalAlerts.length === 0 ? (
            <div className="flex h-[7.5rem] items-center justify-center rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-success-subtle)] text-sm font-medium text-[var(--ds-color-success)]">
              Nenhum alerta crítico no momento.
            </div>
          ) : (
            <div className="space-y-2">
              {criticalAlerts.map((alert) => (
                <Link
                  key={alert.id}
                  href={alert.href}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-xl border px-4 py-3 transition-colors",
                    alert.tone === "danger" &&
                      "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] hover:brightness-[0.98]",
                    alert.tone === "warning" &&
                      "border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] hover:brightness-[0.98]",
                    alert.tone === "info" &&
                      "border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] hover:brightness-[0.98]",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      {alert.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                      {alert.message}
                    </p>
                  </div>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-color-text-secondary)]" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={cn(
              "rounded-xl border px-4 py-3",
              kpiToneClasses[kpi.tone],
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
              {kpi.label}
            </p>
            <p className="mt-1 text-2xl font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>

      {canUseAi ? <SophieSupportHub /> : null}

      {/* ── Fila de pendências ── */}
      <div className="ds-dashboard-panel p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
              Fila central de pendências
            </p>
            <h2 className="mt-1 text-base font-bold text-[var(--ds-color-text-primary)]">
              O que exige ação agora
            </h2>
            {pendingQueue.degraded ? (
              <p className="mt-1 text-xs text-[var(--ds-color-warning)]">
                A fila foi carregada com dados parciais. Fontes afetadas:{" "}
                {(pendingQueue.failedSources ?? []).join(", ") ||
                  "indisponíveis"}
                .
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingQueue.degraded ? (
              <StatusPill tone="warning">leitura parcial</StatusPill>
            ) : null}
            {QUEUE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setQueueFilter(filter.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  queueFilter === filter.id
                    ? "border-[var(--ds-color-action-primary)] bg-[color:var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]"
                    : "border-[var(--ds-color-border-subtle)] text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)]/35",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent" />
          </div>
        ) : filteredPendingQueueItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-[var(--ds-color-success)]" />
            <p className="mt-2 text-sm text-[var(--ds-color-text-muted)]">
              Nenhuma pendência encontrada para o filtro atual.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--ds-color-border-subtle)]">
            {filteredPendingQueueItems.map((item) => {
              const ItemIcon = resolveQueueModuleIcon(item.module);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      resolveQueuePriorityClasses(item.priority),
                    )}
                  />
                  <ItemIcon className="h-4 w-4 shrink-0 text-[var(--ds-color-text-muted)]" />
                  <span className="shrink-0 rounded-full bg-[color:var(--ds-color-surface-muted)]/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
                    {item.module}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--ds-color-text-muted)]">
                      {[
                        item.responsible,
                        item.site,
                        `Prazo: ${formatDateOnly(item.dueDate)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={item.href}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-border-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--ds-color-action-primary)] transition-colors hover:border-[var(--ds-color-action-primary)]/35 hover:bg-[color:var(--ds-color-primary-subtle)]"
                    >
                      Abrir
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                    {canUseAi ? (
                      <Link
                        href={buildPendingQueueSophieHref(item)}
                        title="Acionar agente SST"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)] transition-colors hover:brightness-95"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Vencimentos críticos ── */}
      {showEpiModule || showTrainingModule ? (
      <div className="ds-dashboard-panel p-5">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">
            Vencimentos críticos
          </h2>
          <div className="flex flex-wrap gap-2">
            {showEpiModule ? (
            <StatusPill tone={expiredEpisCount > 0 ? "danger" : "warning"}>
              {expiredEpisCount} EPI{expiredEpisCount === 1 ? "" : "s"} vencido
              {expiredEpisCount === 1 ? "" : "s"}
            </StatusPill>
            ) : null}
            {showTrainingModule ? (
            <StatusPill tone={expiredTrainingsCount > 0 ? "danger" : "warning"}>
              {expiredTrainingsCount} treinamento
              {expiredTrainingsCount === 1 ? "" : "s"} vencido
              {expiredTrainingsCount === 1 ? "" : "s"}
            </StatusPill>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* EPIs */}
          {showEpiModule ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center text-sm font-bold text-[var(--ds-color-text-primary)]">
                <AlertCircle className="mr-2 h-4 w-4 text-[var(--ds-color-warning)]" />
                EPIs
              </h3>
              <Link
                href="/dashboard/epis"
                className="ds-section-link text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline"
              >
                Ver todos
              </Link>
            </div>
            {loading ? (
              <div className="flex h-24 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent" />
              </div>
            ) : expiringEpis.length > 0 ? (
              <div className="space-y-2">
                {expiringEpis.slice(0, 5).map((epi) => {
                  const isExpired = isBefore(
                    new Date(epi.validade_ca || ""),
                    new Date(),
                  );
                  return (
                    <div
                      key={epi.id}
                      className="flex items-center justify-between rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-2 w-2 rounded-full ${isExpired ? "bg-[var(--ds-color-danger)]" : "bg-[var(--ds-color-warning)]"}`}
                        />
                        <div>
                          <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                            {epi.nome}
                          </p>
                          <p className="text-xs text-[var(--ds-color-text-muted)]">
                            CA: {epi.ca}
                          </p>
                        </div>
                      </div>
                      <StatusPill tone={isExpired ? "danger" : "warning"}>
                        {isExpired
                          ? "Vencido"
                          : `Vence ${format(new Date(epi.validade_ca || ""), "dd/MM/yyyy")}`}
                      </StatusPill>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-[var(--ds-color-success)]" />
                <p className="mt-2 text-sm text-[var(--ds-color-text-muted)]">
                  Todos os EPIs estão com CA em dia.
                </p>
              </div>
            )}
          </div>
          ) : null}

          {/* Treinamentos */}
          {showTrainingModule ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center text-sm font-bold text-[var(--ds-color-text-primary)]">
                <GraduationCap className="mr-2 h-4 w-4 text-[var(--ds-color-warning)]" />
                Treinamentos
              </h3>
              <Link
                href="/dashboard/trainings"
                className="ds-section-link text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline"
              >
                Ver todos
              </Link>
            </div>
            {loading ? (
              <div className="flex h-24 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent" />
              </div>
            ) : expiringTrainings.length > 0 ? (
              <div className="space-y-2">
                {expiringTrainings.slice(0, 5).map((training) => {
                  const isExpired = isBefore(
                    new Date(training.data_vencimento),
                    new Date(),
                  );
                  return (
                    <div
                      key={training.id}
                      className="flex items-center justify-between rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-2 w-2 rounded-full ${isExpired ? "bg-[var(--ds-color-danger)]" : "bg-[var(--ds-color-warning)]"}`}
                        />
                        <div>
                          <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                            {training.nome}
                          </p>
                          <p className="text-xs text-[var(--ds-color-text-muted)]">
                            {training.user?.nome || "Colaborador"}
                          </p>
                        </div>
                      </div>
                      <StatusPill tone={isExpired ? "danger" : "warning"}>
                        {isExpired
                          ? "Vencido"
                          : `Vence ${format(new Date(training.data_vencimento), "dd/MM/yyyy")}`}
                      </StatusPill>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-[var(--ds-color-success)]" />
                <p className="mt-2 text-sm text-[var(--ds-color-text-muted)]">
                  Todos os treinamentos estão em dia.
                </p>
              </div>
            )}
          </div>
          ) : null}
        </div>
      </div>
      ) : null}
    </div>
  );
}
