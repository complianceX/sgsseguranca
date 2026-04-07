"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { PaginationControls } from "@/components/PaginationControls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { catsService, CatRecord } from "@/services/catsService";
import { sitesService, Site } from "@/services/sitesService";
import { usersService, User } from "@/services/usersService";
import { openUrlInNewTab } from "@/lib/print-utils";
import { base64ToPdfFile } from "@/lib/pdf/pdfFile";
import { useAuth } from "@/context/AuthContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { Eye, FileDown, Mail, Pencil, Plus, ShieldCheck, Upload } from "lucide-react";
import { toIsoStringValue } from "@/lib/date/safeFormat";
const SendMailModal = dynamic(
  () => import("@/components/SendMailModal").then((module) => module.SendMailModal),
  { ssr: false },
);

const SUMMARY_CACHE_TTL_MS = 60_000;
const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;

export default function CatsPage() {
  const { loading: authLoading, hasPermission } = useAuth();
  const canViewCats = hasPermission("can_view_cats");
  const canManageCats = hasPermission("can_manage_cats");
  const catsSummaryCache = useCachedFetch(
    CACHE_KEYS.catsSummary,
    catsService.getSummary,
    SUMMARY_CACHE_TTL_MS,
  );
  const sitesLookupCache = useCachedFetch(
    CACHE_KEYS.catsSitesLookup,
    sitesService.findPaginated,
    LOOKUP_CACHE_TTL_MS,
  );
  const workersLookupCache = useCachedFetch(
    CACHE_KEYS.catsWorkersLookup,
    usersService.findPaginated,
    LOOKUP_CACHE_TTL_MS,
  );
  const [cats, setCats] = useState<CatRecord[]>([]);
  const [workerOptions, setWorkerOptions] = useState<User[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<User | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [workerSearch, setWorkerSearch] = useState("");
  const [siteSearch, setSiteSearch] = useState("");
  const deferredWorkerSearch = useDeferredValue(workerSearch);
  const deferredSiteSearch = useDeferredValue(siteSearch);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);
  const [summary, setSummary] = useState({
    total: 0,
    aberta: 0,
    investigacao: 0,
    fechada: 0,
  });
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatNumber, setEditingCatNumber] = useState<string | null>(null);
  const [mailModalOpen, setMailModalOpen] = useState(false);
  const [mailPayload, setMailPayload] = useState<{
    name: string;
    filename: string;
    base64?: string;
    storedDocument?: {
      documentId: string;
      documentType: string;
    };
  } | null>(null);
  const [form, setForm] = useState({
    data_ocorrencia: new Date().toISOString().slice(0, 16),
    tipo: "tipico",
    gravidade: "moderada",
    descricao: "",
    local_ocorrencia: "",
    worker_id: "",
    site_id: "",
    acao_imediata: "",
  });

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const sitesMap = useMemo(
    () => new Map(sites.map((item) => [item.id, item.nome])),
    [sites],
  );
  const availableWorkers = useMemo(() => {
    if (!selectedWorker) {
      return workerOptions;
    }

    return [
      selectedWorker,
      ...workerOptions.filter((item) => item.id !== selectedWorker.id),
    ];
  }, [selectedWorker, workerOptions]);

  const loadCats = useCallback(async () => {
    if (!canViewCats) {
      setCats([]);
      setTotal(0);
      setLastPage(1);
      setSummary({
        total: 0,
        aberta: 0,
        investigacao: 0,
        fechada: 0,
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [catsPage, summaryData] = await Promise.all([
        catsService.findPaginated({ page, limit: 20 }),
        catsSummaryCache.fetch(),
      ]);
      setCats(catsPage.data);
      setTotal(catsPage.total);
      setLastPage(catsPage.lastPage);
      setSummary(summaryData);
    } catch (error) {
      console.error("Erro ao carregar CATs:", error);
      toast.error("Erro ao carregar fluxo de CAT.");
    } finally {
      setLoading(false);
    }
  }, [canViewCats, catsSummaryCache, page]);

  useEffect(() => {
    void loadCats();
  }, [loadCats]);

  useEffect(() => {
    if (!canManageCats) {
      setSites([]);
      return;
    }

    const loadSites = async () => {
      try {
        const cachedSitesPage = await sitesLookupCache.fetch({
          page: 1,
          limit: 25,
          search: deferredSiteSearch || undefined,
        });
        let nextSites = cachedSitesPage.data;
        if (
          form.site_id &&
          !nextSites.some((item) => item.id === form.site_id)
        ) {
          try {
            const selectedSite = await sitesService.findOne(form.site_id);
            nextSites = dedupeById([selectedSite, ...nextSites]);
          } catch {
            nextSites = dedupeById(nextSites);
          }
        } else {
          nextSites = dedupeById(nextSites);
        }
        setSites(nextSites);
      } catch (error) {
        console.error("Erro ao carregar obras/setores:", error);
        toast.error("Erro ao carregar obras/setores.");
      }
    };

    void loadSites();
  }, [canManageCats, deferredSiteSearch, form.site_id, sitesLookupCache]);

  useEffect(() => {
    if (!canManageCats) {
      setWorkerOptions([]);
      return;
    }

    const loadWorkers = async () => {
      try {
        const workersPage = await workersLookupCache.fetch({
          page: 1,
          limit: 20,
          search: deferredWorkerSearch || undefined,
        });
        setWorkerOptions(workersPage.data);
      } catch (error) {
        console.error("Erro ao carregar colaboradores da CAT:", error);
        toast.error("Erro ao carregar colaboradores.");
      }
    };

    void loadWorkers();
  }, [canManageCats, deferredWorkerSearch, workersLookupCache]);

  const resetCatForm = useCallback(() => {
    setForm({
      data_ocorrencia: new Date().toISOString().slice(0, 16),
      tipo: "tipico",
      gravidade: "moderada",
      descricao: "",
      local_ocorrencia: "",
      worker_id: "",
      site_id: "",
      acao_imediata: "",
    });
    setSelectedWorker(null);
    setWorkerSearch("");
    setEditingCatId(null);
    setEditingCatNumber(null);
  }, []);

  const handleSubmitForm = async () => {
    if (!canManageCats) {
      toast.error("Voce nao tem permissao para gerenciar CAT.");
      return;
    }

    if (!form.descricao.trim()) {
      toast.error("Descricao da CAT e obrigatoria.");
      return;
    }

    const occurrenceAt = toIsoStringValue(form.data_ocorrencia);
    if (!occurrenceAt) {
      toast.error("Data da ocorrência inválida.");
      return;
    }

    const payload = {
      data_ocorrencia: occurrenceAt,
      tipo: form.tipo as CatRecord["tipo"],
      gravidade: form.gravidade as CatRecord["gravidade"],
      descricao: form.descricao,
      local_ocorrencia: form.local_ocorrencia || undefined,
      worker_id: form.worker_id || undefined,
      site_id: form.site_id || undefined,
      acao_imediata: form.acao_imediata || undefined,
    };

    try {
      setCreating(true);
      if (editingCatId) {
        await catsService.update(editingCatId, payload);
        toast.success("CAT atualizada com sucesso.");
      } else {
        await catsService.create(payload);
        toast.success("CAT aberta com sucesso.");
      }
      catsSummaryCache.invalidate();
      resetCatForm();
      if (page !== 1) {
        setPage(1);
        return;
      }
      await loadCats();
    } catch (error) {
      console.error("Erro ao salvar CAT:", error);
      toast.error("Nao foi possivel salvar a CAT.");
    } finally {
      setCreating(false);
    }
  };

  const handleStartInvestigation = async (cat: CatRecord) => {
    if (!canManageCats) {
      toast.error("Voce nao tem permissao para investigar CAT.");
      return;
    }

    const detalhes = window.prompt(
      `Investigation details for CAT ${cat.numero}:`,
      cat.investigacao_detalhes || "",
    );
    if (!detalhes?.trim()) {
      return;
    }
    const causaRaiz = window.prompt(
      "Causa raiz (opcional):",
      cat.causa_raiz || "",
    );
    try {
      await catsService.startInvestigation(cat.id, {
        investigacao_detalhes: detalhes.trim(),
        causa_raiz: causaRaiz?.trim() || undefined,
      });
      catsSummaryCache.invalidate();
      toast.success("CAT movida para investigacao.");
      await loadCats();
    } catch (error) {
      console.error("Erro ao iniciar investigacao:", error);
      toast.error("Falha ao iniciar investigacao da CAT.");
    }
  };

  const handleClose = async (cat: CatRecord) => {
    if (!canManageCats) {
      toast.error("Voce nao tem permissao para fechar CAT.");
      return;
    }

    const plano = window.prompt(
      `Plano de acao para fechamento da CAT ${cat.numero}:`,
      cat.plano_acao_fechamento || "",
    );
    if (!plano?.trim()) {
      return;
    }
    const licoes = window.prompt(
      "Licoes aprendidas (opcional):",
      cat.licoes_aprendidas || "",
    );
    try {
      await catsService.close(cat.id, {
        plano_acao_fechamento: plano.trim(),
        licoes_aprendidas: licoes?.trim() || undefined,
      });
      catsSummaryCache.invalidate();
      toast.success("CAT fechada com sucesso.");
      await loadCats();
    } catch (error) {
      console.error("Erro ao fechar CAT:", error);
      toast.error("Falha ao fechar CAT.");
    }
  };

  const handleUploadAttachment = async (catId: string, file?: File) => {
    if (!canManageCats) {
      toast.error("Voce nao tem permissao para anexar arquivos na CAT.");
      return;
    }

    if (!file) {
      return;
    }
    try {
      await catsService.uploadAttachment(catId, file, "geral");
      toast.success("Anexo enviado.");
      await loadCats();
    } catch (error) {
      console.error("Erro ao enviar anexo:", error);
      toast.error("Falha ao anexar arquivo na CAT.");
    } finally {
      const input = fileInputRefs.current[catId];
      if (input) {
        input.value = "";
      }
    }
  };

  const handleOpenAttachment = async (catId: string, attachmentId: string) => {
    try {
      const access = await catsService.getAttachmentAccess(catId, attachmentId);
      openUrlInNewTab(access.url);
    } catch (error) {
      console.error("Erro ao abrir anexo:", error);
      toast.error("Nao foi possivel abrir o anexo.");
    }
  };

  const buildCatPdfFilename = (cat: CatRecord) =>
    `${(cat.numero || `cat-${cat.id}`).replace(/[^\w.-]+/g, "-")}.pdf`;

  const generateLocalCatPdfBase64 = async (
    cat: CatRecord,
    draftWatermark = true,
  ) => {
    const fullCat = await catsService.findOne(cat.id);
    const { generateCatPdf } = await import("@/lib/pdf/catGenerator");
    const result = await generateCatPdf(fullCat, {
      save: false,
      output: "base64",
      draftWatermark,
    });
    if (!result?.base64) {
      throw new Error("Falha ao gerar PDF local da CAT.");
    }
    return result.base64;
  };

  const ensureGovernedPdf = async (cat: CatRecord) => {
    const access = await catsService.getPdfAccess(cat.id);
    if (access.hasFinalPdf) {
      return access;
    }

    if (!canManageCats) {
      throw new Error(
        "Voce nao tem permissao para emitir o PDF final governado desta CAT.",
      );
    }

    const base64 = await generateLocalCatPdfBase64(cat, false);
    const file = base64ToPdfFile(base64, buildCatPdfFilename(cat));
    const result = await catsService.attachFinalPdf(cat.id, file);

    if (result.degraded) {
      toast.warning(result.message);
    } else {
      toast.success(result.message);
    }

    await loadCats();
    return catsService.getPdfAccess(cat.id);
  };

  const handleOpenGovernedPdf = async (cat: CatRecord) => {
    try {
      const access = await ensureGovernedPdf(cat);
      if (access.availability !== "ready" || !access.url) {
        toast.warning(access.message);
        return;
      }
      openUrlInNewTab(access.url);
    } catch (error) {
      console.error("Erro ao emitir/abrir PDF final da CAT:", error);
      toast.error("Nao foi possivel emitir ou abrir o PDF final da CAT.");
    }
  };

  const handlePrepareEmail = async (cat: CatRecord) => {
    try {
      const access = await catsService.getPdfAccess(cat.id);
      if (access.hasFinalPdf) {
        if (access.availability !== "ready") {
          toast.warning(
            "PDF final governado existe, mas o storage esta degradado. O envio oficial ainda sera tentado com o documento governado.",
          );
        }
        setMailPayload({
          name: `CAT ${cat.numero}`,
          filename: access.originalName || buildCatPdfFilename(cat),
          storedDocument: {
            documentId: cat.id,
            documentType: "CAT",
          },
        });
        setMailModalOpen(true);
        return;
      }

      toast.warning(
        "PDF final governado ainda nao emitido. O envio sera feito com PDF local nao governado.",
      );
      const base64 = await generateLocalCatPdfBase64(cat, true);
      setMailPayload({
        name: `CAT ${cat.numero}`,
        filename: buildCatPdfFilename(cat),
        base64,
      });
      setMailModalOpen(true);
    } catch (error) {
      console.error("Erro ao preparar envio de e-mail da CAT:", error);
      toast.error("Nao foi possivel preparar o envio por e-mail da CAT.");
    }
  };

  const handleDownloadPdf = async (catId: string) => {
    try {
      await catsService.downloadPdf(catId);
      toast.success("PDF institucional da CAT gerado com sucesso.");
    } catch (error) {
      console.error("Erro ao gerar PDF da CAT:", error);
      toast.error("Nao foi possivel gerar o PDF da CAT.");
    }
  };

  const handleEdit = (cat: CatRecord) => {
    if (!canManageCats) {
      toast.error("Voce nao tem permissao para editar CAT.");
      return;
    }
    if (cat.status === "fechada") {
      toast.error("CAT fechada nao pode ser editada.");
      return;
    }

    setEditingCatId(cat.id);
    setEditingCatNumber(cat.numero);
    setForm({
      data_ocorrencia: toDateTimeLocalValue(cat.data_ocorrencia),
      tipo: cat.tipo,
      gravidade: cat.gravidade,
      descricao: cat.descricao || "",
      local_ocorrencia: cat.local_ocorrencia || "",
      worker_id: cat.worker_id || "",
      site_id: cat.site_id || "",
      acao_imediata: cat.acao_imediata || "",
    });
    if (cat.worker) {
      setSelectedWorker(cat.worker as User);
    }
  };

  if (authLoading) {
    return (
      <div className="ds-system-scope">
        <div className="ds-surface-card p-4">
          <p className="text-sm text-[var(--ds-color-text-secondary)]">Carregando permissoes...</p>
        </div>
      </div>
    );
  }

  if (!canViewCats) {
    return (
      <div className="ds-system-scope">
        <div className="ds-surface-card p-4">
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">
            CAT - Acidente de Trabalho
          </h1>
          <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
            Voce nao tem permissao para visualizar o fluxo de CAT.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-system-scope space-y-6">
      <div className="ds-surface-card p-4">
        <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">
          CAT - Acidente de Trabalho
        </h1>
        <p className="text-[var(--ds-color-text-secondary)]">
          Fluxo completo: abertura, investigacao, fechamento e anexos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi title="Total" value={summary.total} />
        <Kpi title="Abertas" value={summary.aberta} />
        <Kpi title="Em investigacao" value={summary.investigacao} />
        <Kpi title="Fechadas" value={summary.fechada} />
      </div>

      {canManageCats ? (
        <div className="ds-surface-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
            {editingCatId ? `Editar CAT ${editingCatNumber || ""}` : "Abrir CAT"}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <input
              type="datetime-local"
              value={form.data_ocorrencia}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, data_ocorrencia: e.target.value }))
              }
              className="rounded-md border px-3 py-2 text-sm"
            />
            <select
              value={form.tipo}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, tipo: e.target.value }))
              }
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="tipico">Tipico</option>
              <option value="trajeto">Trajeto</option>
              <option value="doenca_ocupacional">Doenca ocupacional</option>
              <option value="outros">Outros</option>
            </select>
            <select
              value={form.gravidade}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, gravidade: e.target.value }))
              }
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="leve">Leve</option>
              <option value="moderada">Moderada</option>
              <option value="grave">Grave</option>
              <option value="fatal">Fatal</option>
            </select>
            <select
              value={form.worker_id}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedWorker(
                  availableWorkers.find((item) => item.id === value) || null,
                );
                setForm((prev) => ({ ...prev, worker_id: value }));
              }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Colaborador</option>
              {availableWorkers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
            <select
              value={form.site_id}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, site_id: e.target.value }))
              }
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Obra/Setor</option>
              {sites.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleSubmitForm()}
              disabled={creating}
              className="flex items-center justify-center rounded-md bg-[var(--ds-color-action-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-60"
            >
              <Plus className="mr-2 h-4 w-4" />
              {creating
                ? "Salvando..."
                : editingCatId
                  ? "Salvar alteracoes"
                  : "Abrir"}
            </button>
            {editingCatId ? (
              <button
                type="button"
                onClick={resetCatForm}
                className="rounded-md border px-3 py-2 text-sm text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
              >
                Cancelar edicao
              </button>
            ) : null}
            <input
              type="text"
              value={workerSearch}
              onChange={(e) => setWorkerSearch(e.target.value)}
              placeholder="Buscar colaborador"
              className="rounded-md border px-3 py-2 text-sm md:col-span-2"
            />
            <input
              type="text"
              value={siteSearch}
              onChange={(e) => setSiteSearch(e.target.value)}
              placeholder="Buscar obra/setor"
              className="rounded-md border px-3 py-2 text-sm md:col-span-2"
            />
            <input
              type="text"
              value={form.local_ocorrencia}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, local_ocorrencia: e.target.value }))
              }
              placeholder="Local da ocorrencia"
              className="rounded-md border px-3 py-2 text-sm md:col-span-1"
            />
            <input
              type="text"
              value={form.acao_imediata}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, acao_imediata: e.target.value }))
              }
              placeholder="Acao imediata"
              className="rounded-md border px-3 py-2 text-sm md:col-span-1"
            />
            <input
              type="text"
              value={form.descricao}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, descricao: e.target.value }))
              }
              placeholder="Descricao da ocorrencia"
              className="rounded-md border px-3 py-2 text-sm md:col-span-6"
            />
          </div>
        </div>
      ) : null}

      <div className="ds-surface-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numero</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Colaborador</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Anexos</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-[var(--ds-color-text-secondary)]"
                >
                  Carregando CATs...
                </TableCell>
              </TableRow>
            ) : cats.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-[var(--ds-color-text-secondary)]"
                >
                  Nenhuma CAT registrada.
                </TableCell>
              </TableRow>
            ) : (
              cats.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.numero}</TableCell>
                  <TableCell>
                    {new Date(cat.data_ocorrencia).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>{cat.worker?.nome || "-"}</TableCell>
                  <TableCell>
                    {cat.local_ocorrencia ||
                      cat.site?.nome ||
                      sitesMap.get(cat.site_id || "") ||
                      "-"}
                  </TableCell>
                  <TableCell>{cat.status}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {(cat.attachments || []).slice(0, 2).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            void handleOpenAttachment(cat.id, item.id)
                          }
                          className="rounded border border-[var(--ds-color-border-default)] px-2 py-0.5 text-xs text-[var(--ds-color-text-primary)] hover:bg-[var(--ds-color-primary-subtle)]"
                        >
                          <Eye className="mr-1 inline h-3 w-3" />
                          {item.file_name}
                        </button>
                      ))}
                      {cat.attachments && cat.attachments.length > 2 && (
                        <span className="text-xs text-[var(--ds-color-text-secondary)]">
                          +{cat.attachments.length - 2}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canManageCats ? (
                        <>
                          <input
                            type="file"
                            aria-label="Selecionar anexo da CAT"
                            ref={(el) => {
                              fileInputRefs.current[cat.id] = el;
                            }}
                            className="hidden"
                            onChange={(event) =>
                              void handleUploadAttachment(
                                cat.id,
                                event.target.files?.[0],
                              )
                            }
                          />
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
                            onClick={() => fileInputRefs.current[cat.id]?.click()}
                          >
                            <Upload className="mr-1 inline h-3 w-3" />
                            Anexar
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
                        onClick={() => void handleDownloadPdf(cat.id)}
                      >
                        <FileDown className="mr-1 inline h-3 w-3" />
                        PDF local
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs text-[var(--ds-color-text-primary)] hover:bg-[var(--ds-color-primary-subtle)]"
                        onClick={() => void handleOpenGovernedPdf(cat)}
                        disabled={!cat.pdf_file_key && !canManageCats}
                        title={
                          cat.pdf_file_key
                            ? "Abrir PDF final governado"
                            : canManageCats
                              ? "Emitir PDF final governado"
                              : "Sem permissao para emitir PDF final governado"
                        }
                      >
                        <ShieldCheck className="mr-1 inline h-3 w-3 text-[var(--ds-color-success)]" />
                        {cat.pdf_file_key ? "PDF final" : "Emitir final"}
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
                        onClick={() => void handlePrepareEmail(cat)}
                      >
                        <Mail className="mr-1 inline h-3 w-3" />
                        E-mail
                      </button>
                      {canManageCats && cat.status !== "fechada" ? (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
                          onClick={() => handleEdit(cat)}
                        >
                          <Pencil className="mr-1 inline h-3 w-3" />
                          Editar
                        </button>
                      ) : null}
                      {canManageCats && cat.status !== "fechada" && (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs text-[var(--ds-color-text-primary)] hover:bg-[var(--ds-color-primary-subtle)]"
                          onClick={() => void handleStartInvestigation(cat)}
                        >
                          Investigar
                        </button>
                      )}
                      {canManageCats && cat.status !== "fechada" && (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs text-[var(--ds-color-success)] hover:bg-[var(--ds-color-success-subtle)]"
                          onClick={() => void handleClose(cat)}
                        >
                          Fechar
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!loading && cats.length > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={handlePrevPage}
            onNext={handleNextPage}
          />
        ) : null}
      </div>

      {mailPayload ? (
        <SendMailModal
          isOpen={mailModalOpen}
          onClose={() => {
            setMailModalOpen(false);
            setMailPayload(null);
          }}
          documentName={mailPayload.name}
          filename={mailPayload.filename}
          base64={mailPayload.base64}
          storedDocument={mailPayload.storedDocument}
        />
      ) : null}
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: number }) {
  return (
    <div className="ds-surface-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
        {title}
      </p>
      <p className="mt-1 text-2xl font-bold text-[var(--ds-color-text-primary)]">{value}</p>
    </div>
  );
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function toDateTimeLocalValue(value?: string) {
  if (!value) {
    return new Date().toISOString().slice(0, 16);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 16);
  }

  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - timezoneOffsetMs);
  return local.toISOString().slice(0, 16);
}




