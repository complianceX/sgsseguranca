"use client";

import dynamic from "next/dynamic";
import {
  useState,
  useEffect,
  useCallback,
  useDeferredValue,
  useMemo,
} from "react";
import Link from "next/link";
import { ptBR } from "date-fns/locale";
import { AxiosError } from "axios";
import {
  Bot,
  ClipboardList,
  Download,
  Edit,
  Mail,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { inspectionsService, Inspection } from "@/services/inspectionsService";
import { base64ToPdfBlob, base64ToPdfFile } from "@/lib/pdf/pdfFile";
import { buildPdfFilename } from "@/lib/pdf-system/core/format";
import { openPdfForPrint, openUrlInNewTab } from "@/lib/print-utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  PageLoadingState,
} from "@/components/ui/state";
import { InlineCallout } from "@/components/ui/inline-callout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/PaginationControls";
import { ListPageLayout } from "@/components/layout";
import { cn } from "@/lib/utils";
import { safeFormatDate } from "@/lib/date/safeFormat";
import { usePermissions } from "@/hooks/usePermissions";

const SendMailModal = dynamic(
  () =>
    import("@/components/SendMailModal").then((module) => module.SendMailModal),
  { ssr: false },
);
const StoredFilesPanel = dynamic(
  () =>
    import("@/components/StoredFilesPanel").then(
      (module) => module.StoredFilesPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="mt-6 h-40 motion-safe:animate-pulse rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/60" />
    ),
  },
);

const inputClassName =
  "w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] motion-safe:transition-all motion-safe:duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]";

const loadInspectionPdfGenerator = async () =>
  import("@/lib/pdf/inspectionGenerator");

function extractApiErrorMessage(error: unknown): string | null {
  if (!(error instanceof AxiosError)) {
    return error instanceof Error ? error.message : null;
  }

  const responseData = error.response?.data as
    | { message?: string | string[]; error?: string }
    | string
    | undefined;

  if (typeof responseData === "string") {
    return responseData;
  }

  if (Array.isArray(responseData?.message)) {
    return responseData.message.join(" | ");
  }

  if (typeof responseData?.message === "string") {
    return responseData.message;
  }

  if (typeof responseData?.error === "string") {
    return responseData.error;
  }

  return error.message || null;
}

export default function InspectionsPage() {
  const { hasPermission } = usePermissions();
  const canManageInspections = hasPermission("can_manage_inspections");
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);
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

  const fetchInspections = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await inspectionsService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
      });
      setInspections(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error("Erro ao carregar inspeções:", error);
      setLoadError("Nao foi possivel carregar os relatorios de inspecao.");
      toast.error("Erro ao carregar inspeções");
    } finally {
      setLoading(false);
    }
  }, [deferredSearchTerm, page]);

  useEffect(() => {
    void fetchInspections();
  }, [fetchInspections]);

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este relatório de inspeção?"))
      return;

    try {
      await inspectionsService.remove(id);
      toast.success("Inspeção excluída com sucesso");
      if (inspections.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      await fetchInspections();
    } catch (error) {
      console.error("Erro ao excluir inspeção:", error);
      toast.error("Erro ao excluir inspeção");
    }
  };

  const buildInspectionFilename = (inspection: Inspection) =>
    buildPdfFilename(
      "INSPECAO",
      `${inspection.tipo_inspecao}_${inspection.setor_area}`,
      inspection.data_inspecao,
    );

  const getGovernedPdfAccess = async (inspectionId: string) =>
    inspectionsService.getPdfAccess(inspectionId);

  const ensureGovernedPdf = async (inspection: Inspection) => {
    const existingAccess = await getGovernedPdfAccess(inspection.id);
    if (existingAccess.hasFinalPdf) {
      return existingAccess;
    }

    const fullInspection = await inspectionsService.findOne(inspection.id);
    const { generateInspectionPdf } = await loadInspectionPdfGenerator();
    const result = (await generateInspectionPdf(fullInspection, {
      save: false,
      output: "base64",
      draftWatermark: false,
    })) as { filename: string; base64: string } | undefined;

    if (!result?.base64) {
      throw new Error("Falha ao gerar o PDF oficial da inspeção.");
    }

    const file = base64ToPdfFile(
      result.base64,
      result.filename || buildInspectionFilename(fullInspection),
    );

    try {
      await inspectionsService.attachFile(inspection.id, file);
    } catch (error) {
      const status =
        error instanceof AxiosError ? error.response?.status : null;
      if (status === 400) {
        // Em caso de corrida (PDF já emitido por outra requisição/aba), reaproveita o documento existente.
        const concurrentAccess = await inspectionsService.getPdfAccess(
          inspection.id,
        );
        if (concurrentAccess.hasFinalPdf) {
          return concurrentAccess;
        }
      }
      throw error;
    }

    await fetchInspections();
    toast.success("PDF final da inspeção emitido e registrado com sucesso.");
    return inspectionsService.getPdfAccess(inspection.id);
  };

  const generateInspectionPdfPayload = async (
    inspection: Inspection,
    draftWatermark: boolean,
  ) => {
    const fullInspection = await inspectionsService.findOne(inspection.id);
    const { generateInspectionPdf } = await loadInspectionPdfGenerator();
    return (await generateInspectionPdf(fullInspection, {
      save: false,
      output: "base64",
      draftWatermark,
    })) as { filename: string; base64: string } | undefined;
  };

  const handleDownloadPdf = async (inspection: Inspection) => {
    try {
      const access = await getGovernedPdfAccess(inspection.id);
      if (access.availability === "ready" && access.url) {
        openUrlInNewTab(access.url);
        return;
      }

      const draftWatermark = !access.hasFinalPdf;
      if (access.message) {
        toast.info(
          draftWatermark
            ? access.message
            : `${access.message} Abrimos a cópia oficial local da inspeção.`,
        );
      }

      const result = await generateInspectionPdfPayload(
        inspection,
        draftWatermark,
      );
      if (!result?.base64) {
        throw new Error("Falha ao gerar o PDF da inspeção.");
      }

      const fileUrl = URL.createObjectURL(base64ToPdfBlob(result.base64));
      openUrlInNewTab(fileUrl);
      setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF da inspeção.");
    }
  };

  const handlePrint = async (inspection: Inspection) => {
    try {
      toast.info("Preparando impressão...");
      const access = await getGovernedPdfAccess(inspection.id);
      if (access.availability === "ready" && access.url) {
        openPdfForPrint(access.url, () => {
          toast.info(
            "Pop-up bloqueado. Abrimos o PDF final na mesma aba para impressão.",
          );
        });
        return;
      }

      const draftWatermark = !access.hasFinalPdf;
      if (access.message) {
        toast.info(
          draftWatermark
            ? access.message
            : `${access.message} Abrimos a cópia oficial local da inspeção para impressão.`,
        );
      }

      const result = await generateInspectionPdfPayload(
        inspection,
        draftWatermark,
      );

      if (result?.base64) {
        const fileURL = URL.createObjectURL(base64ToPdfBlob(result.base64));
        openPdfForPrint(fileURL, () => {
          toast.info(
            "Pop-up bloqueado. Abrimos o PDF na mesma aba para impressão.",
          );
        });
      }
    } catch (error) {
      console.error("Erro ao imprimir:", error);
      toast.error("Erro ao preparar impressão da inspeção.");
    }
  };

  const handleSendEmail = async (inspection: Inspection) => {
    try {
      toast.info("Preparando documento...");
      const access = await getGovernedPdfAccess(inspection.id);
      if (access.hasFinalPdf) {
        if (access.availability !== "ready" && access.message) {
          toast.info(
            `${access.message} O envio oficial continuará usando o PDF final governado da inspeção.`,
          );
        }
        setSelectedDoc({
          name: `${inspection.tipo_inspecao} - ${inspection.setor_area}`,
          filename: access.originalName || buildInspectionFilename(inspection),
          storedDocument: {
            documentId: inspection.id,
            documentType: "INSPECTION",
          },
        });
        setIsMailModalOpen(true);
        return;
      }

      toast.warning(
        access.message ||
          "Emita o PDF final governado antes de enviar esta inspeção por e-mail.",
      );
    } catch (error) {
      console.error("Erro ao preparar e-mail:", error);
      toast.error("Erro ao preparar o documento para envio.");
    }
  };

  const handleOpenGovernedPdf = async (inspection: Inspection) => {
    try {
      toast.info("Preparando PDF final governado...");
      const existingAccess = await getGovernedPdfAccess(inspection.id);
      if (!existingAccess.hasFinalPdf && !canManageInspections) {
        toast.error(
          "Você não tem permissão para emitir o PDF final desta inspeção.",
        );
        return;
      }
      const access = await ensureGovernedPdf(inspection);
      if (access.url) {
        openUrlInNewTab(access.url);
        return;
      }

      toast.warning(
        access.message ||
          "PDF final emitido, mas a URL segura não está disponível no momento. Abrimos a cópia oficial local.",
      );
      const result = await generateInspectionPdfPayload(inspection, false);
      if (!result?.base64) {
        throw new Error("Falha ao gerar a cópia oficial local da inspeção.");
      }
      const fileUrl = URL.createObjectURL(base64ToPdfBlob(result.base64));
      openUrlInNewTab(fileUrl);
      setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
    } catch (error) {
      console.error("Erro ao emitir/abrir PDF final da inspeção:", error);
      const apiMessage = extractApiErrorMessage(error);
      toast.error(
        apiMessage
          ? `Não foi possível emitir/abrir o PDF final: ${apiMessage}`
          : "Não foi possível emitir ou abrir o PDF final da inspeção.",
      );
    }
  };

  const comRiscos = useMemo(
    () =>
      inspections.filter((item) => (item.perigos_riscos?.length || 0) > 0)
        .length,
    [inspections],
  );

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando inspeções"
        description="Buscando relatórios, responsáveis, riscos e planos de ação."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar inspeções"
        description={loadError}
        action={
          <Button type="button" onClick={fetchInspections}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ListPageLayout
        eyebrow="Inspeção e rastreio"
        title="Relatórios de inspeção"
        description="Gerencie inspeções de segurança, riscos observados e ações recomendadas por área."
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <Link
            href="/dashboard/inspections/new"
            className={cn(buttonVariants(), "inline-flex items-center")}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo relatório
          </Link>
        }
        toolbarContent={
          <div className="ds-list-search ds-list-search--wide">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar por setor, tipo, site ou responsável"
              aria-label="Buscar inspeções por setor, tipo, site ou responsável"
              className={cn(inputClassName, "pl-10")}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
            />
          </div>
        }
        footer={
          !loading && total > 0 ? (
            <PaginationControls
              page={page}
              lastPage={lastPage}
              total={total}
              onPrev={handlePrevPage}
              onNext={handleNextPage}
            />
          ) : null
        }
      >
        <>
          {comRiscos > 0 ? (
            <InlineCallout
              tone="warning"
              icon={<ShieldAlert className="h-4 w-4" />}
              title="Foco operacional"
              description={`Nesta pagina, ${comRiscos} inspecao(oes) possuem perigos/riscos registrados. Revise planos de acao e responsaveis para acelerar tratativas.`}
            />
          ) : null}

          {inspections.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Nenhum relatório de inspeção encontrado"
                description={
                  deferredSearchTerm
                    ? "Nenhum resultado corresponde ao filtro aplicado."
                    : "Ainda não existem inspeções registradas para este tenant."
                }
                action={
                  !deferredSearchTerm ? (
                    <Link
                      href="/dashboard/inspections/new"
                      className={cn(
                        buttonVariants(),
                        "inline-flex items-center",
                      )}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Novo relatório
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setor / Área</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Site / Unidade</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((inspection) => (
                  <TableRow key={inspection.id}>
                    <TableCell className="font-medium text-[var(--ds-color-text-primary)]">
                      {inspection.setor_area}
                    </TableCell>
                    <TableCell>
                      <span className="ds-badge ds-badge--primary">
                        {inspection.tipo_inspecao}
                      </span>
                    </TableCell>
                    <TableCell className="text-[var(--ds-color-text-secondary)]">
                      {inspection.site?.nome || "—"}
                    </TableCell>
                    <TableCell>
                      {safeFormatDate(inspection.data_inspecao, "dd/MM/yyyy", {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="text-[var(--ds-color-text-secondary)]">
                      {inspection.responsavel?.nome || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/dashboard/sst-agent?${new URLSearchParams({
                            documentType: "nc",
                            source_type: "inspection",
                            source_reference: inspection.id,
                            title: `NC de inspeção - ${inspection.setor_area}`,
                            description:
                              inspection.descricao_local_atividades ||
                              `Inspeção ${inspection.tipo_inspecao} em ${inspection.setor_area}.`,
                            site_id: inspection.site_id || "",
                            source_context: `Inspeção ${inspection.tipo_inspecao} realizada em ${safeFormatDate(inspection.data_inspecao, "dd/MM/yyyy", { locale: ptBR }, "data inválida")} no setor ${inspection.setor_area}.`,
                          }).toString()}`}
                          className={buttonVariants({
                            size: "icon",
                            variant: "ghost",
                          })}
                          title="Abrir NC com SOPHIE"
                          aria-label={`Abrir não conformidade com SOPHIE para inspeção ${inspection.setor_area}`}
                        >
                          <Bot className="h-4 w-4 text-[var(--ds-color-warning)]" />
                        </Link>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleOpenGovernedPdf(inspection)}
                          title="Emitir / abrir PDF final governado"
                          disabled={!canManageInspections}
                        >
                          <ShieldCheck className="h-4 w-4 text-[var(--ds-color-success)]" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handlePrint(inspection)}
                          title="Imprimir"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleSendEmail(inspection)}
                          title="Enviar por e-mail"
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDownloadPdf(inspection)}
                          title="Baixar PDF"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Link
                          href={`/dashboard/inspections/edit/${inspection.id}`}
                          className={buttonVariants({
                            size: "icon",
                            variant: "ghost",
                          })}
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Link>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(inspection.id)}
                          title="Excluir"
                          className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <StoredFilesPanel
            title="Arquivos de inspeção"
            description="PDFs finais de inspeção emitidos pelo sistema, organizados por empresa e semana operacional."
            listStoredFiles={inspectionsService.listStoredFiles}
            getPdfAccess={inspectionsService.getPdfAccess}
            downloadWeeklyBundle={inspectionsService.downloadWeeklyBundle}
          />
        </>
      </ListPageLayout>

      {selectedDoc ? (
        <SendMailModal
          isOpen={isMailModalOpen}
          onClose={() => {
            setIsMailModalOpen(false);
            setSelectedDoc(null);
          }}
          documentName={selectedDoc.name}
          filename={selectedDoc.filename}
          base64={selectedDoc.base64}
          storedDocument={selectedDoc.storedDocument}
        />
      ) : null}
    </>
  );
}
