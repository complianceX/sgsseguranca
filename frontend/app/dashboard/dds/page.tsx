"use client";

import {
  useState,
  useEffect,
  useCallback,
  useDeferredValue,
  useMemo,
} from "react";
import {
  ddsService,
  Dds,
  DdsStatus,
  DDS_STATUS_LABEL,
  DDS_STATUS_COLORS,
  DDS_ALLOWED_TRANSITIONS,
} from "@/services/ddsService";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  Folder,
  Link2,
  Mail,
  Pencil,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { generateDdsPdf } from "@/lib/pdf/ddsGenerator";
import {
  base64ToPdfBlob,
  base64ToPdfFile,
} from "@/lib/pdf/pdfFile";
import { buildPdfFilename } from "@/lib/pdf-system/core/format";
import { signaturesService } from "@/services/signaturesService";
import { SendMailModal } from "@/components/SendMailModal";
import { openPdfForPrint, openUrlInNewTab } from "@/lib/print-utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  InlineLoadingState,
  PageLoadingState,
} from "@/components/ui/state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/PaginationControls";
import { cn } from "@/lib/utils";
import { getFormErrorMessage } from "@/lib/error-handler";
import { usePermissions } from "@/hooks/usePermissions";
import { resolveDdsPdfSource } from "@/lib/ddsPdfSource";

type StoredFile = {
  ddsId: string;
  tema: string;
  data: string;
  companyId: string;
  fileKey: string;
  folderPath: string;
  originalName: string;
};

const inputClassName =
  "w-full rounded-[var(--ds-radius-md)] border border-[var(--component-field-border-subtle)] bg-[color:var(--component-field-bg-subtle)] px-3 py-2.5 text-sm text-[var(--component-field-text)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--component-field-border-focus)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)]";

export default function DdsPage() {
  const { hasPermission } = usePermissions();
  const canManageDds = hasPermission("can_manage_dds");
  const getEffectiveStatus = (dds: Dds): DdsStatus => {
    const currentStatus: DdsStatus = dds.status ?? "rascunho";
    if (dds.pdf_file_key && currentStatus === "rascunho") {
      return "publicado";
    }
    return currentStatus;
  };
  const [ddsList, setDdsList] = useState<Dds[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [modelFilter, setModelFilter] = useState<"all" | "model" | "regular">(
    "all",
  );
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);

  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileYear, setFileYear] = useState<string>("");
  const [fileWeek, setFileWeek] = useState<string>("");
  const [fileCompanyId, setFileCompanyId] = useState<string>("");
  const [filesPage, setFilesPage] = useState(1);
  const [filesPageSize, setFilesPageSize] = useState(10);

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

  const loadDds = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await ddsService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
        kind: modelFilter,
      });
      setDdsList(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error("Erro ao carregar DDS:", error);
      setLoadError("Nao foi possivel carregar a lista de DDS.");
      toast.error("Erro ao carregar lista de DDS.");
    } finally {
      setLoading(false);
    }
  }, [deferredSearchTerm, modelFilter, page]);

  const loadStoredFiles = useCallback(async () => {
    try {
      setLoadingFiles(true);
      const yearValue = fileYear ? Number(fileYear) : undefined;
      const weekValue = fileWeek ? Number(fileWeek) : undefined;
      const data = await ddsService.listStoredFiles({
        company_id: fileCompanyId || undefined,
        year: yearValue,
        week: weekValue,
      });
      setStoredFiles(data);
    } catch (error) {
      console.error("Erro ao carregar arquivos DDS:", error);
      toast.error("Erro ao carregar arquivos salvos de DDS.");
    } finally {
      setLoadingFiles(false);
    }
  }, [fileCompanyId, fileWeek, fileYear]);

  useEffect(() => {
    loadDds();
  }, [loadDds]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearchTerm, modelFilter]);

  useEffect(() => {
    loadStoredFiles();
  }, [loadStoredFiles]);

  useEffect(() => {
    setFilesPage(1);
  }, [fileCompanyId, fileYear, fileWeek, filesPageSize]);

  async function handleDelete(id: string) {
    if (!canManageDds) {
      toast.error("Você não tem permissão para excluir DDS.");
      return;
    }
    if (!confirm("Tem certeza que deseja excluir este DDS?")) return;

    try {
      await ddsService.delete(id);
      toast.success("DDS excluído com sucesso.");
      if (ddsList.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      await loadDds();
    } catch (error) {
      console.error("Erro ao excluir DDS:", error);
      toast.error(
        "Erro ao excluir DDS. Verifique dependências e tente novamente.",
      );
    }
  }

  const getApiErrorMessage = useCallback((error: unknown) => {
    const message = (
      error as
        | { response?: { data?: { message?: string | string[] } } }
        | undefined
    )?.response?.data?.message;

    if (Array.isArray(message)) {
      return message.join(" ");
    }
    if (typeof message === "string" && message.trim()) {
      return message;
    }
    return null;
  }, []);

  const getAllowedStatusTransitions = useCallback((dds: Dds): DdsStatus[] => {
    if (dds.pdf_file_key) {
      return [];
    }

    const currentStatus = getEffectiveStatus(dds);
    const transitions = DDS_ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!dds.is_modelo) {
      return transitions;
    }

    return transitions.filter(
      (status) => status !== "publicado" && status !== "auditado",
    );
  }, []);

  const buildDdsFilename = (dds: Dds) =>
    buildPdfFilename("DDS", dds.tema || "dds", dds.data);

  const generateLocalDdsPdfBase64 = async (dds: Dds) => {
    const signatures = await signaturesService.findByDocument(dds.id, "DDS");
    // Marca d'água aparece apenas quando o DDS ainda é rascunho (preview).
    // PDFs gerados para emissão/impressão de documentos publicados ou auditados
    // saem limpos, sem watermark.
    const base64 = await generateDdsPdf(dds, signatures, {
      save: false,
      output: "base64",
      draftWatermark: dds.status === "rascunho",
    });

    if (!base64) {
      throw new Error("Falha ao gerar o PDF do DDS.");
    }

    return String(base64);
  };

  const syncDdsInList = useCallback((latest: Dds) => {
    setDdsList((prev) =>
      prev.map((current) =>
        current.id === latest.id ? { ...current, ...latest } : current,
      ),
    );
  }, []);

  const resolveLatestDdsForPdf = useCallback(
    async (dds: Dds) =>
      resolveDdsPdfSource(dds, {
        fetchLatest: (id) => ddsService.findOne(id),
        syncCached: syncDdsInList,
      }),
    [syncDdsInList],
  );

  const ensureGovernedPdf = async (dds: Dds) => {
    if (!dds.pdf_file_key && !canManageDds) {
      throw new Error(
        "Você não tem permissão para emitir o PDF final deste DDS.",
      );
    }
    const existingAccess = await ddsService.getPdfAccess(dds.id);
    if (existingAccess.hasFinalPdf) {
      return existingAccess;
    }

    const latestDds = await resolveLatestDdsForPdf(dds);
    if (latestDds.status === "rascunho") {
      throw new Error(
        "O DDS ainda está em rascunho. Publique o DDS antes de emitir o PDF final.",
      );
    }
    const base64 = await generateLocalDdsPdfBase64(latestDds);
    const file = base64ToPdfFile(base64, buildDdsFilename(latestDds));
    const attachResult = await ddsService.attachFile(dds.id, file);
    await Promise.all([loadDds(), loadStoredFiles()]);
    if (attachResult.degraded) {
      toast.warning(attachResult.message);
    } else {
      toast.success(attachResult.message);
    }
    return ddsService.getPdfAccess(dds.id);
  };

  const handlePrint = async (dds: Dds) => {
    try {
      toast.info("Preparando impressão...");
      if (dds.pdf_file_key) {
        const access = await ddsService.getPdfAccess(dds.id);
        if (access.availability === "ready" && access.url) {
          openPdfForPrint(access.url, () => {
            toast.info("Pop-up bloqueado. Abrimos o PDF final na mesma aba.");
          });
          return;
        }
        toast.warning(access.message);
      }

      const latestDds = await resolveLatestDdsForPdf(dds);
      const base64 = await generateLocalDdsPdfBase64(latestDds);
      const fileURL = URL.createObjectURL(base64ToPdfBlob(base64));

      openPdfForPrint(fileURL, () => {
        toast.info(
          "Pop-up bloqueado. Abrimos o PDF na mesma aba para impressão.",
        );
      });
      setTimeout(() => URL.revokeObjectURL(fileURL), 60_000);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF para impressão.");
    }
  };

  const handleEmail = async (dds: Dds) => {
    try {
      if (dds.pdf_file_key) {
        const access = await ddsService.getPdfAccess(dds.id);
        if (access.availability === "ready") {
          setSelectedDoc({
            name: `DDS - ${dds.tema}`,
            filename: access.originalName || buildDdsFilename(dds),
            storedDocument: {
              documentId: dds.id,
              documentType: "DDS",
            },
          });
          setIsMailModalOpen(true);
          return;
        }
        toast.warning(access.message);
      }

      const latestDds = await resolveLatestDdsForPdf(dds);
      const base64 = await generateLocalDdsPdfBase64(latestDds);

      setSelectedDoc({
        name: `DDS - ${latestDds.tema}`,
        filename: buildDdsFilename(latestDds),
        base64,
      });
      setIsMailModalOpen(true);
    } catch (error) {
      console.error("Erro ao preparar e-mail:", error);
      toast.error("Erro ao preparar e-mail com o documento.");
    }
  };

  const handleOpenGovernedPdf = async (dds: Dds) => {
    try {
      toast.info(
        dds.pdf_file_key
          ? "Abrindo PDF final governado..."
          : "Emitindo PDF final governado...",
      );
      const access = await ensureGovernedPdf(dds);
      if (access.availability !== "ready" || !access.url) {
        toast.warning(access.message);
        return;
      }
      openUrlInNewTab(access.url);
    } catch (error) {
      console.error("Erro ao emitir/abrir PDF final do DDS:", error);
      const message = getFormErrorMessage(error, {
        badRequest:
          "Não foi possível emitir o PDF final. Verifique status, participantes e assinaturas do DDS.",
        unauthorized: "Sessão expirada. Faça login novamente.",
        forbidden:
          "Você não tem permissão para emitir o PDF final deste DDS.",
        notFound:
          "DDS não encontrado ou sem dados válidos para emissão do PDF final.",
        server: "Erro interno ao emitir o PDF final do DDS.",
        fallback: "Não foi possível emitir ou abrir o PDF final do DDS.",
      });
      toast.error(message);
    }
  };

  const handleDownloadStoredPdf = async (ddsId: string) => {
    try {
      const access = await ddsService.getPdfAccess(ddsId);
      if (access.availability !== "ready" || !access.url) {
        toast.info(access.message);
        return;
      }
      openUrlInNewTab(access.url);
    } catch (error) {
      console.error("Erro ao obter link do PDF:", error);
      toast.error("Não foi possível abrir o PDF armazenado.");
    }
  };

  const handleStatusChange = async (dds: Dds, newStatus: DdsStatus) => {
    if (!canManageDds) {
      toast.error("Você não tem permissão para alterar o status do DDS.");
      return;
    }
    try {
      const updated = await ddsService.updateStatus(dds.id, newStatus);
      setDdsList((prev) =>
        prev.map((d) =>
          d.id === dds.id ? { ...d, status: updated.status } : d,
        ),
      );
      toast.success(`DDS movido para "${DDS_STATUS_LABEL[updated.status]}".`);
    } catch (error) {
      console.error("Erro ao atualizar status do DDS:", error);
      toast.error(
        getApiErrorMessage(error) || "Não foi possível atualizar o status.",
      );
    }
  };

  const handleCopyFolderPath = async (folderPath: string) => {
    try {
      await navigator.clipboard.writeText(folderPath);
      toast.success("Caminho da pasta copiado.");
    } catch (error) {
      console.error("Erro ao copiar caminho:", error);
      toast.error("Não foi possível copiar o caminho da pasta.");
    }
  };

  const handleExportStoredFilesCsv = () => {
    if (storedFiles.length === 0) {
      toast.error("Não há arquivos para exportar.");
      return;
    }

    const headers = [
      "dds_id",
      "data",
      "tema",
      "company_id",
      "folder_path",
      "file_key",
      "original_name",
    ];
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

    const rows = storedFiles.map((file) =>
      [
        file.ddsId,
        format(new Date(file.data), "yyyy-MM-dd"),
        file.tema,
        file.companyId,
        file.folderPath,
        file.fileKey,
        file.originalName,
      ]
        .map((item) => escapeCsv(String(item ?? "")))
        .join(","),
    );

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dds-files-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso.");
  };

  const handleCopyPdfLink = async (ddsId: string) => {
    try {
      const access = await ddsService.getPdfAccess(ddsId);
      if (access.availability !== "ready" || !access.url) {
        toast.info(access.message);
        return;
      }
      await navigator.clipboard.writeText(access.url);
      toast.success("Link do PDF copiado.");
    } catch (error) {
      console.error("Erro ao copiar link do PDF:", error);
      toast.error("Não foi possível copiar o link do PDF.");
    }
  };

  const handleDownloadWeeklyBundle = async () => {
    if (!fileYear || !fileWeek) {
      toast.error("Selecione ano e semana para gerar o pacote.");
      return;
    }

    try {
      const blob = await ddsService.downloadWeeklyBundle({
        company_id: fileCompanyId || undefined,
        year: Number(fileYear),
        week: Number(fileWeek),
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dds-semana-${fileYear}-${String(fileWeek).padStart(2, "0")}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success("Pacote semanal gerado com sucesso.");
    } catch (error) {
      console.error("Erro ao gerar pacote semanal DDS:", error);
      toast.error("Não foi possível gerar o pacote semanal de DDS.");
    }
  };

  const handlePrintWeeklyBundle = async () => {
    if (!fileYear || !fileWeek) {
      toast.error("Selecione ano e semana para imprimir o pacote.");
      return;
    }

    try {
      const blob = await ddsService.downloadWeeklyBundle({
        company_id: fileCompanyId || undefined,
        year: Number(fileYear),
        week: Number(fileWeek),
      });
      const url = URL.createObjectURL(blob);
      openPdfForPrint(url, () => {
        toast.info("Pop-up bloqueado. Abrimos o pacote na mesma aba.");
      });
    } catch (error) {
      console.error("Erro ao imprimir pacote semanal DDS:", error);
      toast.error("Não foi possível abrir o pacote semanal de DDS.");
    }
  };

  const companyOptions = useMemo(
    () =>
      Array.from(
        new Map(
          ddsList
            .filter((item) => item.company_id)
            .map((item) => [
              item.company_id,
              item.company?.razao_social || item.company_id,
            ]),
        ).entries(),
      ).map(([id, name]) => ({ id, name })),
    [ddsList],
  );

  const ddsSummary = useMemo(
    () => ({
      total,
      modelos: ddsList.filter((item) => item.is_modelo).length,
      registros: ddsList.filter((item) => !item.is_modelo).length,
      arquivos: storedFiles.length,
    }),
    [ddsList, storedFiles.length, total],
  );

  const totalFilesPages = Math.max(
    1,
    Math.ceil(storedFiles.length / filesPageSize),
  );
  const pagedStoredFiles = storedFiles.slice(
    (filesPage - 1) * filesPageSize,
    filesPage * filesPageSize,
  );

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando DDS"
        description="Buscando registros, modelos e arquivos armazenados para operação de campo."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar DDS"
        description={loadError}
        action={
          <Button type="button" onClick={loadDds}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl">
              Diálogo Diário de Segurança (DDS)
            </CardTitle>
            <CardDescription>
              Gerencie registros de DDS, modelos reutilizáveis e PDFs
              armazenados por empresa.
            </CardDescription>
          </div>
          {canManageDds ? (
            <Link
              href="/dashboard/dds/new"
              className={cn(buttonVariants(), "inline-flex items-center")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo DDS
            </Link>
          ) : null}
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Total de DDS</CardDescription>
            <CardTitle className="text-3xl">{ddsSummary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Registros na página</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-action-primary)]">
              {ddsSummary.registros}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Modelos na página</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-warning)]">
              {ddsSummary.modelos}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>PDFs armazenados</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-success)]">
              {ddsSummary.arquivos}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card tone="default" padding="none">
        <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4">
          <div className="space-y-1">
            <CardTitle>Arquivos DDS (Storage)</CardTitle>
            <CardDescription>
              PDFs salvos automaticamente por empresa, ano e semana operacional.
            </CardDescription>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
            <select
              value={fileCompanyId}
              onChange={(event) => setFileCompanyId(event.target.value)}
              className={inputClassName}
              aria-label="Filtro empresa"
            >
              <option value="">Todas empresas</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={2020}
              max={2100}
              placeholder="Ano"
              value={fileYear}
              onChange={(event) => setFileYear(event.target.value)}
              className={inputClassName}
            />
            <input
              type="number"
              min={1}
              max={53}
              placeholder="Semana ISO"
              value={fileWeek}
              onChange={(event) => setFileWeek(event.target.value)}
              className={inputClassName}
            />
            <select
              value={filesPageSize}
              onChange={(event) => setFilesPageSize(Number(event.target.value))}
              className={inputClassName}
              aria-label="Itens por página"
            >
              <option value={10}>10 / página</option>
              <option value={25}>25 / página</option>
              <option value={50}>50 / página</option>
            </select>
            <div className="flex flex-wrap gap-2 xl:col-span-2">
              <Button
                type="button"
                variant="outline"
                leftIcon={
                  <FileSpreadsheet className="h-4 w-4 text-[var(--ds-color-success)]" />
                }
                onClick={handleExportStoredFilesCsv}
              >
                Exportar CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={handleDownloadWeeklyBundle}
                disabled={!fileYear || !fileWeek}
              >
                Baixar semana
              </Button>
              <Button
                type="button"
                variant="outline"
                leftIcon={<Printer className="h-4 w-4" />}
                onClick={handlePrintWeeklyBundle}
                disabled={!fileYear || !fileWeek}
              >
                Imprimir semana
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {loadingFiles ? (
            <InlineLoadingState label="Carregando arquivos DDS armazenados" />
          ) : storedFiles.length === 0 ? (
            <EmptyState
              title="Nenhum PDF de DDS encontrado"
              description="Não há arquivos armazenados para o filtro aplicado."
              compact
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tema</TableHead>
                    <TableHead>Pasta</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedStoredFiles.map((file) => (
                    <TableRow key={`${file.ddsId}-${file.fileKey}`}>
                      <TableCell>
                        {format(new Date(file.data), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell className="font-medium text-[var(--ds-color-text-primary)]">
                        {file.tema}
                      </TableCell>
                      <TableCell>
                        <div className="inline-flex items-center gap-2 rounded-[var(--ds-radius-sm)] bg-[color:var(--ds-color-surface-muted)]/45 px-2 py-1 text-xs text-[var(--ds-color-text-secondary)]">
                          <Folder className="h-3 w-3" />
                          <span>{file.folderPath}</span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              handleCopyFolderPath(file.folderPath)
                            }
                            title="Copiar caminho da pasta"
                            className="h-6 w-6"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-[var(--ds-color-text-secondary)]">
                        {file.originalName}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            leftIcon={<Download className="h-3.5 w-3.5" />}
                            onClick={() => handleDownloadStoredPdf(file.ddsId)}
                          >
                            Baixar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            leftIcon={<Link2 className="h-3.5 w-3.5" />}
                            onClick={() => handleCopyPdfLink(file.ddsId)}
                            title="Copiar link do PDF"
                          >
                            Copiar link
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between text-sm text-[var(--ds-color-text-muted)]">
                <span>
                  Página{" "}
                  <span className="font-semibold text-[var(--ds-color-text-primary)]">
                    {filesPage}
                  </span>{" "}
                  de{" "}
                  <span className="font-semibold text-[var(--ds-color-text-primary)]">
                    {totalFilesPages}
                  </span>{" "}
                  • {storedFiles.length} arquivo(s)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    leftIcon={<ChevronLeft className="h-4 w-4" />}
                    onClick={() =>
                      setFilesPage((current) => Math.max(1, current - 1))
                    }
                    disabled={filesPage <= 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    rightIcon={<ChevronRight className="h-4 w-4" />}
                    onClick={() =>
                      setFilesPage((current) =>
                        Math.min(totalFilesPages, current + 1),
                      )
                    }
                    disabled={filesPage >= totalFilesPages}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card tone="default" padding="none">
        <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Registros de DDS</CardTitle>
            <CardDescription>
              {total} registro(s) encontrados com filtros por tema e tipo.
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
              <input
                type="text"
                placeholder="Pesquisar DDS"
                className={cn(inputClassName, "pl-10")}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <select
              aria-label="Filtro de DDS"
              className={cn(inputClassName, "min-w-[180px]")}
              value={modelFilter}
              onChange={(event) =>
                setModelFilter(
                  event.target.value as "all" | "model" | "regular",
                )
              }
            >
              <option value="all">Todos</option>
              <option value="regular">Registros</option>
              <option value="model">Modelos</option>
            </select>
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {ddsList.length === 0 ? (
            <EmptyState
              title="Nenhum DDS encontrado"
              description={
                deferredSearchTerm || modelFilter !== "all"
                  ? "Nenhum resultado corresponde aos filtros aplicados."
                  : "Ainda não existem registros de DDS para este tenant."
              }
              action={
                !deferredSearchTerm && modelFilter === "all" && canManageDds ? (
                  <Link
                    href="/dashboard/dds/new"
                    className={cn(buttonVariants(), "inline-flex items-center")}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Novo DDS
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tema</TableHead>
                  <TableHead>Participantes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ddsList.map((dds) => {
                  const currentStatus = getEffectiveStatus(dds);
                  const transitions = getAllowedStatusTransitions(dds);
                  const isLockedByFinalPdf = Boolean(dds.pdf_file_key);
                  return (
                    <TableRow key={dds.id}>
                      <TableCell>
                        {format(new Date(dds.data), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-[var(--ds-color-text-primary)]">
                            {dds.tema}
                          </div>
                          {dds.is_modelo ? (
                            <span className="rounded-full bg-[color:var(--ds-color-action-primary)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--ds-color-action-primary)]">
                              Modelo
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-[var(--ds-color-text-secondary)]">
                          <Users className="h-4 w-4" />
                          <span>{dds.participants?.length || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                              DDS_STATUS_COLORS[currentStatus],
                            )}
                          >
                            {DDS_STATUS_LABEL[currentStatus]}
                          </span>
                          {canManageDds && transitions.length > 0 && (
                            <select
                              aria-label="Mover status"
                              className="rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-2 py-1 text-xs text-[var(--ds-color-text-muted)] transition-colors hover:border-[var(--ds-color-border-strong)] focus:outline-none"
                              value=""
                              onChange={(e) => {
                                if (e.target.value)
                                  handleStatusChange(
                                    dds,
                                    e.target.value as DdsStatus,
                                  );
                              }}
                            >
                              <option value="">Mover para...</option>
                              {transitions.map((s) => (
                                <option key={s} value={s}>
                                  {DDS_STATUS_LABEL[s]}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => handleOpenGovernedPdf(dds)}
                            title={
                              dds.pdf_file_key
                                ? "Abrir PDF final governado"
                                : canManageDds
                                  ? "Emitir PDF final governado"
                                  : "Somente usuários com gestão podem emitir o PDF final"
                            }
                            disabled={!dds.pdf_file_key && !canManageDds}
                          >
                            <ShieldCheck className="h-4 w-4 text-[var(--ds-color-success)]" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => handlePrint(dds)}
                            title="Imprimir DDS"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEmail(dds)}
                            title="Enviar por e-mail"
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          {canManageDds ? (
                            <>
                              <Link
                                href={
                                  isLockedByFinalPdf
                                    ? "#"
                                    : `/dashboard/dds/edit/${dds.id}`
                                }
                                className={cn(
                                  buttonVariants({
                                    size: "icon",
                                    variant: "ghost",
                                  }),
                                  isLockedByFinalPdf
                                    ? "cursor-not-allowed opacity-45"
                                    : "",
                                )}
                                title={
                                  isLockedByFinalPdf
                                    ? "DDS com PDF final emitido: edição bloqueada"
                                    : "Editar DDS"
                                }
                                onClick={(event) => {
                                  if (isLockedByFinalPdf) {
                                    event.preventDefault();
                                    toast.error(
                                      "DDS com PDF final emitido. Gere um novo DDS para alterações.",
                                    );
                                  }
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDelete(dds.id)}
                                title="Excluir DDS"
                                className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {!loading && total > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={handlePrevPage}
            onNext={handleNextPage}
          />
        ) : null}
      </Card>

      {ddsSummary.modelos > 0 ? (
        <Card
          tone="muted"
          padding="md"
          className="border-[color:var(--ds-color-action-primary)]/20 bg-[color:var(--ds-color-action-primary)]/8"
        >
          <CardHeader className="gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--ds-color-action-primary)]" />
              <CardTitle className="text-base">
                Biblioteca de modelos ativa
              </CardTitle>
            </div>
            <CardDescription>
              Existem {ddsSummary.modelos} modelo(s) cadastrados. Use-os para
              acelerar criação de DDS padronizados por tema, obra ou rotina
              operacional.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

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
    </div>
  );
}
