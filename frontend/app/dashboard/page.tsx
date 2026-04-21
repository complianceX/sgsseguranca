"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  FileText,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { type DashboardSummaryResponse } from "@/services/dashboardService";
import { useAuth } from "@/context/AuthContext";
import { isTemporarilyVisibleDashboardRoute } from "@/lib/temporarilyHiddenModules";
import { DashboardKPIs, type KpiTone } from "@/components/dashboard/DashboardKPIs";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { DailyReportButton } from "@/components/dashboard/DailyReportButton";
import {
  PendingQueue,
  PendingQueueFilters,
  PendingQueueProvider,
} from "@/components/dashboard/PendingQueue";
import { SiteCompliance } from "@/components/dashboard/SiteCompliance";
import { SSTScoreRings } from "@/components/dashboard/SSTScoreRings";
import { useDynamicGreeting } from "@/hooks/useDynamicGreeting";
import { useDashboardData } from "@/hooks/useDashboardData";
import { LastUpdatedLabel } from "./_components/LastUpdatedLabel";

type PendingApprovals = DashboardSummaryResponse["pendingApprovals"];
type RiskSummary = DashboardSummaryResponse["riskSummary"];

const EMPTY_APPROVALS: PendingApprovals = {
  aprs: 0,
  pts: 0,
  checklists: 0,
  nonconformities: 0,
};

const EMPTY_RISK: RiskSummary = { alto: 0, medio: 0, baixo: 0 };

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

function parseValidDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { greeting, dateLabel } = useDynamicGreeting();
  const firstName = useMemo(() => (user?.nome ?? "").split(" ")[0], [user?.nome]);

  const showEpiModule = isTemporarilyVisibleDashboardRoute("/dashboard/epis");
  const showTrainingModule = isTemporarilyVisibleDashboardRoute("/dashboard/trainings");

  const dashboardData = useDashboardData();
  const summaryLoading = dashboardData.summary.loading;
  const queueLoading = dashboardData.pendingQueue.loading;
  const summary = dashboardData.summary.data;
  const pendingQueue = dashboardData.pendingQueue.data;

  const expiringEpis = useMemo(() => summary?.expiringEpis ?? [], [summary?.expiringEpis]);
  const expiringTrainings = useMemo(
    () => summary?.expiringTrainings ?? [],
    [summary?.expiringTrainings],
  );
  const pendingApprovals = summary?.pendingApprovals ?? EMPTY_APPROVALS;
  const riskSummary = summary?.riskSummary ?? EMPTY_RISK;
  const siteCompliance = useMemo(
    () => summary?.siteCompliance ?? [],
    [summary?.siteCompliance],
  );
  const recentActivities = useMemo(
    () => summary?.recentActivities ?? [],
    [summary?.recentActivities],
  );

  const loading = summaryLoading || queueLoading;
  const loadError =
    dashboardData.summary.error?.message ??
    dashboardData.pendingQueue.error?.message ??
    null;

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
    const totalPenalty = Math.min(14, Math.max(0, pendingQueue.summary.total - 5) * 1.2);
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
    showEpiModule,
    showTrainingModule,
    expiredEpisCount,
    expiredTrainingsCount,
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

  const criticalHighTotal = pendingQueue.summary.critical + pendingQueue.summary.high;
  const criticalHighTone: KpiTone =
    pendingQueue.summary.critical > 0
      ? "danger"
      : pendingQueue.summary.high > 0
        ? "warning"
        : "success";

  const docHealthTotal = pendingQueue.summary.documents + pendingQueue.summary.health;
  const docHealthTone: KpiTone = docHealthTotal > 0 ? "warning" : "success";

  const buildDailyReportPayload = useCallback(
    () => ({
      companyName: user?.company?.razao_social ?? null,
      siteName: null,
      userName: user?.nome ?? null,
      generatedAt: new Date().toISOString(),
      summary: pendingQueue.summary,
      complianceScore,
      pendingApprovals,
      riskSummary,
      recentActivities: recentActivities.map((a) => ({
        type: undefined,
        title: a.title,
        description: a.description,
        timestamp: a.date,
        user: undefined,
      })),
      siteCompliance: siteCompliance.map((s) => ({
        siteId: s.id,
        siteName: s.nome,
        score: s.taxa,
        label: s.taxa >= 80 ? "Conforme" : s.taxa >= 50 ? "Atenção" : "Crítico",
      })),
    }),
    [
      user,
      pendingQueue.summary,
      complianceScore,
      pendingApprovals,
      riskSummary,
      recentActivities,
      siteCompliance,
    ],
  );

  return (
    <PendingQueueProvider>
      <div className="mx-auto max-w-[1440px] space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
              Painel Operacional
            </p>
            <h1 className="mt-0.5 text-[24px] font-black leading-tight tracking-[-0.03em] text-[var(--title)] sm:text-[28px]">
              {greeting}, {firstName || "Administrador"}
              <span className="ml-2 text-[13px] font-normal text-[var(--ds-color-text-secondary)] sm:ml-3 sm:text-[15px]">
                {dateLabel}
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loadError && (
              <p
                role="alert"
                className="rounded-lg border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-3 py-1.5 text-xs text-[var(--ds-color-warning-fg)]"
              >
                {loadError}
              </p>
            )}
            <DailyReportButton disabled={loading} buildPayload={buildDailyReportPayload} />
            {!queueLoading &&
              pendingQueue.summary.critical === 0 &&
              pendingQueue.summary.slaBreached === 0 && (
                <div
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] px-3 py-1.5"
                  aria-live="polite"
                >
                  <span
                    className="h-2 w-2 rounded-full bg-[var(--ds-color-success)]"
                    aria-hidden="true"
                  />
                  <span className="text-xs font-semibold text-[var(--ds-color-success-fg)]">
                    Operação normal
                  </span>
                </div>
              )}
            <LastUpdatedLabel lastUpdatedAt={dashboardData.lastUpdatedAt} />
          </div>
        </header>

        <PendingQueueFilters />

        <nav aria-label="Ações rápidas">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
            Ações Rápidas
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              { label: "Novo DDS", href: "/dashboard/dds/novo", Icon: MessageSquare },
              { label: "Início do dia", href: "/dashboard/dids/novo", Icon: Clock },
              { label: "Nova APR", href: "/dashboard/aprs/novo", Icon: ShieldAlert },
              { label: "Novo RDO", href: "/dashboard/rdos/novo", Icon: FileText },
              { label: "Inspeção", href: "/dashboard/inspections/novo", Icon: ClipboardCheck },
              {
                label: "Não conformidade",
                href: "/dashboard/nonconformities/novo",
                Icon: AlertTriangle,
              },
            ].map(({ label, href, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className="ds-dashboard-link-card ds-dashboard-link-card--center group px-2 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-action-primary)]"
              >
                <span
                  className="ds-dashboard-link-card__icon h-10 w-10"
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4 motion-safe:transition-colors" />
                </span>
                <span className="text-[11px] font-semibold leading-tight text-[var(--ds-color-text-secondary)] motion-safe:transition-colors group-hover:text-[var(--title)]">
                  {label}
                </span>
              </Link>
            ))}
          </div>
        </nav>

        <DashboardKPIs
          loading={loading}
          queueLoading={queueLoading}
          complianceScore={complianceScore}
          complianceTone={complianceTone}
          complianceLabel={resolveComplianceLabel(complianceScore)}
          criticalCount={pendingQueue.summary.critical}
          highCount={pendingQueue.summary.high}
          criticalHighTotal={criticalHighTotal}
          criticalHighTone={criticalHighTone}
          slaTotal={pendingQueue.summary.total}
          slaBreached={pendingQueue.summary.slaBreached}
          slaDueToday={pendingQueue.summary.slaDueToday}
          documentsCount={pendingQueue.summary.documents}
          healthCount={pendingQueue.summary.health}
          docHealthTotal={docHealthTotal}
          docHealthTone={docHealthTone}
        />

        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <ActivityFeed />
          <SiteCompliance />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
          <PendingQueue />
          <SSTScoreRings />
        </div>

        <nav aria-label="Acesso rápido aos módulos">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
            Acesso rápido
          </p>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3 md:grid-cols-6">
            {[
              {
                label: "APRs",
                href: "/dashboard/aprs",
                badge: pendingApprovals.aprs,
                Icon: ShieldAlert,
              },
              { label: "PTs", href: "/dashboard/pts", badge: pendingApprovals.pts, Icon: FileText },
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
                aria-label={badge > 0 ? `${label} — ${badge} pendentes` : label}
                className="ds-dashboard-link-card group px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-action-primary)]"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="ds-dashboard-link-card__icon h-9 w-9"
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4 motion-safe:transition-colors" />
                  </span>
                  {badge > 0 && (
                    <span className="ds-dashboard-link-card__badge" aria-hidden="true">
                      {badge}
                    </span>
                  )}
                </div>
                <span className="text-[13px] font-semibold text-[var(--ds-color-text-secondary)] motion-safe:transition-colors group-hover:text-[var(--title)]">
                  {label}
                </span>
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </PendingQueueProvider>
  );
}
