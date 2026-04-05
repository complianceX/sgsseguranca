"use client";

import { useState, useEffect, useCallback, useDeferredValue } from "react";
import { aprsService, Apr } from "@/services/aprsService";
import { aiService } from "@/services/aiService";
import { signaturesService } from "@/services/signaturesService";
import { toast } from "sonner";
import { handleApiError } from "@/lib/error-handler";
import { openPdfForPrint, openUrlInNewTab } from "@/lib/print-utils";
import { isAiEnabled } from "@/lib/featureFlags";
import { base64ToPdfBlob, base64ToPdfFile } from "@/lib/pdf/pdfFile";
import {
  AprDueFilter,
  AprSortOption,
} from "../components/aprListingUtils";

interface Insight {
  type: "warning" | "success" | "info";
  title: string;
  message: string;
  action: string;
}

type AprOverviewMetrics = {
  totalAprs: number;
  aprovadas: number;
  pendentes: number;
  riscosCriticos: number;
  mediaScoreRisco: number;
};

type UseAprsOptions = {
  initialSearchTerm?: string;
  initialStatusFilter?: string;
  initialSiteFilter?: string;
  initialResponsibleFilter?: string;
  initialDueFilter?: AprDueFilter;
  initialSortBy?: AprSortOption;
  initialPage?: number;
};

async function loadAprPdfGenerator() {
  return import("@/lib/pdf/aprGenerator");
}

export function useAprs(options?: UseAprsOptions) {
  const [aprs, setAprs] = useState<Apr[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overviewMetrics, setOverviewMetrics] =
    useState<AprOverviewMetrics | null>(null);
  const [searchTerm, setSearchTerm] = useState(options?.initialSearchTerm || "");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState(
    options?.initialStatusFilter || "",
  );
  const [siteFilter, setSiteFilter] = useState(options?.initialSiteFilter || "");
  const [responsibleFilter, setResponsibleFilter] = useState(
    options?.initialResponsibleFilter || "",
  );
  const [dueFilter, setDueFilter] = useState<AprDueFilter>(
    options?.initialDueFilter || "",
  );
  const [sortBy, setSortBy] = useState<AprSortOption>(
    options?.initialSortBy || "priority",
  );
  const [insights, setInsights] = useState<Insight[]>([]);
  const [page, setPage] = useState(options?.initialPage || 1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  // Estados para o modal de e-mail
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{
    name: string;
    filename: string;
    base64?: string;
    storedDocument?: {
      documentId: string;
      documentType: string;
    };
  } | null>(null);

  const buildAprFilename = useCallback(
    (apr: Apr) =>
      `APR_${String(apr.numero || apr.titulo || apr.id).replace(/\s+/g, "_")}.pdf`,
    [],
  );

  const loadAprs = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [res, analytics] = await Promise.all([
        aprsService.findPaginated({
          page,
          limit,
          search: deferredSearchTerm || undefined,
          status: statusFilter || undefined,
          siteId: siteFilter || undefined,
          responsibleId: responsibleFilter || undefined,
          dueFilter: dueFilter || undefined,
          sort: sortBy,
        }),
        aprsService.getAnalyticsOverview(),
      ]);
      setAprs(res.data);
      setTotal(res.total);
      setLastPage(res.lastPage);
      setOverviewMetrics(analytics);
    } catch (error) {
      setLoadError("Nao foi possivel carregar a lista de APRs.");
      setOverviewMetrics(null);
      handleApiError(error, "APRs");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    deferredSearchTerm,
    statusFilter,
    siteFilter,
    responsibleFilter,
    dueFilter,
    sortBy,
  ]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [deferredSearchTerm, statusFilter, siteFilter, responsibleFilter, dueFilter, sortBy]);

  const loadInsights = useCallback(async () => {
    if (!isAiEnabled()) return;
    try {
      const result = await aiService.getInsights();
      const aprInsights = result.insights.filter(
        (i: Insight) =>
          i.action.includes("/aprs") || i.title.toLowerCase().includes("apr"),
      );
      setInsights(aprInsights);
    } catch (error) {
      console.error("Erro ao carregar insights:", error);
    }
  }, []);

  useEffect(() => {
    loadAprs();
    loadInsights();
  }, [loadAprs, loadInsights]);

  const ensureGovernedPdf = useCallback(
    async (apr: Apr) => {
      const access = await aprsService.getPdfAccess(apr.id);
      if (access.hasFinalPdf) {
        return access;
      }

      if (apr.status !== "Aprovada") {
        return null;
      }

      const [fullApr, signatures, evidences, { generateAprPdf }] =
        await Promise.all([
          aprsService.findOne(apr.id),
          signaturesService.findByDocument(apr.id, "APR"),
          aprsService.listAprEvidences(apr.id),
          loadAprPdfGenerator(),
        ]);
      const generatedPdf = (await generateAprPdf(fullApr, signatures, {
        save: false,
        output: "base64",
        evidences,
        draftWatermark: false,
      })) as { base64: string; filename: string } | undefined;

      if (!generatedPdf?.base64) {
        throw new Error("Falha ao gerar o PDF oficial da APR.");
      }

      const pdfFile = base64ToPdfFile(
        generatedPdf.base64,
        generatedPdf.filename || buildAprFilename(fullApr),
      );
      await aprsService.attachFile(apr.id, pdfFile);
      await loadAprs();
      toast.success("PDF final da APR emitido e registrado com sucesso.");
      return aprsService.getPdfAccess(apr.id);
    },
    [buildAprFilename, loadAprs],
  );

  const handleDelete = useCallback(async (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta APR?")) {
      try {
        await aprsService.delete(id);
        setAprs((prev) => prev.filter((a) => a.id !== id));
        toast.success("APR excluída com sucesso!");
      } catch (error) {
        handleApiError(error, "APR");
      }
    }
  }, []);

  const handleDownloadPdf = useCallback(
    async (id: string) => {
      try {
        const apr =
          aprs.find((item) => item.id === id) ||
          (await aprsService.findOne(id));
        const shouldUseGovernedPdf =
          Boolean(apr.pdf_file_key) || apr.status === "Aprovada";

        if (shouldUseGovernedPdf) {
          const access = await ensureGovernedPdf(apr);
          if (access?.url) {
            openUrlInNewTab(access.url);
            return;
          }

          toast.warning(
            access?.message ||
              "O PDF final da APR existe, mas a URL segura não está disponível no momento.",
          );
          return;
        }

        toast.info("Gerando PDF...");
        const [fullApr, signatures, evidences] = await Promise.all([
          aprsService.findOne(id),
          signaturesService.findByDocument(id, "APR"),
          aprsService.listAprEvidences(id),
        ]);
        const { generateAprPdf } = await loadAprPdfGenerator();
        await generateAprPdf(fullApr, signatures, {
          evidences,
          draftWatermark: false,
        });
        toast.success("PDF gerado com sucesso!");
      } catch (error) {
        handleApiError(error, "PDF");
      }
    },
    [aprs, ensureGovernedPdf],
  );

  const handlePrint = useCallback(
    async (apr: Apr) => {
      try {
        toast.info("Preparando impressão...");
        const currentApr =
          aprs.find((item) => item.id === apr.id) ||
          (await aprsService.findOne(apr.id));
        const shouldUseGovernedPdf =
          Boolean(currentApr.pdf_file_key) || currentApr.status === "Aprovada";

        if (shouldUseGovernedPdf) {
          const access = await ensureGovernedPdf(currentApr);
          if (access?.url) {
            openPdfForPrint(access.url, () => {
              toast.info(
                "Pop-up bloqueado. Abrimos o PDF final da APR na mesma aba para impressão.",
              );
            });
            return;
          }

          toast.warning(
            "O PDF final da APR foi emitido, mas a URL segura não está disponível agora.",
          );
          return;
        }

        const [fullApr, signatures, evidences] = await Promise.all([
          aprsService.findOne(apr.id),
          signaturesService.findByDocument(apr.id, "APR"),
          aprsService.listAprEvidences(apr.id),
        ]);
        const { generateAprPdf } = await loadAprPdfGenerator();
        const result = (await generateAprPdf(fullApr, signatures, {
          save: false,
          output: "base64",
          evidences,
          draftWatermark: false,
        })) as { base64: string } | undefined;

        if (result?.base64) {
          const fileURL = URL.createObjectURL(base64ToPdfBlob(result.base64));
          openPdfForPrint(fileURL, () => {
            toast.info(
              "Pop-up bloqueado. Abrimos o PDF na mesma aba para impressão.",
            );
          });
        }
      } catch (error) {
        handleApiError(error, "Impressão");
      }
    },
    [aprs, ensureGovernedPdf],
  );

  const handleSendEmail = useCallback(
    async (id: string) => {
      try {
        toast.info("Preparando documento...");
        const apr =
          aprs.find((item) => item.id === id) ||
          (await aprsService.findOne(id));
        const shouldUseGovernedPdf =
          Boolean(apr.pdf_file_key) || apr.status === "Aprovada";

        if (shouldUseGovernedPdf) {
          const access = await ensureGovernedPdf(apr);
          if (access?.hasFinalPdf) {
            if (access.message) {
              toast.info(
                `${access.message} O envio oficial continuará usando o PDF final governado da APR.`,
              );
            }
            setSelectedDoc({
              name: apr.titulo,
              filename: access.originalName || buildAprFilename(apr),
              storedDocument: {
                documentId: apr.id,
                documentType: "APR",
              },
            });
            setIsMailModalOpen(true);
            return;
          }

          if (apr.status === "Aprovada") {
            toast.warning(
              access?.message ||
                "O PDF final da APR foi emitido, mas a URL segura não está disponível agora.",
            );
            return;
          }
        }

        toast.warning(
          "Esta APR ainda não possui PDF final governado emitido. O envio ocorrerá com um PDF local não governado.",
        );

        const [fullApr, signatures, evidences] = await Promise.all([
          aprsService.findOne(id),
          signaturesService.findByDocument(id, "APR"),
          aprsService.listAprEvidences(id),
        ]);
        const { generateAprPdf } = await loadAprPdfGenerator();
        const result = (await generateAprPdf(fullApr, signatures, {
          save: false,
          output: "base64",
          evidences,
          draftWatermark: false,
        })) as { filename: string; base64: string } | undefined;

        if (result?.base64) {
          setSelectedDoc({
            name: apr.titulo,
            filename: result.filename,
            base64: result.base64,
          });
          setIsMailModalOpen(true);
        }
      } catch (error) {
        handleApiError(error, "Email");
      }
    },
    [aprs, buildAprFilename, ensureGovernedPdf],
  );

  // Filtering is now server-side — aprs already contains the filtered page
  const filteredAprs = aprs;

  const handleApprove = useCallback(async (id: string) => {
    if (!confirm("Deseja aprovar esta APR?")) return;
    try {
      const updated = await aprsService.approve(id);
      setAprs((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success("APR aprovada com sucesso!");
    } catch (error) {
      handleApiError(error, "APR");
    }
  }, []);

  const handleReject = useCallback(async (id: string) => {
    const reason = prompt("Motivo da reprovação:");
    if (!reason) return;
    try {
      const updated = await aprsService.reject(id, reason);
      setAprs((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success("APR reprovada.");
    } catch (error) {
      handleApiError(error, "APR");
    }
  }, []);

  const handleFinalize = useCallback(async (id: string) => {
    if (!confirm("Deseja encerrar esta APR?")) return;
    try {
      const updated = await aprsService.finalize(id);
      setAprs((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success("APR encerrada com sucesso!");
    } catch (error) {
      handleApiError(error, "APR");
    }
  }, []);

  const handleCreateNewVersion = useCallback(
    async (id: string) => {
      if (!confirm("Criar uma nova versão desta APR?")) return;
      try {
        await aprsService.createNewVersion(id);
        toast.success("Nova versão criada.");
        await loadAprs();
      } catch (error) {
        handleApiError(error, "APR");
      }
    },
    [loadAprs],
  );

  return {
    aprs,
    loading,
    loadError,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    siteFilter,
    setSiteFilter,
    responsibleFilter,
    setResponsibleFilter,
    dueFilter,
    setDueFilter,
    sortBy,
    setSortBy,
    insights,
    overviewMetrics,
    page,
    setPage,
    limit,
    total,
    lastPage,
    isMailModalOpen,
    setIsMailModalOpen,
    selectedDoc,
    setSelectedDoc,
    filteredAprs,
    handleDelete,
    handleDownloadPdf,
    handlePrint,
    handleSendEmail,
    handleApprove,
    handleReject,
    handleFinalize,
    handleCreateNewVersion,
    loadAprs,
  };
}
