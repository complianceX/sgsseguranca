"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Printer,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  reportsService,
  type Report,
  type ReportQueueJob,
  type ReportQueueStats,
} from "@/services/reportsService";
import { mailLogsService, type MailLogItem } from "@/services/mailLogsService";
import { openPdfForPrint } from "@/lib/print-utils";
import { base64ToPdfBlob } from "@/lib/pdf/pdfFile";
import { PaginationControls } from "@/components/PaginationControls";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { selectedTenantStore } from "@/lib/selectedTenantStore";
import { extractApiErrorMessage } from "@/lib/error-handler";
import { safeFormatDate } from "@/lib/date/safeFormat";
import { safeExternalArtifactUrl } from "@/lib/security/safe-external-url";

const SendMailModal = dynamic(
  () =>
    import("@/components/SendMailModal").then((module) => module.SendMailModal),
  { ssr: false },
);

function enrichReportForPdf(report: Report, companyName?: string | null) {
  return {
    ...report,
    companyName: companyName?.trim() || "Empresa nao informada",
  };
}

function buildReportsSophieHref(params: {
  module: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium";
  status: string;
  responsible?: string | null;
  dueDate?: string | null;
  href?: string | null;
}) {
  const searchParams = new URLSearchParams({
    pendingContext: "true",
    category: "actions",
    module: params.module,
    title: params.title,
    description: params.description,
    priority: params.priority,
    status: params.status,
  });

  if (params.responsible) {
    searchParams.set("responsible", params.responsible);
  }

  if (params.dueDate) {
    searchParams.set("dueDate", params.dueDate);
  }

  if (params.href) {
    searchParams.set("href", params.href);
  }

  return `/dashboard/sst-agent?${searchParams.toString()}`;
}

function resolveJobStateVariant(
  state: string,
): NonNullable<BadgeProps["variant"]> {
  switch (state) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "active":
      return "info";
    case "delayed":
      return "warning";
    case "waiting":
    case "wait":
      return "neutral";
    default:
      return "neutral";
  }
}

function resolveJobStateLabel(state: string) {
  switch (state) {
    case "completed":
      return "Concluido";
    case "failed":
      return "Falhou";
    case "active":
      return "Processando";
    case "delayed":
      return "Atrasado";
    case "waiting":
    case "wait":
      return "Na fila";
    default:
      return state || "Desconhecido";
  }
}

function resolveMailStatusVariant(
  status: string,
): NonNullable<BadgeProps["variant"]> {
  if (status === "success" || status === "sent") {
    return "success";
  }

  if (status === "error" || status === "failed") {
    return "danger";
  }

  if (status === "processing" || status === "queued") {
    return "warning";
  }

  return "neutral";
}

function downloadBlob(blob: Blob, filename: string) {
  const fileUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = fileUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(fileUrl);
}

type SelectedDoc = {
  name: string;
  filename: string;
  base64?: string;
  storedDocument?: {
    documentId: string;
    documentType: string;
  };
};

const EMPTY_QUEUE_STATS: ReportQueueStats = {
  active: 0,
  waiting: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  total: 0,
};

async function generateMonthlyReportArtifact(
  report: Report,
  companyName?: string | null,
  options: { save?: boolean; output?: "base64"; draftWatermark?: boolean } = {
    save: true,
    draftWatermark: false,
  },
) {
  const { generateMonthlyReportPdf } =
    await import("@/lib/pdf/monthlyReportGenerator");

  return generateMonthlyReportPdf(
    enrichReportForPdf(report, companyName),
    options,
  );
}

async function generateMonthlyReportLocalFallback(
  report: Report,
  companyName?: string | null,
) {
  return (await generateMonthlyReportArtifact(report, companyName, {
    save: false,
    output: "base64",
    draftWatermark: false,
  })) as { filename: string; base64: string } | null;
}

export default function ReportsPage() {
  const { hasPermission, user } = useAuth();
  const canViewMail = hasPermission("can_view_mail");
  const canUseAi = hasPermission("can_use_ai");

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [loadingOperations, setLoadingOperations] = useState(true);
  const [refreshingOperations, setRefreshingOperations] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [operationsWarning, setOperationsWarning] = useState<string | null>(
    null,
  );
  const [queueStats, setQueueStats] =
    useState<ReportQueueStats>(EMPTY_QUEUE_STATS);
  const [jobs, setJobs] = useState<ReportQueueJob[]>([]);
  const [mailLogs, setMailLogs] = useState<MailLogItem[]>([]);
  const [mailLogsTotal, setMailLogsTotal] = useState(0);
  const [exportingMailLogs, setExportingMailLogs] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);
  const [lastGeneratedJobId, setLastGeneratedJobId] = useState<string | null>(
    null,
  );
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<SelectedDoc | null>(null);
  const pollingInFlightRef = useRef(false);
  const handledTrackedJobStateRef = useRef<string | null>(null);
  const [isPageVisible, setIsPageVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState === "visible",
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setReportsError(null);
      const response = await reportsService.findPaginated({ page, limit: 9 });
      setReports(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error("Erro ao carregar relatórios:", error);
      setReportsError(
        await extractApiErrorMessage(
          error,
          "Não foi possível carregar a lista de relatórios.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [page]);

  const loadOperations = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoadingOperations(true);
      } else {
        setRefreshingOperations(true);
      }

      try {
        setOperationsWarning(null);
        const operations = await Promise.allSettled([
          reportsService.getQueueStats(),
          reportsService.getJobs(10),
          canViewMail
            ? mailLogsService.list({ page: 1, pageSize: 8 })
            : Promise.resolve(null),
        ]);

        const [statsResult, jobsResult, mailResult] = operations;
        const failedSources: string[] = [];

        if (statsResult.status === "fulfilled") {
          setQueueStats(statsResult.value);
        } else {
          failedSources.push("estatísticas da fila");
          if (mode === "initial") {
            setQueueStats(EMPTY_QUEUE_STATS);
          }
        }

        if (jobsResult.status === "fulfilled") {
          setJobs(jobsResult.value.items || []);
        } else {
          failedSources.push("jobs recentes");
          if (mode === "initial") {
            setJobs([]);
          }
        }

        if (canViewMail) {
          if (mailResult.status === "fulfilled" && mailResult.value) {
            setMailLogs(mailResult.value.items || []);
            setMailLogsTotal(mailResult.value.total || 0);
          } else if (mailResult.status === "rejected") {
            failedSources.push("logs de e-mail");
            if (mode === "initial") {
              setMailLogs([]);
              setMailLogsTotal(0);
            }
          }
        } else {
          setMailLogs([]);
          setMailLogsTotal(0);
        }

        if (failedSources.length > 0) {
          setOperationsWarning(
            `Central operacional carregada com ressalvas: ${failedSources.join(", ")}.`,
          );
        }
      } catch (error) {
        console.error(
          "Erro ao carregar centro operacional de relatórios:",
          error,
        );
        setOperationsWarning(
          await extractApiErrorMessage(
            error,
            "Não foi possível atualizar a fila de PDF e os envios de e-mail.",
          ),
        );
      } finally {
        if (mode === "initial") {
          setLoadingOperations(false);
        } else {
          setRefreshingOperations(false);
        }
      }
    },
    [canViewMail],
  );

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    void loadOperations("initial");
  }, [loadOperations]);

  const hasRunningJobs = useMemo(
    () =>
      jobs.some((job) =>
        ["active", "waiting", "wait", "delayed"].includes(job.state),
      ),
    [jobs],
  );

  useEffect(() => {
    if ((!generating && !hasRunningJobs) || !isPageVisible) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleNext = () => {
      if (cancelled || !isPageVisible) {
        return;
      }

      timeoutId = window.setTimeout(() => {
        void tick();
      }, 5000);
    };

    const tick = async () => {
      if (cancelled || !isPageVisible) {
        return;
      }

      if (pollingInFlightRef.current) {
        scheduleNext();
        return;
      }

      pollingInFlightRef.current = true;
      try {
        await loadOperations("refresh");
        if (page === 1) {
          await loadReports();
        }
      } finally {
        pollingInFlightRef.current = false;
      }

      scheduleNext();
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    generating,
    hasRunningJobs,
    isPageVisible,
    loadOperations,
    loadReports,
    page,
  ]);

  useEffect(() => {
    if (!lastGeneratedJobId) {
      return;
    }

    const trackedJob = jobs.find((job) => job.id === lastGeneratedJobId);
    if (!trackedJob) {
      return;
    }

    const trackedStateKey = `${trackedJob.id}:${trackedJob.state}`;
    if (handledTrackedJobStateRef.current === trackedStateKey) {
      return;
    }

    if (trackedJob.state === "completed") {
      handledTrackedJobStateRef.current = trackedStateKey;
      toast.success("Relatório mensal gerado com sucesso.");
      if (page !== 1) {
        setPage(1);
      } else {
        void loadReports();
      }
      return;
    }

    if (trackedJob.state === "failed") {
      handledTrackedJobStateRef.current = trackedStateKey;
      toast.error(
        trackedJob.failedReason || "A fila de geração retornou falha.",
      );
    }
  }, [jobs, lastGeneratedJobId, loadReports, page]);

  async function handleGenerateReport() {
    try {
      setGenerating(true);
      const now = new Date();
      const mes = now.getMonth() + 1;
      const ano = now.getFullYear();

      const job = await reportsService.generate(mes, ano);
      setLastGeneratedJobId(job.jobId);
      handledTrackedJobStateRef.current = null;
      toast.info(
        "Relatório enfileirado. A central vai acompanhar o processamento.",
      );
      await loadOperations("refresh");
      if (page === 1) {
        await loadReports();
      } else {
        setPage(1);
      }
    } catch (error) {
      console.error("Erro ao gerar relatório:", error);
      toast.error(
        await extractApiErrorMessage(
          error,
          "Não foi possível gerar o relatório mensal.",
        ),
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleRefreshCenter() {
    try {
      await Promise.all([loadReports(), loadOperations("refresh")]);
      toast.success("Central de relatórios atualizada.");
    } catch (error) {
      console.error("Erro ao atualizar central de relatórios:", error);
      toast.error(
        await extractApiErrorMessage(
          error,
          "Não foi possível atualizar a central de relatórios.",
        ),
      );
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Tem certeza que deseja excluir este relatório?"))
      return;

    try {
      await reportsService.delete(id);
      toast.success("Relatório excluído com sucesso.");
      if (reports.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      await loadReports();
      await loadOperations("refresh");
    } catch (error) {
      console.error("Erro ao excluir relatório:", error);
      toast.error(
        await extractApiErrorMessage(
          error,
          "Não foi possível excluir o relatório.",
        ),
      );
    }
  }

  async function handleExportMailLogs() {
    try {
      setExportingMailLogs(true);
      const blob = await mailLogsService.exportCsv();
      downloadBlob(blob, `mail-logs-${format(new Date(), "yyyy-MM-dd")}.csv`);
      toast.success("Logs de e-mail exportados com sucesso.");
    } catch (error) {
      console.error("Erro ao exportar logs de e-mail:", error);
      toast.error(
        await extractApiErrorMessage(
          error,
          "Não foi possível exportar os logs de e-mail.",
        ),
      );
    } finally {
      setExportingMailLogs(false);
    }
  }

  async function handleRequeueMonthlyJob(job: ReportQueueJob) {
    if (!job.month || !job.year) {
      toast.error(
        "Este job não possui mês/ano suficientes para reprocessamento.",
      );
      return;
    }

    try {
      setRefreshingOperations(true);
      const response = await reportsService.generate(job.month, job.year);
      setLastGeneratedJobId(response.jobId);
      toast.success(
        `Relatório ${String(job.month).padStart(2, "0")}/${job.year} reenfileirado com sucesso.`,
      );
      await loadOperations("refresh");
    } catch (error) {
      console.error("Erro ao reenfileirar relatório mensal:", error);
      toast.error(
        await extractApiErrorMessage(
          error,
          "Não foi possível reenfileirar o relatório mensal.",
        ),
      );
    } finally {
      setRefreshingOperations(false);
    }
  }

  async function handleDownloadPdf(report: Report) {
    try {
      const selectedTenant = selectedTenantStore.get();
      const companyName =
        selectedTenant?.companyName || user?.company?.razao_social;
      const access = await reportsService.getPdfAccess(report.id);

      if (access.hasFinalPdf && access.url) {
        const link = document.createElement("a");
        link.href = access.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.click();
        toast.success("PDF oficial do relatório pronto para download.");
        return;
      }

      const fallback = await generateMonthlyReportLocalFallback(
        report,
        companyName,
      );
      if (!fallback?.base64) {
        throw new Error("Não foi possível gerar fallback local do relatório.");
      }

      const fileUrl = URL.createObjectURL(base64ToPdfBlob(fallback.base64));
      const anchor = document.createElement("a");
      anchor.href = fileUrl;
      anchor.download = fallback.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(fileUrl);
      toast.warning(
        access.message ||
          "Este relatório ainda não possui PDF final governado. Foi baixada uma cópia local de contingência.",
      );
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error(
        await extractApiErrorMessage(
          error,
          "Não foi possível gerar o PDF do relatório.",
        ),
      );
    }
  }

  async function handlePrint(report: Report) {
    try {
      const selectedTenant = selectedTenantStore.get();
      const companyName =
        selectedTenant?.companyName || user?.company?.razao_social;
      const access = await reportsService.getPdfAccess(report.id);

      if (access.hasFinalPdf && access.url) {
        openPdfForPrint(access.url, () => {
          toast.info(
            "Pop-up bloqueado. Abrimos o PDF oficial na mesma aba para impressão.",
          );
        });
        return;
      }

      const fallback = await generateMonthlyReportLocalFallback(
        report,
        companyName,
      );
      if (!fallback?.base64) {
        toast.error("Não foi possível preparar o PDF para impressão.");
        return;
      }

      const fileURL = URL.createObjectURL(base64ToPdfBlob(fallback.base64));
      openPdfForPrint(fileURL, () => {
        toast.info(
          "Pop-up bloqueado. Abrimos o PDF na mesma aba para impressão.",
        );
      });
    } catch (error) {
      console.error("Erro ao imprimir relatório:", error);
      toast.error(
        await extractApiErrorMessage(
          error,
          "Não foi possível preparar a impressão do relatório.",
        ),
      );
    }
  }

  async function handleSendEmail(report: Report) {
    try {
      const selectedTenant = selectedTenantStore.get();
      const companyName =
        selectedTenant?.companyName || user?.company?.razao_social;
      const access = await reportsService.getPdfAccess(report.id);

      if (access.hasFinalPdf && !access.degraded) {
        setSelectedDoc({
          name: report.titulo,
          filename: access.originalName || `${report.titulo}.pdf`,
          storedDocument: {
            documentId: report.id,
            documentType: "REPORT",
          },
        });
        setIsMailModalOpen(true);
        return;
      }

      const fallback = await generateMonthlyReportLocalFallback(
        report,
        companyName,
      );
      if (!fallback?.base64) {
        toast.error("Não foi possível preparar o PDF para envio.");
        return;
      }

      setSelectedDoc({
        name: report.titulo,
        filename: fallback.filename,
        base64: fallback.base64,
      });
      setIsMailModalOpen(true);
    } catch (error) {
      console.error("Erro ao preparar e-mail:", error);
      toast.error(
        await extractApiErrorMessage(
          error,
          "Não foi possível preparar o documento para envio.",
        ),
      );
    }
  }

  const recentMailSuccess = useMemo(
    () =>
      mailLogs.filter(
        (item) => item.status === "success" || item.status === "sent",
      ).length,
    [mailLogs],
  );

  const recentMailFailures = useMemo(
    () =>
      mailLogs.filter(
        (item) => item.status === "error" || item.status === "failed",
      ).length,
    [mailLogs],
  );

  return (
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <Badge
              variant="accent"
              className="w-fit uppercase tracking-[0.14em]"
            >
              Centro de geracao e envio
            </Badge>
            <div>
              <CardTitle className="text-xl">Relatórios SGS</CardTitle>
              <CardDescription className="mt-1 max-w-3xl">
                Gere PDFs, acompanhe a fila de processamento, revise o histórico
                documental e monitore envios por e-mail em uma central
                operacional única.
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">Total: {total}</Badge>
            {lastGeneratedJobId ? (
              <Badge variant="neutral">Ultimo job: {lastGeneratedJobId}</Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleRefreshCenter()}
              loading={refreshingOperations}
              leftIcon={
                !refreshingOperations ? (
                  <RefreshCw className="h-4 w-4" />
                ) : undefined
              }
            >
              Atualizar central
            </Button>
            <Button
              type="button"
              onClick={() => void handleGenerateReport()}
              disabled={generating}
              leftIcon={
                !generating ? <BrainCircuit className="h-4 w-4" /> : undefined
              }
            >
              {generating ? "Gerando relatorio" : "Gerar relatorio mensal"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {reportsError ? (
        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-4 py-3 text-sm text-[var(--ds-color-danger-fg)]">
          {reportsError}
        </div>
      ) : null}

      {operationsWarning ? (
        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-4 py-3 text-sm text-[var(--ds-color-warning-fg)]">
          {operationsWarning}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          title="PDF ativos"
          value={queueStats.active}
          description="Jobs em processamento agora"
          icon={<Activity className="h-4 w-4" />}
          tone="info"
        />
        <SummaryCard
          title="PDF aguardando"
          value={queueStats.waiting + queueStats.delayed}
          description="Fila aguardando worker"
          icon={<Clock3 className="h-4 w-4" />}
          tone="warning"
        />
        <SummaryCard
          title="PDF concluidos"
          value={queueStats.completed}
          description="Jobs finalizados com sucesso"
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
        />
        <SummaryCard
          title="PDF falhos"
          value={queueStats.failed}
          description="Geracoes com erro"
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="danger"
        />
        <SummaryCard
          title="E-mails recentes"
          value={canViewMail ? mailLogsTotal : "--"}
          description={
            canViewMail
              ? `${recentMailSuccess} enviados / ${recentMailFailures} falhos`
              : "Permissao necessaria"
          }
          icon={<Mail className="h-4 w-4" />}
          tone="accent"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr,1fr]">
        <Card tone="default" padding="lg">
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-lg">Fila de geracao PDF</CardTitle>
              <CardDescription>
                Monitoramento da fila BullMQ com status de jobs, tentativas e
                retorno final.
              </CardDescription>
            </div>
            <Badge variant={hasRunningJobs ? "warning" : "success"}>
              {hasRunningJobs ? "Monitorando jobs" : "Fila estavel"}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-3">
            {loadingOperations ? (
              <div className="flex items-center justify-center py-12 text-[var(--color-text-secondary)]">
                <Loader2 className="h-5 w-5 motion-safe:animate-spin" />
              </div>
            ) : jobs.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title="Nenhum job recente"
                description="Assim que um PDF for solicitado, o processamento vai aparecer aqui com status e rastreabilidade."
              />
            ) : (
              jobs.map((job) => {
                const resultUrl = safeExternalArtifactUrl(job.result?.url);
                return (
                <div
                  key={job.id}
                  className="rounded-[var(--ds-radius-lg)] border border-[var(--color-border-subtle)] bg-[color:var(--color-surface)]/80 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={resolveJobStateVariant(job.state)}>
                          {resolveJobStateLabel(job.state)}
                        </Badge>
                        <span className="text-[11px] text-[var(--color-text-secondary)]">
                          Job {job.id}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-[var(--color-text)]">
                        {job.reportType === "monthly" && job.month && job.year
                          ? `Relatório mensal ${String(job.month).padStart(2, "0")}/${job.year}`
                          : job.name || "Geracao PDF"}
                      </p>
                    </div>

                    {resultUrl ? (
                      <a
                        href={resultUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                      >
                        Abrir PDF
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-[var(--color-text-secondary)] md:grid-cols-3">
                    <MetricCell
                      label="Criado em"
                      value={safeFormatDate(job.createdAt, "dd/MM HH:mm", {
                        locale: ptBR,
                      })}
                    />
                    <MetricCell
                      label="Tentativas"
                      value={String(job.attemptsMade ?? 0)}
                    />
                    <MetricCell
                      label="Finalizado"
                      value={safeFormatDate(
                        job.finishedAt,
                        "dd/MM HH:mm",
                        { locale: ptBR },
                        "Em aberto",
                      )}
                    />
                  </div>

                  {job.failedReason ? (
                    <div className="mt-3 rounded-xl border border-[color:var(--ds-color-danger)]/20 bg-[color:var(--ds-color-danger-subtle)] p-3 text-xs text-[var(--ds-color-danger)]">
                      {job.failedReason}
                    </div>
                  ) : null}

                  {job.state === "failed" || job.failedReason ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.reportType === "monthly" && job.month && job.year ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRequeueMonthlyJob(job)}
                          leftIcon={<RefreshCw className="h-4 w-4" />}
                        >
                          Reenfileirar
                        </Button>
                      ) : null}
                      {canUseAi ? (
                        <Link
                          href={buildReportsSophieHref({
                            module: "Relatório PDF",
                            title:
                              job.reportType === "monthly" &&
                              job.month &&
                              job.year
                                ? `Falha no relatório mensal ${String(job.month).padStart(2, "0")}/${job.year}`
                                : `Falha no job ${job.id}`,
                            description:
                              job.failedReason ||
                              "Job de geração PDF falhou e precisa de análise operacional.",
                            priority: "high",
                            status: job.state,
                            dueDate: job.finishedAt || job.createdAt,
                            href: "/dashboard/reports",
                          })}
                          className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-3 py-2 text-[13px] font-semibold text-[var(--ds-color-warning)] motion-safe:transition-colors hover:brightness-95"
                        >
                          <BrainCircuit className="h-4 w-4" />
                          Analisar com SOPHIE
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card tone="default" padding="lg">
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-lg">Envios por e-mail</CardTitle>
              <CardDescription>
                Rastreio de entregas recentes com status, destinatário, assunto
                e falhas de envio.
              </CardDescription>
            </div>
            {canViewMail ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleExportMailLogs()}
                loading={exportingMailLogs}
                leftIcon={
                  !exportingMailLogs ? (
                    <Download className="h-4 w-4" />
                  ) : undefined
                }
              >
                Exportar CSV
              </Button>
            ) : null}
          </CardHeader>

          <CardContent className="space-y-3">
            {!canViewMail ? (
              <EmptyState
                icon={<Mail className="h-5 w-5" />}
                title="Sem permissão para logs de e-mail"
                description="Peça a liberação can_view_mail para acompanhar o histórico de envio dentro desta central."
              />
            ) : loadingOperations ? (
              <div className="flex items-center justify-center py-12 text-[var(--color-text-secondary)]">
                <Loader2 className="h-5 w-5 motion-safe:animate-spin" />
              </div>
            ) : mailLogs.length === 0 ? (
              <EmptyState
                icon={<Mail className="h-5 w-5" />}
                title="Nenhum envio recente"
                description="Assim que um PDF for enviado por e-mail, ele será listado aqui com rastreabilidade completa."
              />
            ) : (
              <>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {mailLogsTotal} registro(s) encontrados. Exibindo os mais
                  recentes desta empresa.
                </p>
                {mailLogs.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[var(--ds-radius-lg)] border border-[var(--color-border-subtle)] bg-[color:var(--color-surface)]/80 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={resolveMailStatusVariant(item.status)}
                          >
                            {item.status === "success" || item.status === "sent"
                              ? "Enviado"
                              : item.status === "error" ||
                                  item.status === "failed"
                                ? "Falhou"
                                : item.status}
                          </Badge>
                          {item.using_test_account ? (
                            <Badge variant="warning">Sandbox</Badge>
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-[var(--color-text)]">
                          {item.subject}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-[var(--color-text-secondary)] sm:grid-cols-2">
                      <MetricCell label="Destino" value={item.to} />
                      <MetricCell
                        label="Arquivo"
                        value={item.filename || "-"}
                      />
                      <MetricCell
                        label="Criado em"
                        value={safeFormatDate(
                          item.created_at,
                          "dd/MM/yyyy HH:mm",
                          { locale: ptBR },
                        )}
                      />
                      <MetricCell
                        label="Provider"
                        value={item.message_id || "Sem message id"}
                      />
                    </div>

                    {item.error_message ? (
                      <div className="mt-3 rounded-xl border border-[color:var(--ds-color-danger)]/20 bg-[color:var(--ds-color-danger-subtle)] p-3 text-xs text-[var(--ds-color-danger)]">
                        {item.error_message}
                      </div>
                    ) : null}

                    {(item.status === "error" || item.status === "failed") &&
                    canUseAi ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={buildReportsSophieHref({
                            module: "E-mail",
                            title: `Falha de envio para ${item.to}`,
                            description:
                              item.error_message ||
                              `Envio do arquivo ${item.filename || "sem nome"} falhou e requer análise.`,
                            priority: "medium",
                            status: item.status,
                            responsible: item.to,
                            dueDate: item.created_at,
                            href: "/dashboard/reports",
                          })}
                          className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-3 py-2 text-[13px] font-semibold text-[var(--ds-color-warning)] motion-safe:transition-colors hover:brightness-95"
                        >
                          <BrainCircuit className="h-4 w-4" />
                          Analisar com SOPHIE
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex justify-center py-10 text-[var(--color-text-secondary)]">
            <Loader2 className="h-8 w-8 motion-safe:animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <Card
            tone="muted"
            className="col-span-full border-dashed p-10 text-center"
          >
            <FileText className="mx-auto h-12 w-12 text-[var(--color-text-muted)]/40" />
            <h3 className="mt-4 text-base font-semibold text-[var(--color-text)]">
              Nenhum relatório gerado
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Gere o primeiro relatório mensal para consolidar indicadores, PDF
              e distribuição por e-mail.
            </p>
          </Card>
        ) : (
          reports.map((report) => (
            <Card
              key={report.id}
              tone="default"
              padding="none"
              interactive
              className="overflow-hidden"
            >
              <div className="border-b border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/18 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="primary"
                        className="text-[11px] uppercase tracking-[0.12em]"
                      >
                        <Calendar className="h-3 w-3" />
                        {report.mes}/{report.ano}
                      </Badge>
                      <span className="text-[11px] text-[var(--color-text-secondary)]">
                        {safeFormatDate(
                          report.created_at,
                          "dd/MM/yyyy 'às' HH:mm",
                          { locale: ptBR },
                        )}
                      </span>
                    </div>
                    <h3 className="mt-2 text-[0.95rem] font-semibold text-[var(--color-text)]">
                      {report.titulo}
                    </h3>
                  </div>
                  <button
                    onClick={() => void handleDelete(report.id)}
                    className="rounded-lg border border-transparent p-1.5 text-[var(--color-text-secondary)] motion-safe:transition-colors hover:border-[color:var(--color-danger)]/20 hover:bg-[color:var(--ds-color-danger-subtle)] hover:text-[var(--color-danger)]"
                    title="Excluir relatório"
                    aria-label="Excluir relatório"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <CardContent className="space-y-3.5 p-4">
                <div className="grid grid-cols-2 gap-2.5">
                  <MetricCell
                    label="APRs"
                    value={String(report.estatisticas.aprs_count)}
                  />
                  <MetricCell
                    label="PTs"
                    value={String(report.estatisticas.pts_count)}
                  />
                  <MetricCell
                    label="DDS"
                    value={String(report.estatisticas.dds_count)}
                  />
                  <MetricCell
                    label="Checks"
                    value={String(report.estatisticas.checklists_count)}
                  />
                </div>

                <div className="rounded-xl border border-[color:var(--color-primary)]/16 bg-[color:var(--ds-color-primary-subtle)] p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <BrainCircuit className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
                      Insight SGS
                    </span>
                  </div>
                  <p className="line-clamp-4 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
                    {report.analise_gandra}
                  </p>
                </div>
              </CardContent>

              <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/12 px-3.5 py-3">
                <span className="text-[11px] text-[var(--color-text-secondary)]">
                  Exportar, imprimir ou compartilhar
                </span>
                <div className="flex gap-1.5">
                  <ActionIcon
                    onClick={() => void handlePrint(report)}
                    title="Imprimir relatório"
                    icon={<Printer className="h-4 w-4" />}
                  />
                  <ActionIcon
                    onClick={() => void handleSendEmail(report)}
                    title="Enviar relatório"
                    icon={<Mail className="h-4 w-4" />}
                  />
                  <ActionIcon
                    onClick={() => void handleDownloadPdf(report)}
                    title="Baixar relatório"
                    icon={<Download className="h-4 w-4" />}
                  />
                  <ActionIcon
                    title="Ver estatísticas"
                    icon={<BarChart3 className="h-4 w-4" />}
                  />
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {!loading && total > 0 ? (
        <PaginationControls
          page={page}
          lastPage={lastPage}
          total={total}
          onPrev={handlePrevPage}
          onNext={handleNextPage}
        />
      ) : null}

      {selectedDoc ? (
        <SendMailModal
          isOpen={isMailModalOpen}
          onClose={() => {
            setIsMailModalOpen(false);
            setSelectedDoc(null);
            void loadOperations("refresh");
          }}
          documentName={selectedDoc.name}
          filename={selectedDoc.filename}
          base64={selectedDoc.base64}
          storedDocument={selectedDoc.storedDocument}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon,
  tone,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: ReactNode;
  tone: "info" | "warning" | "success" | "danger" | "accent";
}) {
  const badgeVariant: NonNullable<BadgeProps["variant"]> =
    tone === "info"
      ? "info"
      : tone === "warning"
        ? "warning"
        : tone === "success"
          ? "success"
          : tone === "danger"
            ? "danger"
            : "accent";

  return (
    <Card interactive padding="md">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <Badge variant={badgeVariant}>{icon}</Badge>
          <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
            {title}
          </span>
        </div>
        <CardTitle className="text-3xl">{value}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[color:var(--color-surface-elevated)]/85 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">
        {value}
      </p>
    </div>
  );
}

function ActionIcon({
  onClick,
  title,
  icon,
}: {
  onClick?: () => void;
  title: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-transparent p-1.5 text-[var(--color-text-secondary)] motion-safe:transition-colors hover:border-[color:var(--color-primary)]/18 hover:bg-[color:var(--ds-color-primary-subtle)] hover:text-[var(--color-primary)]"
      title={title}
      aria-label={title}
    >
      {icon}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--color-border-subtle)] bg-[color:var(--color-surface)]/70 px-6 py-10 text-center">
      <div className="rounded-full bg-[color:var(--ds-color-primary-subtle)] p-3 text-[var(--color-primary)]">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-[var(--color-text)]">
        {title}
      </h3>
      <p className="mt-2 max-w-md text-sm text-[var(--color-text-secondary)]">
        {description}
      </p>
    </div>
  );
}
