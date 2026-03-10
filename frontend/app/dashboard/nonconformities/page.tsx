"use client";

import {
  useEffect,
  useState,
  useCallback,
  useDeferredValue,
  useMemo,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Edit,
  FileSpreadsheet,
  Mail,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { downloadExcel } from "@/lib/download-excel";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  nonConformitiesService,
  NonConformity,
  NcStatus,
  NC_ALLOWED_TRANSITIONS,
  NC_STATUS_COLORS,
  NC_STATUS_LABEL,
} from "@/services/nonConformitiesService";
import { correctiveActionsService } from "@/services/correctiveActionsService";
import { generateNonConformityPdf } from "@/lib/pdf/nonConformityGenerator";
import { SendMailModal } from "@/components/SendMailModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StoredFilesPanel } from "@/components/StoredFilesPanel";
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
  PageLoadingState,
} from "@/components/ui/state";
import { PaginationControls } from "@/components/PaginationControls";
import { cn } from "@/lib/utils";

const inputClassName =
  "w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]";

export default function NonConformitiesPage() {
  const [items, setItems] = useState<NonConformity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{
    name: string;
    filename: string;
    base64: string;
  } | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await nonConformitiesService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
      });
      setItems(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error("Erro ao carregar não conformidades:", error);
      setLoadError("Nao foi possivel carregar a lista de nao conformidades.");
      toast.error("Erro ao carregar não conformidades");
    } finally {
      setLoading(false);
    }
  }, [deferredSearchTerm, page]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta não conformidade?"))
      return;

    try {
      await nonConformitiesService.remove(id);
      toast.success("Não conformidade excluída com sucesso");
      if (items.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      await fetchItems();
    } catch (error) {
      console.error("Erro ao excluir não conformidade:", error);
      toast.error("Erro ao excluir não conformidade");
    }
  };

  const handleSendEmail = async (item: NonConformity) => {
    try {
      toast.info("Preparando documento...");
      const fullItem = await nonConformitiesService.findOne(item.id);
      const result = (await generateNonConformityPdf(fullItem, {
        save: false,
        output: "base64",
      })) as { filename: string; base64: string };

      if (result?.base64) {
        setSelectedDoc({
          name: `NC ${item.codigo_nc}`,
          filename: result.filename,
          base64: result.base64,
        });
        setIsMailModalOpen(true);
      }
    } catch (error) {
      console.error("Erro ao preparar e-mail:", error);
      toast.error("Erro ao preparar o documento para envio.");
    }
  };

  const handleCreateCapa = async (item: NonConformity) => {
    try {
      await correctiveActionsService.createFromNonConformity(item.id);
      toast.success("CAPA criada a partir da não conformidade.");
    } catch (error) {
      console.error("Erro ao criar CAPA:", error);
      toast.error("Não foi possível criar CAPA.");
    }
  };

  const handleStatusChange = async (id: string, newStatus: NcStatus) => {
    try {
      const updated = await nonConformitiesService.updateStatus(id, newStatus);
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: updated.status } : item,
        ),
      );
      toast.success(`Status atualizado para "${NC_STATUS_LABEL[newStatus]}"`);
    } catch (error) {
      console.error("Erro ao atualizar status da não conformidade:", error);
      toast.error("Erro ao atualizar status da não conformidade");
    }
  };

  const summary = useMemo(
    () => ({
      total,
      abertas: items.filter((item) => item.status === NcStatus.ABERTA).length,
      andamento: items.filter((item) => item.status === NcStatus.EM_ANDAMENTO)
        .length,
      aguardando: items.filter(
        (item) => item.status === NcStatus.AGUARDANDO_VALIDACAO,
      ).length,
      encerradas: items.filter((item) => item.status === NcStatus.ENCERRADA)
        .length,
    }),
    [items, total],
  );

  const companyOptions = useMemo(
    () =>
      Array.from(
        new Map(
          items
            .filter((item) => item.company_id)
            .map((item) => [item.company_id, item.company_id]),
        ).entries(),
      ).map(([id, name]) => ({ id, name })),
    [items],
  );

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando não conformidades"
        description="Buscando desvios, status, responsáveis e documentos armazenados."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar não conformidades"
        description={loadError}
        action={
          <Button type="button" onClick={fetchItems}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <div className="ds-crud-page">
      <Card tone="elevated" padding="lg" className="ds-crud-hero">
        <CardHeader className="ds-crud-hero__header md:flex-row md:items-start md:justify-between">
          <div className="ds-crud-hero__lead">
            <div className="ds-crud-hero__icon">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="ds-crud-hero__copy">
              <span className="ds-crud-hero__eyebrow">
                Desvios e tratativas
              </span>
              <CardTitle className="text-2xl">Não Conformidades</CardTitle>
              <CardDescription>
                Registre, acompanhe e encerre desvios operacionais com trilha
                documental e ação corretiva.
              </CardDescription>
            </div>
          </div>
          <div className="ds-crud-hero__actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={
                <FileSpreadsheet className="h-4 w-4 text-[var(--ds-color-success)]" />
              }
              onClick={() =>
                downloadExcel(
                  "/nonconformities/export/excel",
                  "nao-conformidades.xlsx",
                )
              }
            >
              Exportar Excel
            </Button>
            <Link
              href="/dashboard/nonconformities/new"
              className={cn(buttonVariants(), "inline-flex items-center")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova não conformidade
            </Link>
          </div>
        </CardHeader>
      </Card>

      <div className="ds-crud-stats xl:grid-cols-4">
        <Card
          interactive
          padding="md"
          className="ds-crud-stat ds-crud-stat--neutral"
        >
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">
              Total monitorado
            </CardDescription>
            <CardTitle className="ds-crud-stat__value">
              {summary.total}
            </CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Não conformidades carregadas nesta página.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card
          interactive
          padding="md"
          className="ds-crud-stat ds-crud-stat--danger"
        >
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">
              Abertas na página
            </CardDescription>
            <CardTitle className="ds-crud-stat__value text-[var(--ds-color-danger)]">
              {summary.abertas}
            </CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Desvios ainda sem tratativa concluída.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card
          interactive
          padding="md"
          className="ds-crud-stat ds-crud-stat--warning"
        >
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">
              Em andamento na página
            </CardDescription>
            <CardTitle className="ds-crud-stat__value text-[var(--ds-color-warning)]">
              {summary.andamento + summary.aguardando}
            </CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Itens em execução ou aguardando validação.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card
          interactive
          padding="md"
          className="ds-crud-stat ds-crud-stat--success"
        >
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">
              Encerradas na página
            </CardDescription>
            <CardTitle className="ds-crud-stat__value text-[var(--ds-color-success)]">
              {summary.encerradas}
            </CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Desvios já finalizados no recorte atual.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {summary.abertas > 0 ||
      summary.andamento > 0 ||
      summary.aguardando > 0 ? (
        <Card
          tone="muted"
          padding="md"
          className="ds-crud-callout ds-crud-callout--danger"
        >
          <CardHeader className="gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[var(--ds-color-danger)]" />
              <CardTitle className="text-base">Atenção de tratativa</CardTitle>
            </div>
            <CardDescription>
              Nesta página existem{" "}
              {summary.abertas + summary.andamento + summary.aguardando} não
              conformidade(s) ainda sem encerramento. Priorize CAPA e validação
              para reduzir reincidência.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card tone="default" padding="none" className="ds-crud-filter-card">
        <CardHeader className="ds-crud-filter-header md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Base de não conformidades</CardTitle>
            <CardDescription>
              {total} registro(s) encontrados com busca por código, local, tipo
              e status.
            </CardDescription>
          </div>
          <div className="ds-crud-search ds-crud-search--wide">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar por código, local, tipo ou status"
              className={cn(inputClassName, "pl-10")}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {items.length === 0 ? (
            <EmptyState
              title="Nenhuma não conformidade encontrada"
              description={
                deferredSearchTerm
                  ? "Nenhum resultado corresponde ao filtro aplicado."
                  : "Ainda não existem registros de não conformidade para este tenant."
              }
              action={
                !deferredSearchTerm ? (
                  <Link
                    href="/dashboard/nonconformities/new"
                    className={cn(buttonVariants(), "inline-flex items-center")}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nova não conformidade
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Local / Setor</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-[var(--ds-color-text-primary)]">
                      {item.codigo_nc}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full bg-[color:var(--ds-color-action-primary)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--ds-color-action-primary)]">
                        {item.tipo}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span
                          className={cn(
                            "inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold",
                            NC_STATUS_COLORS[item.status as NcStatus] ??
                              "bg-[color:var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] border-[var(--ds-color-border-subtle)]",
                          )}
                        >
                          {NC_STATUS_LABEL[item.status as NcStatus] ??
                            item.status}
                        </span>
                        {NC_ALLOWED_TRANSITIONS[item.status as NcStatus]
                          ?.length > 0 ? (
                          <select
                            title="Alterar status"
                            className={cn(
                              inputClassName,
                              "h-8 px-2 py-1 text-xs",
                            )}
                            value=""
                            onChange={(event) => {
                              if (event.target.value) {
                                handleStatusChange(
                                  item.id,
                                  event.target.value as NcStatus,
                                );
                              }
                            }}
                          >
                            <option value="">Mover para...</option>
                            {NC_ALLOWED_TRANSITIONS[
                              item.status as NcStatus
                            ].map((status) => (
                              <option key={status} value={status}>
                                {NC_STATUS_LABEL[status]}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{item.local_setor_area}</TableCell>
                    <TableCell>
                      {format(new Date(item.data_identificacao), "dd/MM/yyyy", {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell>{item.responsavel_area}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleCreateCapa(item)}
                          title="Gerar CAPA"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleSendEmail(item)}
                          title="Enviar por e-mail"
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Link
                          href={`/dashboard/nonconformities/edit/${item.id}`}
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
                          onClick={() => handleDelete(item.id)}
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
        </CardContent>
        {!loading && total > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
          />
        ) : null}
      </Card>

      <StoredFilesPanel
        title="Arquivos Não Conformidade (Storage)"
        description="PDFs salvos automaticamente por empresa, ano e semana."
        listStoredFiles={nonConformitiesService.listStoredFiles}
        getPdfAccess={nonConformitiesService.getPdfAccess}
        downloadWeeklyBundle={nonConformitiesService.downloadWeeklyBundle}
        companyOptions={companyOptions}
      />

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
        />
      ) : null}
    </div>
  );
}
