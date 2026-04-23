"use client";

import { useCallback, useMemo } from "react";
import {
  AlertTriangle,
  Clock,
  ClipboardCheck,
  FileText,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import { type DashboardSummaryResponse } from "@/services/dashboardService";
import { useAuth } from "@/context/AuthContext";
import { DashboardKPIs, type KpiTone } from "@/components/dashboard/DashboardKPIs";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import {
  DashboardPrimaryActions,
  type DashboardPrimaryActionItem,
} from "@/components/dashboard/DashboardPrimaryActions";
import { DashboardWorkArea } from "@/components/dashboard/DashboardWorkArea";
import {
  PendingQueueProvider,
} from "@/components/dashboard/PendingQueue";
import { useDynamicGreeting } from "@/hooks/useDynamicGreeting";
import { useDashboardData } from "@/hooks/useDashboardData";

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
  const firstName = useMemo(
    () => (user?.nome ?? "").split(" ")[0] || "Administrador",
    [user?.nome],
  );

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
    const epiPenalty = Math.min(14, expiredEpisCount * 3.5);
    const trainingPenalty = Math.min(14, expiredTrainingsCount * 3.5);
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

  const operationalStatus = useMemo(() => {
    if (loadError) {
      return {
        tone: "warning" as const,
        title: "Leitura parcial do painel",
        description:
          "Parte das fontes operacionais falhou. Revise a fila e confirme os blocos com ressalvas.",
      };
    }

    if (loading) {
      return {
        tone: "neutral" as const,
        title: "Atualizando operação",
        description:
          "Consolidando pendências, indicadores e atividade recente para a abertura do turno.",
      };
    }

    if (pendingQueue.summary.critical > 0) {
      return {
        tone: "danger" as const,
        title: `${pendingQueue.summary.critical} item(ns) crítico(s) na fila`,
        description:
          "Existem pendências que exigem tratativa imediata antes de seguir com a rotina operacional.",
      };
    }

    if (pendingQueue.summary.slaBreached > 0) {
      return {
        tone: "warning" as const,
        title: `${pendingQueue.summary.slaBreached} item(ns) fora do SLA`,
        description:
          "A operação está estável, mas a fila já contém atrasos que precisam ser tratados hoje.",
      };
    }

    return {
      tone: "success" as const,
      title: "Operação normal",
      description:
        "A fila crítica está sob controle e o painel está pronto para acompanhamento do dia.",
    };
  }, [
    loadError,
    loading,
    pendingQueue.summary.critical,
    pendingQueue.summary.slaBreached,
  ]);

  const primaryActions = useMemo<DashboardPrimaryActionItem[]>(
    () => [
      { label: "Nova APR", href: "/dashboard/aprs/new", Icon: ShieldAlert },
      { label: "Novo RDO", href: "/dashboard/rdos", Icon: FileText },
      { label: "Novo DDS", href: "/dashboard/dds/new", Icon: MessageSquare },
      { label: "Inspeção", href: "/dashboard/inspections/new", Icon: ClipboardCheck },
      {
        label: "Não conformidade",
        href: "/dashboard/nonconformities/new",
        Icon: AlertTriangle,
      },
      { label: "Início do dia", href: "/dashboard/dids/new", Icon: Clock },
    ],
    [],
  );

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
      <div className="mx-auto max-w-[1440px] space-y-6">
        <DashboardHero
          greeting={greeting}
          firstName={firstName}
          dateLabel={dateLabel}
          statusTone={operationalStatus.tone}
          statusTitle={operationalStatus.title}
          statusDescription={operationalStatus.description}
          loadError={loadError}
          actionsDisabled={loading}
          buildDailyReportPayload={buildDailyReportPayload}
          lastUpdatedAt={dashboardData.lastUpdatedAt}
        />

        <DashboardPrimaryActions items={primaryActions} />

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

        <DashboardWorkArea />
      </div>
    </PendingQueueProvider>
  );
}
