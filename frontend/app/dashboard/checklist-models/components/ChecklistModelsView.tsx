"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Mail,
  PenTool,
  PlayCircle,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/PaginationControls";
import { checklistModuleAreas, type ChecklistModuleArea } from "@/lib/checklist-modules";
import { cn } from "@/lib/utils";
import { checklistsService, type Checklist } from "@/services/checklistsService";
import { signaturesService } from "@/services/signaturesService";

const SendMailModal = dynamic(
  () =>
    import("@/components/SendMailModal").then(
      (module) => module.SendMailModal,
    ),
  { ssr: false },
);

const loadChecklistPdfGenerator = async () =>
  import("@/lib/pdf/checklistGenerator");

interface ChecklistModelsViewProps {
  area: ChecklistModuleArea;
  showBootstrapAction?: boolean;
}

export function ChecklistModelsView({
  area,
  showBootstrapAction = false,
}: ChecklistModelsViewProps) {
  const [models, setModels] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{
    name: string;
    filename: string;
    base64: string;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage]);

  const loadModels = useCallback(async () => {
    try {
      setLoading(true);
      const response = await checklistsService.findPaginated({
        onlyTemplates: true,
        category: area.category,
        segment: area.segment,
        page,
        limit: 10,
      });
      setModels(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error("Erro ao carregar modelos:", error);
      toast.error("Não foi possível carregar os modelos de checklist.");
    } finally {
      setLoading(false);
    }
  }, [area.category, area.segment, page]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  async function handleDelete(id: string) {
    if (!confirm("Excluir este modelo?")) {
      return;
    }

    try {
      await checklistsService.delete(id);
      if (models.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        await loadModels();
      }
      toast.success("Modelo excluído com sucesso!");
    } catch (error) {
      console.error("Erro ao excluir modelo:", error);
      toast.error("Erro ao excluir modelo.");
    }
  }

  async function handleBootstrapTemplates() {
    try {
      setBootstrapping(true);
      const result = await checklistsService.bootstrapActivityTemplates();
      toast.success(
        `Templates operacionais processados. Criados: ${result.created}. Ignorados: ${result.skipped}.`,
      );
      setPage(1);
      await loadModels();
    } catch (error) {
      console.error("Erro ao criar templates operacionais:", error);
      toast.error("Não foi possível criar os templates por atividade.");
    } finally {
      setBootstrapping(false);
    }
  }

  const handleSendEmail = useCallback(async (checklist: Checklist) => {
    try {
      setPrintingId(checklist.id);
      const signatures = await signaturesService.findByChecklist(checklist.id);
      const { generateChecklistPdf } = await loadChecklistPdfGenerator();
      const pdfData = await generateChecklistPdf(checklist, signatures, {
        save: false,
        output: "base64",
        draftWatermark: false,
      });

      if (pdfData?.base64) {
        setSelectedDoc({
          name: checklist.titulo,
          filename: pdfData.filename,
          base64: pdfData.base64,
        });
        setIsMailModalOpen(true);
      }
    } catch (error) {
      console.error("Erro ao enviar e-mail:", error);
      toast.error("Erro ao enviar e-mail.");
    } finally {
      setPrintingId(null);
    }
  }, []);

  const filteredModels = useMemo(
    () =>
      models.filter((model) =>
        (
          model.titulo +
          (model.descricao || "") +
          (model.equipamento || "") +
          (model.maquina || "") +
          (model.categoria || "")
        )
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
      ),
    [models, searchTerm],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">
              {area.title}
            </h1>
            {area.category ? <Badge variant="accent">{area.category}</Badge> : null}
          </div>
          <p className="max-w-3xl text-[var(--ds-color-text-secondary)]">
            {area.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showBootstrapAction ? (
            <Button
              type="button"
              onClick={handleBootstrapTemplates}
              disabled={bootstrapping}
              variant="secondary"
              leftIcon={<Plus className="h-4 w-4" />}
              title="Criar templates por atividade"
            >
              <span>{bootstrapping ? "Criando..." : "Templates por atividade"}</span>
            </Button>
          ) : null}
          <Link
            href={area.newHref}
            className={cn(buttonVariants({ variant: "primary" }), "gap-2")}
            title="Novo modelo"
          >
            <Plus className="h-4 w-4" />
            <span>Novo modelo</span>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {checklistModuleAreas.map((entry) => {
          const active = entry.slug === area.slug;

          return (
            <Link
              key={entry.slug}
              href={entry.href}
              className={cn(
                "rounded-[var(--ds-radius-xl)] border px-4 py-4 transition-all",
                active
                  ? "border-[var(--ds-color-action-primary)] bg-[var(--ds-color-action-primary)]/8 shadow-[var(--ds-shadow-sm)]"
                  : "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] hover:border-[var(--ds-color-action-primary)]/30 hover:bg-[var(--ds-color-surface-muted)]/40",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  {entry.label}
                </span>
                {active ? <Badge variant="accent">Atual</Badge> : null}
              </div>
              <p className="mt-2 text-xs text-[var(--ds-color-text-secondary)]">
                {entry.description}
              </p>
            </Link>
          );
        })}
      </div>

      <Card tone="elevated" padding="lg">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <Input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por título, categoria, equipamento ou máquina..."
              aria-label="Buscar modelos de checklist por título, categoria, equipamento ou máquina"
              className="pl-9"
            />
          </div>
          <div className="text-xs text-[var(--ds-color-text-secondary)]">
            {total} modelo(s) encontrado(s)
          </div>
        </div>

        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b border-[var(--ds-color-border-subtle)]">
              <th className="w-[38%] px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ds-color-text-secondary)]">
                Título
              </th>
              <th className="w-[18%] px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ds-color-text-secondary)]">
                Categoria
              </th>
              <th className="w-[24%] px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ds-color-text-secondary)]">
                Equipamento / Máquina
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ds-color-text-secondary)]">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ds-color-border-subtle)]">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-10 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent" />
                </td>
              </tr>
            ) : filteredModels.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="py-6 text-center text-[var(--ds-color-text-secondary)]"
                >
                  {area.category
                    ? `Nenhum modelo da categoria ${area.category} foi encontrado.`
                    : "Nenhum modelo encontrado."}
                </td>
              </tr>
            ) : (
              filteredModels.map((model) => (
                <tr
                  key={model.id}
                  className="transition-colors hover:bg-[var(--ds-color-primary-subtle)]/18"
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-[var(--ds-color-text-primary)]">
                        {model.titulo}
                      </div>
                      {model.is_modelo ? <Badge variant="accent">Modelo</Badge> : null}
                    </div>
                    <div className="text-xs text-[var(--ds-color-text-secondary)]">
                      {model.descricao}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="neutral">
                      {model.categoria || "Sem categoria"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-[var(--ds-color-text-secondary)]">
                      {model.equipamento || "-"}
                      {model.maquina ? ` / ${model.maquina}` : ""}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Link
                        href={
                          area.segment
                            ? `/dashboard/checklists/new?templateId=${model.id}&segment=${area.segment}&categoria=${encodeURIComponent(area.category || "")}`
                            : `/dashboard/checklists/fill/${model.id}`
                        }
                        className="text-[var(--ds-color-success)] transition-colors hover:text-[var(--ds-color-success-hover)]"
                        title="Preencher checklist"
                      >
                        <PlayCircle className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/dashboard/checklist-models/edit/${model.id}`}
                        className="text-[var(--ds-color-text-secondary)] transition-colors hover:text-[var(--ds-color-text-primary)]"
                        title="Editar modelo"
                      >
                        <PenTool className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleSendEmail(model)}
                        disabled={printingId === model.id}
                        className="text-[var(--ds-color-text-secondary)] transition-colors hover:text-[var(--ds-color-text-primary)] disabled:opacity-50"
                        title="Enviar por e-mail"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(model.id)}
                        className="text-[var(--ds-color-danger)] transition-colors hover:text-[var(--ds-color-danger-hover)]"
                        title="Excluir modelo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

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
