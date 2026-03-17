"use client";

import { useState, useEffect, useCallback, useDeferredValue } from "react";
import { toast } from "sonner";
import {
  rdosService,
  Rdo,
  MaoDeObraItem,
  EquipamentoItem,
  MaterialItem,
  ServicoItem,
  OcorrenciaItem,
  RDO_STATUS_LABEL,
  RDO_STATUS_COLORS,
  RDO_ALLOWED_TRANSITIONS,
  CLIMA_LABEL,
  OCORRENCIA_TIPO_LABEL,
} from "@/services/rdosService";
import { sitesService, Site } from "@/services/sitesService";
import { usersService, User } from "@/services/usersService";
import { downloadExcel } from "@/lib/download-excel";
import {
  Plus,
  Search,
  FileSpreadsheet,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertTriangle,
  Users,
  Wrench,
  Package,
  CheckSquare,
  CloudRain,
  Eye,
  Pencil,
  X,
  Sun,
  Thermometer,
  Printer,
  PenLine,
  Mail,
  Send,
  Download,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/PaginationControls";
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
import { cn } from "@/lib/utils";
import { openPdfForPrint, openUrlInNewTab } from "@/lib/print-utils";
import { StoredFilesPanel } from "@/components/StoredFilesPanel";
import { generateRdoPdf } from "@/lib/pdf/rdoGenerator";
import { base64ToPdfBlob, base64ToPdfFile } from "@/lib/pdf/pdfFile";

const inputClassName =
  "h-11 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 text-base text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]";

const formInputClassName =
  "w-full min-h-[2.875rem] rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 py-2.5 text-base leading-6 text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)] transition-all";

const formInputSmClassName =
  "w-full min-h-[2.625rem] rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-base text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-focus)] focus:outline-none transition-all";

const STEPS = [
  { label: "Dados Básicos", icon: ClipboardList },
  { label: "Clima", icon: CloudRain },
  { label: "Mão de Obra", icon: Users },
  { label: "Equipamentos", icon: Wrench },
  { label: "Materiais", icon: Package },
  { label: "Serviços", icon: CheckSquare },
  { label: "Ocorrências", icon: AlertTriangle },
];

const CLIMA_OPTIONS = [
  { value: "ensolarado", label: "Ensolarado" },
  { value: "nublado", label: "Nublado" },
  { value: "chuvoso", label: "Chuvoso" },
  { value: "parcialmente_nublado", label: "Parcialmente Nublado" },
];

const TURNO_OPTIONS = [
  { value: "manha", label: "Manhã" },
  { value: "tarde", label: "Tarde" },
  { value: "noite", label: "Noite" },
];

const OCORRENCIA_TIPO_OPTIONS = [
  { value: "acidente", label: "Acidente" },
  { value: "incidente", label: "Incidente" },
  { value: "visita", label: "Visita" },
  { value: "paralisacao", label: "Paralisação" },
  { value: "outro", label: "Outro" },
];

function escapePrintHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapePrintHtmlWithBreaks(value: unknown) {
  return escapePrintHtml(value).replace(/\r?\n/g, "<br/>");
}

interface FormState {
  data: string;
  site_id: string;
  responsavel_id: string;
  clima_manha: string;
  clima_tarde: string;
  temperatura_min: string;
  temperatura_max: string;
  condicao_terreno: string;
  mao_de_obra: MaoDeObraItem[];
  equipamentos: EquipamentoItem[];
  materiais_recebidos: MaterialItem[];
  servicos_executados: ServicoItem[];
  ocorrencias: OcorrenciaItem[];
  houve_acidente: boolean;
  houve_paralisacao: boolean;
  motivo_paralisacao: string;
  observacoes: string;
  programa_servicos_amanha: string;
}

const defaultForm: FormState = {
  data: new Date().toISOString().slice(0, 10),
  site_id: "",
  responsavel_id: "",
  clima_manha: "",
  clima_tarde: "",
  temperatura_min: "",
  temperatura_max: "",
  condicao_terreno: "",
  mao_de_obra: [],
  equipamentos: [],
  materiais_recebidos: [],
  servicos_executados: [],
  ocorrencias: [],
  houve_acidente: false,
  houve_paralisacao: false,
  motivo_paralisacao: "",
  observacoes: "",
  programa_servicos_amanha: "",
};

function rdoToForm(rdo: Rdo): FormState {
  return {
    data:
      typeof rdo.data === "string"
        ? rdo.data.slice(0, 10)
        : new Date(rdo.data).toISOString().slice(0, 10),
    site_id: rdo.site_id ?? "",
    responsavel_id: rdo.responsavel_id ?? "",
    clima_manha: rdo.clima_manha ?? "",
    clima_tarde: rdo.clima_tarde ?? "",
    temperatura_min:
      rdo.temperatura_min != null ? String(rdo.temperatura_min) : "",
    temperatura_max:
      rdo.temperatura_max != null ? String(rdo.temperatura_max) : "",
    condicao_terreno: rdo.condicao_terreno ?? "",
    mao_de_obra: rdo.mao_de_obra ?? [],
    equipamentos: rdo.equipamentos ?? [],
    materiais_recebidos: rdo.materiais_recebidos ?? [],
    servicos_executados: rdo.servicos_executados ?? [],
    ocorrencias: rdo.ocorrencias ?? [],
    houve_acidente: rdo.houve_acidente,
    houve_paralisacao: rdo.houve_paralisacao,
    motivo_paralisacao: rdo.motivo_paralisacao ?? "",
    observacoes: rdo.observacoes ?? "",
    programa_servicos_amanha: rdo.programa_servicos_amanha ?? "",
  };
}

export default function RdosPage() {
  const [rdos, setRdos] = useState<Rdo[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState<FormState>(defaultForm);

  // View modal
  const [viewRdo, setViewRdo] = useState<Rdo | null>(null);

  // Sign modal
  const [signModal, setSignModal] = useState<{
    rdo: Rdo;
    tipo: "responsavel" | "engenheiro";
  } | null>(null);
  const [signForm, setSignForm] = useState({
    nome: "",
    cpf: "",
    tipo: "responsavel" as "responsavel" | "engenheiro",
  });
  const [signing, setSigning] = useState(false);

  // Email modal
  const [emailModal, setEmailModal] = useState<Rdo | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Paginação + filtros
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSiteId, setFilterSiteId] = useState("");
  const [filterDataInicio, setFilterDataInicio] = useState("");
  const [filterDataFim, setFilterDataFim] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  // Resumo
  const [summary, setSummary] = useState({
    total: 0,
    rascunho: 0,
    enviado: 0,
    aprovado: 0,
  });

  const getErrorStatus = useCallback((error: unknown) => {
    return (
      Number(
        (error as { response?: { status?: number } } | undefined)?.response
          ?.status ?? 0,
      ) || null
    );
  }, []);

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

  const getAllowedStatusTransitions = useCallback((rdo: Rdo) => {
    if (rdo.pdf_file_key) {
      return [];
    }

    return (RDO_ALLOWED_TRANSITIONS[rdo.status] ?? []).filter((status) => {
      if (status !== "aprovado") {
        return true;
      }
      return Boolean(rdo.assinatura_responsavel && rdo.assinatura_engenheiro);
    });
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [rdosData, sitesPage, usersPage] = await Promise.all([
        rdosService.findPaginated({
          page,
          limit,
          status: filterStatus || undefined,
          site_id: filterSiteId || undefined,
          data_inicio: filterDataInicio || undefined,
          data_fim: filterDataFim || undefined,
        }),
        sitesService.findPaginated({ page: 1, limit: 100 }),
        usersService.findPaginated({ page: 1, limit: 100 }),
      ]);
      setRdos(rdosData.data);
      setTotal(rdosData.total);
      setLastPage(rdosData.lastPage);
      setSites(sitesPage.data);
      setUsers(usersPage.data);

      const allRdos = rdosData.data;
      setSummary({
        total: rdosData.total,
        rascunho: allRdos.filter((r) => r.status === "rascunho").length,
        enviado: allRdos.filter((r) => r.status === "enviado").length,
        aprovado: allRdos.filter((r) => r.status === "aprovado").length,
      });
    } catch (error) {
      console.error("Erro ao carregar RDOs:", error);
      setLoadError("Não foi possível carregar os RDOs.");
      toast.error("Erro ao carregar RDOs.");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    filterStatus,
    filterSiteId,
    filterDataInicio,
    filterDataFim,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getGovernedPdfAccess = useCallback(
    async (rdoId: string) => {
      try {
        return await rdosService.getPdfAccess(rdoId);
      } catch (error) {
        if (getErrorStatus(error) === 404) {
          return null;
        }
        throw error;
      }
    },
    [getErrorStatus],
  );

  const ensureGovernedPdf = useCallback(
    async (rdo: Rdo) => {
      const existingAccess = await getGovernedPdfAccess(rdo.id);
      if (existingAccess) {
        return existingAccess;
      }

      if (rdo.status !== "aprovado") {
        return null;
      }

      const fullRdo = await rdosService.findOne(rdo.id);
      const result = (await generateRdoPdf(fullRdo, {
        save: false,
        output: "base64",
      })) as { base64: string; filename: string } | undefined;

      if (!result?.base64) {
        throw new Error("Falha ao gerar o PDF oficial do RDO.");
      }

      const pdfFile = base64ToPdfFile(result.base64, result.filename);
      await rdosService.attachFile(rdo.id, pdfFile);
      await loadData();
      toast.success("PDF final do RDO emitido e registrado com sucesso.");
      return rdosService.getPdfAccess(rdo.id);
    },
    [getGovernedPdfAccess, loadData],
  );

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setCurrentStep(0);
    setShowModal(true);
  };

  const handleOpenEdit = (rdo: Rdo) => {
    if (rdo.pdf_file_key) {
      toast.error(
        "RDO com PDF final emitido esta bloqueado para edicao. Gere um novo documento para alterar o conteudo.",
      );
      return;
    }
    setEditingId(rdo.id);
    setForm(rdoToForm(rdo));
    setCurrentStep(0);
    setShowModal(true);
  };

  const handlePrintAfterSave = useCallback(
    async (rdo: Rdo) => {
      toast.info("Preparando impressão do RDO...");

      const shouldUseGovernedPdf =
        Boolean(rdo.pdf_file_key) || rdo.status === "aprovado";

      if (shouldUseGovernedPdf) {
        const access = await ensureGovernedPdf(rdo);
        if (access?.url) {
          openPdfForPrint(access.url, () => {
            toast.info(
              "Pop-up bloqueado. Abrimos o PDF final do RDO na mesma aba para impressão.",
            );
          });
          return;
        }

        if (access) {
          toast.warning(
            "O PDF final do RDO foi emitido, mas a URL segura não está disponível agora.",
          );
          return;
        }
      }

      const fullRdo = await rdosService.findOne(rdo.id);
      const result = (await generateRdoPdf(fullRdo, {
        save: false,
        output: "base64",
      })) as { base64: string } | undefined;

      if (!result?.base64) {
        throw new Error("Falha ao gerar PDF do RDO para impressão.");
      }

      const fileURL = URL.createObjectURL(base64ToPdfBlob(result.base64));
      openPdfForPrint(fileURL, () => {
        toast.info("Pop-up bloqueado. Abrimos o PDF na mesma aba para impressão.");
      });
      setTimeout(() => URL.revokeObjectURL(fileURL), 60_000);
    },
    [ensureGovernedPdf],
  );

  const handleSave = async (options?: { printAfterSave?: boolean }) => {
    const shouldPrintAfterSave = options?.printAfterSave ?? false;
    if (!form.data) {
      toast.error("Informe a data do RDO.");
      return;
    }
    setSaving(true);
    const payload = {
      data: form.data,
      site_id: form.site_id || undefined,
      responsavel_id: form.responsavel_id || undefined,
      clima_manha: form.clima_manha || undefined,
      clima_tarde: form.clima_tarde || undefined,
      temperatura_min: form.temperatura_min
        ? Number(form.temperatura_min)
        : undefined,
      temperatura_max: form.temperatura_max
        ? Number(form.temperatura_max)
        : undefined,
      condicao_terreno: form.condicao_terreno || undefined,
      mao_de_obra: form.mao_de_obra.length > 0 ? form.mao_de_obra : undefined,
      equipamentos:
        form.equipamentos.length > 0 ? form.equipamentos : undefined,
      materiais_recebidos:
        form.materiais_recebidos.length > 0
          ? form.materiais_recebidos
          : undefined,
      servicos_executados:
        form.servicos_executados.length > 0
          ? form.servicos_executados
          : undefined,
      ocorrencias: form.ocorrencias.length > 0 ? form.ocorrencias : undefined,
      houve_acidente: form.houve_acidente,
      houve_paralisacao: form.houve_paralisacao,
      motivo_paralisacao: form.motivo_paralisacao || undefined,
      observacoes: form.observacoes || undefined,
      programa_servicos_amanha: form.programa_servicos_amanha || undefined,
    };
    try {
      let savedRdo: Rdo;
      if (editingId) {
        savedRdo = await rdosService.update(editingId, payload);
        toast.success("RDO atualizado com sucesso!");
      } else {
        savedRdo = await rdosService.create(payload);
        toast.success("RDO criado com sucesso!");
      }
      setShowModal(false);
      await loadData();

      if (shouldPrintAfterSave) {
        try {
          await handlePrintAfterSave(savedRdo);
        } catch (printError) {
          console.error("Erro ao preparar impressão automática do RDO:", printError);
          toast.warning(
            "RDO salvo, mas não foi possível abrir a impressão automática.",
          );
        }
      }
    } catch (error) {
      console.error("Erro ao salvar RDO:", error);
      toast.error("Erro ao salvar RDO.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const updated = await rdosService.updateStatus(id, newStatus);
      setRdos((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: updated.status } : r)),
      );
      if (viewRdo?.id === id)
        setViewRdo((v) => (v ? { ...v, status: updated.status } : v));
      toast.success(`Status atualizado para "${RDO_STATUS_LABEL[newStatus]}"`);
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast.error(getApiErrorMessage(error) || "Erro ao atualizar status do RDO.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja excluir este RDO?")) return;
    try {
      await rdosService.delete(id);
      toast.success("RDO excluído.");
      loadData();
    } catch (error) {
      console.error("Erro ao excluir RDO:", error);
      toast.error("Erro ao excluir RDO.");
    }
  };

  // Helpers para arrays do formulário
  const addMaoDeObra = () =>
    setForm((f) => ({
      ...f,
      mao_de_obra: [
        ...f.mao_de_obra,
        { funcao: "", quantidade: 1, turno: "manha", horas: 8 },
      ],
    }));
  const removeMaoDeObra = (i: number) =>
    setForm((f) => ({
      ...f,
      mao_de_obra: f.mao_de_obra.filter((_, idx) => idx !== i),
    }));
  const updateMaoDeObra = (
    i: number,
    field: keyof MaoDeObraItem,
    value: string | number,
  ) =>
    setForm((f) => {
      const arr = [...f.mao_de_obra];
      arr[i] = { ...arr[i], [field]: value } as MaoDeObraItem;
      return { ...f, mao_de_obra: arr };
    });

  const addEquipamento = () =>
    setForm((f) => ({
      ...f,
      equipamentos: [
        ...f.equipamentos,
        { nome: "", quantidade: 1, horas_trabalhadas: 0, horas_ociosas: 0 },
      ],
    }));
  const removeEquipamento = (i: number) =>
    setForm((f) => ({
      ...f,
      equipamentos: f.equipamentos.filter((_, idx) => idx !== i),
    }));
  const updateEquipamento = (
    i: number,
    field: keyof EquipamentoItem,
    value: string | number,
  ) =>
    setForm((f) => {
      const arr = [...f.equipamentos];
      arr[i] = { ...arr[i], [field]: value } as EquipamentoItem;
      return { ...f, equipamentos: arr };
    });

  const addMaterial = () =>
    setForm((f) => ({
      ...f,
      materiais_recebidos: [
        ...f.materiais_recebidos,
        { descricao: "", unidade: "un", quantidade: 0 },
      ],
    }));
  const removeMaterial = (i: number) =>
    setForm((f) => ({
      ...f,
      materiais_recebidos: f.materiais_recebidos.filter((_, idx) => idx !== i),
    }));
  const updateMaterial = (
    i: number,
    field: keyof MaterialItem,
    value: string | number,
  ) =>
    setForm((f) => {
      const arr = [...f.materiais_recebidos];
      arr[i] = { ...arr[i], [field]: value } as MaterialItem;
      return { ...f, materiais_recebidos: arr };
    });

  const addServico = () =>
    setForm((f) => ({
      ...f,
      servicos_executados: [
        ...f.servicos_executados,
        { descricao: "", percentual_concluido: 0 },
      ],
    }));
  const removeServico = (i: number) =>
    setForm((f) => ({
      ...f,
      servicos_executados: f.servicos_executados.filter((_, idx) => idx !== i),
    }));
  const updateServico = (
    i: number,
    field: keyof ServicoItem,
    value: string | number,
  ) =>
    setForm((f) => {
      const arr = [...f.servicos_executados];
      arr[i] = { ...arr[i], [field]: value } as ServicoItem;
      return { ...f, servicos_executados: arr };
    });

  const addOcorrencia = () =>
    setForm((f) => ({
      ...f,
      ocorrencias: [...f.ocorrencias, { tipo: "outro", descricao: "" }],
    }));
  const removeOcorrencia = (i: number) =>
    setForm((f) => ({
      ...f,
      ocorrencias: f.ocorrencias.filter((_, idx) => idx !== i),
    }));
  const updateOcorrencia = (
    i: number,
    field: keyof OcorrenciaItem,
    value: string,
  ) =>
    setForm((f) => {
      const arr = [...f.ocorrencias];
      arr[i] = { ...arr[i], [field]: value } as OcorrenciaItem;
      return { ...f, ocorrencias: arr };
    });

  const handlePrint = (rdo: Rdo) => {
    const printPreview = () => {
      const dataFormatada = new Date(rdo.data).toLocaleDateString("pt-BR");
      const totalTrab = (rdo.mao_de_obra ?? []).reduce(
        (s, m) => s + m.quantidade,
        0,
      );
      const win = window.open("", "_blank");
      if (!win) {
        toast.error("Ative pop-ups para imprimir.");
        return;
      }
      const rows = (rdo.mao_de_obra ?? [])
        .map(
          (m) =>
            `<tr><td>${escapePrintHtml(m.funcao)}</td><td>${escapePrintHtml(m.quantidade)}</td><td>${escapePrintHtml(m.turno)}</td><td>${escapePrintHtml(m.horas)}h</td></tr>`,
        )
        .join("");
      const servicos = (rdo.servicos_executados ?? [])
        .map(
          (s) =>
            `<tr><td>${escapePrintHtml(s.descricao)}</td><td>${escapePrintHtml(s.percentual_concluido)}%</td></tr>`,
        )
        .join("");
      const ocorrencias = (rdo.ocorrencias ?? [])
        .map(
          (o) =>
            `<tr><td>${escapePrintHtml(OCORRENCIA_TIPO_LABEL[o.tipo] ?? o.tipo)}</td><td>${escapePrintHtml(o.descricao)}</td><td>${escapePrintHtml(o.hora ?? "")}</td></tr>`,
        )
        .join("");
      const sigResp = rdo.assinatura_responsavel
        ? (() => {
            try {
              return JSON.parse(rdo.assinatura_responsavel!);
            } catch {
              return null;
            }
          })()
        : null;
      const sigEng = rdo.assinatura_engenheiro
        ? (() => {
            try {
              return JSON.parse(rdo.assinatura_engenheiro!);
            } catch {
              return null;
            }
          })()
        : null;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>RDO ${escapePrintHtml(rdo.numero)}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:24px}
  h1{font-size:18px;margin:0 0 4px}
  .sub{color:#555;font-size:11px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin-bottom:12px}
  th{background:#f0f0f0;padding:6px 8px;text-align:left;font-size:11px;border:1px solid #ccc}
  td{padding:5px 8px;border:1px solid #ddd;font-size:11px}
  .section{font-weight:bold;text-transform:uppercase;font-size:10px;letter-spacing:.08em;color:#555;margin:14px 0 4px}
  .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:bold}
  .flag-danger{background:#fee2e2;color:#991b1b}
  .flag-warn{background:#fef3c7;color:#92400e}
  .sig-box{margin-top:32px;display:flex;gap:40px}
  .sig-item{flex:1;border-top:1px solid #555;padding-top:6px;font-size:11px;color:#333}
  @media print{body{margin:0}button{display:none}}
</style></head><body>
<h1>Relatório Diário de Obra</h1>
<div class="sub">${escapePrintHtml(rdo.numero)} · ${escapePrintHtml(dataFormatada)} · ${escapePrintHtml(rdo.site?.nome ?? "")}</div>
<table><tr><th>Responsável</th><td>${escapePrintHtml(rdo.responsavel?.nome ?? "—")}</td>
<th>Status</th><td><span class="badge">${escapePrintHtml(RDO_STATUS_LABEL[rdo.status] ?? rdo.status)}</span></td></tr>
<tr><th>Clima manhã</th><td>${escapePrintHtml(rdo.clima_manha ? (CLIMA_LABEL[rdo.clima_manha] ?? rdo.clima_manha) : "—")}</td>
<th>Clima tarde</th><td>${escapePrintHtml(rdo.clima_tarde ? (CLIMA_LABEL[rdo.clima_tarde] ?? rdo.clima_tarde) : "—")}</td></tr>
${rdo.temperatura_min != null ? `<tr><th>Temp. mín</th><td>${escapePrintHtml(rdo.temperatura_min)}°C</td><th>Temp. máx</th><td>${escapePrintHtml(rdo.temperatura_max ?? "?")}°C</td></tr>` : ""}
${rdo.condicao_terreno ? `<tr><th>Terreno</th><td colspan="3">${escapePrintHtml(rdo.condicao_terreno)}</td></tr>` : ""}
<tr><th>Trabalhadores</th><td>${totalTrab}</td>
<th>Equipamentos</th><td>${(rdo.equipamentos ?? []).length}</td></tr>
</table>
${rdo.houve_acidente ? '<div class="badge flag-danger" style="margin-bottom:6px">⚠️ Houve acidente</div>' : ""}
${rdo.houve_paralisacao ? `<div class="badge flag-warn" style="margin-bottom:6px">⏸️ Paralisação: ${escapePrintHtml(rdo.motivo_paralisacao ?? "")}</div>` : ""}
${rows ? `<div class="section">Mão de Obra</div><table><tr><th>Função</th><th>Qtd</th><th>Turno</th><th>Horas</th></tr>${rows}</table>` : ""}
${servicos ? `<div class="section">Serviços Executados</div><table><tr><th>Descrição</th><th>% Concluído</th></tr>${servicos}</table>` : ""}
${ocorrencias ? `<div class="section">Ocorrências</div><table><tr><th>Tipo</th><th>Descrição</th><th>Hora</th></tr>${ocorrencias}</table>` : ""}
${rdo.observacoes ? `<div class="section">Observações</div><p>${escapePrintHtmlWithBreaks(rdo.observacoes)}</p>` : ""}
${rdo.programa_servicos_amanha ? `<div class="section">Programa para amanhã</div><p>${escapePrintHtmlWithBreaks(rdo.programa_servicos_amanha)}</p>` : ""}
<div class="sig-box">
  <div class="sig-item">${sigResp ? `Responsável: ${escapePrintHtml(sigResp.nome)}<br/>CPF: ${escapePrintHtml(sigResp.cpf)}<br/>Assinado em: ${escapePrintHtml(new Date(sigResp.signed_at).toLocaleString("pt-BR"))}` : "Responsável pela Obra"}</div>
  <div class="sig-item">${sigEng ? `Engenheiro: ${escapePrintHtml(sigEng.nome)}<br/>CPF: ${escapePrintHtml(sigEng.cpf)}<br/>Assinado em: ${escapePrintHtml(new Date(sigEng.signed_at).toLocaleString("pt-BR"))}` : "Engenheiro Responsável"}</div>
</div>
</body></html>`);
      win.document.close();
      win.focus();
      win.print();
    };

    void (async () => {
      try {
        const shouldUseGovernedPdf =
          Boolean(rdo.pdf_file_key) || rdo.status === "aprovado";

        if (shouldUseGovernedPdf) {
          const access = await ensureGovernedPdf(rdo);
          if (access?.url) {
            openPdfForPrint(access.url, () => {
              toast.info(
                "Pop-up bloqueado. Abrimos o PDF final do RDO na mesma aba para impressão.",
              );
            });
            return;
          }

          if (access) {
            toast.warning(
              "O PDF final do RDO foi emitido, mas a URL segura não está disponível agora.",
            );
            return;
          }
        }

        printPreview();
      } catch (error) {
        console.error("Erro ao imprimir RDO:", error);
        toast.error("Não foi possível preparar a impressão do RDO.");
      }
    })();
  };

  const handleOpenGovernedPdf = useCallback(
    async (rdo: Rdo) => {
      try {
        toast.info("Preparando PDF final governado...");
        const access = await ensureGovernedPdf(rdo);
        if (!access) {
          toast.error(
            "O RDO precisa estar aprovado e assinado pelo responsável e engenheiro antes da emissão final.",
          );
          return;
        }

        if (!access.url) {
          toast.success(
            "PDF final emitido, mas a URL segura não está disponível no momento.",
          );
          return;
        }

        openUrlInNewTab(access.url);
      } catch (error) {
        console.error("Erro ao emitir/abrir PDF final do RDO:", error);
        toast.error("Não foi possível emitir ou abrir o PDF final do RDO.");
      }
    },
    [ensureGovernedPdf],
  );

  const handleSign = async () => {
    if (!signModal) return;
    if (!signForm.nome || !signForm.cpf) {
      toast.error("Preencha nome e CPF.");
      return;
    }
    setSigning(true);
    try {
      const hash = btoa(`${signForm.nome}:${signForm.cpf}:${Date.now()}`);
      const updated = await rdosService.sign(signModal.rdo.id, {
        tipo: signModal.tipo,
        nome: signForm.nome,
        cpf: signForm.cpf,
        hash,
        timestamp: new Date().toISOString(),
      });
      setRdos((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      if (viewRdo?.id === updated.id) setViewRdo(updated);
      toast.success("RDO assinado com sucesso!");
      setSignModal(null);
      setSignForm({ nome: "", cpf: "", tipo: "responsavel" });
    } catch {
      toast.error("Erro ao assinar RDO.");
    } finally {
      setSigning(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailModal) return;
    const emails = emailTo
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      toast.error("Informe pelo menos um e-mail.");
      return;
    }
    setSendingEmail(true);
    try {
      await rdosService.sendEmail(emailModal.id, emails);
      toast.success(`RDO enviado para ${emails.length} destinatário(s).`);
      setEmailModal(null);
      setEmailTo("");
    } catch {
      toast.error("Erro ao enviar e-mail.");
    } finally {
      setSendingEmail(false);
    }
  };

  const filteredRdos = deferredSearch
    ? rdos.filter(
        (r) =>
          r.numero.toLowerCase().includes(deferredSearch.toLowerCase()) ||
          r.site?.nome?.toLowerCase().includes(deferredSearch.toLowerCase()),
      )
    : rdos;

  const totalTrabalhadores = (rdo: Rdo) =>
    (rdo.mao_de_obra ?? []).reduce((sum, m) => sum + (m.quantidade ?? 0), 0);

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando RDOs"
        description="Buscando relatórios, filtros, obras e responsáveis."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar RDOs"
        description={loadError}
        action={
          <Button type="button" onClick={loadData}>
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
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl">
                Relatórios Diários de Obras
              </CardTitle>
              <CardDescription>
                Controle produção diária, clima, mão de obra, ocorrências e
                status do canteiro.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              leftIcon={<FileSpreadsheet className="h-4 w-4" />}
              onClick={() => downloadExcel("/rdos/export/excel", "rdos.xlsx")}
            >
              Exportar Excel
            </Button>
            <Button
              type="button"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={handleOpenCreate}
            >
              Novo RDO
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Total de RDOs</CardDescription>
            <CardTitle className="text-3xl">{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Rascunhos</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-text-secondary)]">
              {summary.rascunho}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Enviados</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-action-primary)]">
              {summary.enviado}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Aprovados</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-success)]">
              {summary.aprovado}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {summary.rascunho > 0 ? (
        <Card
          tone="muted"
          padding="md"
          className="border-[color:var(--ds-color-warning)]/25 bg-[color:var(--ds-color-warning)]/10"
        >
          <CardHeader className="gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--ds-color-warning)]" />
              <CardTitle className="text-base">
                Há RDOs pendentes de envio
              </CardTitle>
            </div>
            <CardDescription>
              {summary.rascunho} relatório(s) ainda estão em rascunho. Feche o
              ciclo diário e encaminhe para aprovação.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card tone="default" padding="none">
        <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4">
          <div className="space-y-1">
            <CardTitle>Base de RDOs</CardTitle>
            <CardDescription>
              {total} registro(s) no recorte atual com filtros por status, obra
              e período.
            </CardDescription>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
              <input
                type="text"
                placeholder="Buscar número ou obra..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(inputClassName, "w-full pl-9")}
              />
            </div>
            <select
              aria-label="Filtrar por status"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
              className={cn(inputClassName, "w-full")}
            >
              <option value="">Todos os status</option>
              <option value="rascunho">Rascunho</option>
              <option value="enviado">Enviado</option>
              <option value="aprovado">Aprovado</option>
            </select>
            <select
              aria-label="Filtrar por obra"
              value={filterSiteId}
              onChange={(e) => {
                setFilterSiteId(e.target.value);
                setPage(1);
              }}
              className={cn(inputClassName, "w-full")}
            >
              <option value="">Todas as obras</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={filterDataInicio}
              onChange={(e) => {
                setFilterDataInicio(e.target.value);
                setPage(1);
              }}
              className={cn(inputClassName, "w-full")}
              title="Data início"
            />
            <input
              type="date"
              value={filterDataFim}
              onChange={(e) => {
                setFilterDataFim(e.target.value);
                setPage(1);
              }}
              className={cn(inputClassName, "w-full")}
              title="Data fim"
            />
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {filteredRdos.length === 0 ? (
            <EmptyState
              title="Nenhum RDO encontrado"
              description={
                deferredSearch
                  ? "Nenhum resultado corresponde ao filtro aplicado."
                  : "Ainda não existem RDOs registrados para este tenant."
              }
              action={
                !deferredSearch ? (
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className={cn(buttonVariants(), "inline-flex items-center")}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Novo RDO
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Obra/Setor</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Trabalhadores</TableHead>
                    <TableHead>Acidente</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRdos.map((rdo) => {
                    const statusTransitions = getAllowedStatusTransitions(rdo);
                    return (
                    <TableRow key={rdo.id}>
                      <TableCell className="font-mono text-sm font-medium text-[var(--ds-color-action-primary)]">
                        {rdo.numero}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(rdo.data).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {rdo.site?.nome ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {rdo.responsavel?.nome ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${RDO_STATUS_COLORS[rdo.status] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {RDO_STATUS_LABEL[rdo.status] ?? rdo.status}
                          </span>
                          {statusTransitions.length > 0 && (
                            <select
                              aria-label="Mover status do RDO"
                              value=""
                              onChange={(e) => {
                                if (e.target.value)
                                  handleStatusChange(rdo.id, e.target.value);
                              }}
                              className="rounded border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-1 py-0.5 text-xs text-[var(--ds-color-text-secondary)]"
                            >
                              <option value="">Mover para...</option>
                              {statusTransitions.map((s) => (
                                <option key={s} value={s}>
                                  {RDO_STATUS_LABEL[s]}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {totalTrabalhadores(rdo) > 0 ? (
                          <span className="font-medium">
                            {totalTrabalhadores(rdo)}
                          </span>
                        ) : (
                          <span className="text-[var(--ds-color-text-muted)]">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {rdo.houve_acidente ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ds-color-danger)]/10 px-2 py-0.5 text-xs font-medium text-[var(--ds-color-danger)]">
                            <AlertTriangle className="h-3 w-3" /> Sim
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--ds-color-text-muted)]">
                            Não
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewRdo(rdo)}
                            className="rounded-lg p-1.5 text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-action-primary)]/10 hover:text-[var(--ds-color-action-primary)]"
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(rdo)}
                            className={cn(
                              "rounded-lg p-1.5 text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-action-primary)]/10 hover:text-[var(--ds-color-action-primary)]",
                              rdo.pdf_file_key && "opacity-40",
                            )}
                            title={
                              rdo.pdf_file_key
                                ? "RDO com PDF final: edição bloqueada"
                                : "Editar"
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(rdo.id)}
                            className="rounded-lg p-1.5 text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <PaginationControls
                page={page}
                lastPage={lastPage}
                total={total}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
              />
            </>
          )}
        </CardContent>
      </Card>

      <StoredFilesPanel
        title="Storage semanal de RDO"
        description="Acompanhe os PDFs finais governados dos RDOs emitidos por semana e baixe o pacote consolidado quando precisar."
        listStoredFiles={rdosService.listFiles}
        getPdfAccess={rdosService.getPdfAccess}
        downloadWeeklyBundle={rdosService.downloadWeeklyBundle}
      />

      {/* ── Modal de criação/edição ────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-lg)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--ds-color-border-subtle)] px-6 py-4">
              <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">
                {editingId ? "Editar RDO" : "Novo Relatório Diário de Obra"}
              </h2>
              <button
                type="button"
                aria-label="Fechar modal"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-surface-muted)] hover:text-[var(--ds-color-text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Steps indicator */}
            <div className="border-b border-[var(--ds-color-border-subtle)] px-6 py-3">
              <div className="flex items-center gap-1">
                {STEPS.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(idx)}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        idx === currentStep
                          ? "bg-[var(--ds-color-action-primary)] text-white"
                          : idx < currentStep
                            ? "bg-[color:var(--ds-color-action-primary)]/15 text-[var(--ds-color-action-primary)]"
                            : "bg-[color:var(--ds-color-surface-muted)] text-[var(--ds-color-text-muted)]"
                      }`}
                      title={step.label}
                    >
                      {idx + 1}
                    </button>
                    {idx < STEPS.length - 1 && (
                      <div
                        className={`h-0.5 w-4 transition-colors ${
                          idx < currentStep
                            ? "bg-[var(--ds-color-action-primary)]"
                            : "bg-[var(--ds-color-border-subtle)]"
                        }`}
                      />
                    )}
                  </div>
                ))}
                <span className="ml-3 text-xs text-[var(--ds-color-text-muted)]">
                  {STEPS[currentStep].label}
                </span>
              </div>
            </div>

            {/* Conteúdo do step */}
            <div className="max-h-[55vh] overflow-y-auto px-6 py-5 space-y-4">
              {/* Step 0: Dados Básicos */}
              {currentStep === 0 && (
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="rdo-data"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                    >
                      Data *
                    </label>
                    <input
                      id="rdo-data"
                      type="date"
                      value={form.data}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, data: e.target.value }))
                      }
                      className={formInputClassName}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="rdo-site-id"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                    >
                      Obra/Setor
                    </label>
                    <select
                      id="rdo-site-id"
                      value={form.site_id}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, site_id: e.target.value }))
                      }
                      className={formInputClassName}
                    >
                      <option value="">Selecionar obra...</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="rdo-responsavel-id"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                    >
                      Responsável
                    </label>
                    <select
                      id="rdo-responsavel-id"
                      value={form.responsavel_id}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          responsavel_id: e.target.value,
                        }))
                      }
                      className={formInputClassName}
                    >
                      <option value="">Selecionar responsável...</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Step 1: Clima */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="rdo-clima-manha"
                        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                      >
                        Clima manhã
                      </label>
                      <select
                        id="rdo-clima-manha"
                        value={form.clima_manha}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            clima_manha: e.target.value,
                          }))
                        }
                        className={formInputClassName}
                      >
                        <option value="">Selecionar...</option>
                        {CLIMA_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="rdo-clima-tarde"
                        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                      >
                        Clima tarde
                      </label>
                      <select
                        id="rdo-clima-tarde"
                        value={form.clima_tarde}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            clima_tarde: e.target.value,
                          }))
                        }
                        className={formInputClassName}
                      >
                        <option value="">Selecionar...</option>
                        {CLIMA_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="rdo-temperatura-min"
                        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                      >
                        Temp. mín (°C)
                      </label>
                      <input
                        id="rdo-temperatura-min"
                        type="number"
                        value={form.temperatura_min}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            temperatura_min: e.target.value,
                          }))
                        }
                        className={formInputClassName}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="rdo-temperatura-max"
                        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                      >
                        Temp. máx (°C)
                      </label>
                      <input
                        id="rdo-temperatura-max"
                        type="number"
                        value={form.temperatura_max}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            temperatura_max: e.target.value,
                          }))
                        }
                        className={formInputClassName}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="rdo-condicao-terreno"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                    >
                      Condição do terreno
                    </label>
                    <input
                      id="rdo-condicao-terreno"
                      type="text"
                      value={form.condicao_terreno}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          condicao_terreno: e.target.value,
                        }))
                      }
                      placeholder="Ex: seco, molhado, enlameado..."
                      className={formInputClassName}
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Mão de Obra */}
              {currentStep === 2 && (
                <div className="space-y-3">
                  {form.mao_de_obra.map((item, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-4 items-end gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 p-3"
                    >
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                          Função
                        </label>
                        <input
                          type="text"
                          value={item.funcao}
                          onChange={(e) =>
                            updateMaoDeObra(i, "funcao", e.target.value)
                          }
                          className={formInputSmClassName}
                          placeholder="Ex: Pedreiro"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                          Qtd
                        </label>
                        <input
                          type="number"
                          aria-label="Quantidade de trabalhadores"
                          value={item.quantidade}
                          min={1}
                          onChange={(e) =>
                            updateMaoDeObra(
                              i,
                              "quantidade",
                              Number(e.target.value),
                            )
                          }
                          className={formInputSmClassName}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                          Turno
                        </label>
                        <select
                          aria-label="Turno de trabalho"
                          value={item.turno}
                          onChange={(e) =>
                            updateMaoDeObra(i, "turno", e.target.value)
                          }
                          className={formInputSmClassName}
                        >
                          {TURNO_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end gap-1">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                            Horas
                          </label>
                          <input
                            type="number"
                            aria-label="Horas trabalhadas"
                            value={item.horas}
                            min={0}
                            max={24}
                            onChange={(e) =>
                              updateMaoDeObra(
                                i,
                                "horas",
                                Number(e.target.value),
                              )
                            }
                            className={formInputSmClassName}
                          />
                        </div>
                        <button
                          type="button"
                          title="Remover"
                          onClick={() => removeMaoDeObra(i)}
                          className="mb-0.5 rounded p-1 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addMaoDeObra}
                    className="flex items-center gap-1 text-sm text-[var(--ds-color-action-primary)] hover:underline"
                  >
                    <Plus className="h-4 w-4" /> Adicionar função
                  </button>
                </div>
              )}

              {/* Step 3: Equipamentos */}
              {currentStep === 3 && (
                <div className="space-y-3">
                  {form.equipamentos.map((item, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-4 items-end gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 p-3"
                    >
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                          Equipamento
                        </label>
                        <input
                          type="text"
                          value={item.nome}
                          onChange={(e) =>
                            updateEquipamento(i, "nome", e.target.value)
                          }
                          className={formInputSmClassName}
                          placeholder="Ex: Betoneira"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                          Qtd
                        </label>
                        <input
                          type="number"
                          aria-label="Quantidade de equipamentos"
                          value={item.quantidade}
                          min={1}
                          onChange={(e) =>
                            updateEquipamento(
                              i,
                              "quantidade",
                              Number(e.target.value),
                            )
                          }
                          className={formInputSmClassName}
                        />
                      </div>
                      <div className="flex items-end gap-1">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                            H. trabalhadas
                          </label>
                          <input
                            type="number"
                            aria-label="Horas trabalhadas pelo equipamento"
                            value={item.horas_trabalhadas}
                            min={0}
                            onChange={(e) =>
                              updateEquipamento(
                                i,
                                "horas_trabalhadas",
                                Number(e.target.value),
                              )
                            }
                            className={formInputSmClassName}
                          />
                        </div>
                        <button
                          type="button"
                          title="Remover"
                          onClick={() => removeEquipamento(i)}
                          className="mb-0.5 rounded p-1 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addEquipamento}
                    className="flex items-center gap-1 text-sm text-[var(--ds-color-action-primary)] hover:underline"
                  >
                    <Plus className="h-4 w-4" /> Adicionar equipamento
                  </button>
                </div>
              )}

              {/* Step 4: Materiais */}
              {currentStep === 4 && (
                <div className="space-y-3">
                  {form.materiais_recebidos.map((item, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-4 items-end gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 p-3"
                    >
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                          Descrição
                        </label>
                        <input
                          type="text"
                          value={item.descricao}
                          onChange={(e) =>
                            updateMaterial(i, "descricao", e.target.value)
                          }
                          className={formInputSmClassName}
                          placeholder="Ex: Cimento CP-II"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                          Unidade
                        </label>
                        <input
                          type="text"
                          value={item.unidade}
                          onChange={(e) =>
                            updateMaterial(i, "unidade", e.target.value)
                          }
                          className={formInputSmClassName}
                          placeholder="sc, m³, kg"
                        />
                      </div>
                      <div className="flex items-end gap-1">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                            Quantidade
                          </label>
                          <input
                            type="number"
                            aria-label="Quantidade do material"
                            value={item.quantidade}
                            min={0}
                            onChange={(e) =>
                              updateMaterial(
                                i,
                                "quantidade",
                                Number(e.target.value),
                              )
                            }
                            className={formInputSmClassName}
                          />
                        </div>
                        <button
                          type="button"
                          title="Remover"
                          onClick={() => removeMaterial(i)}
                          className="mb-0.5 rounded p-1 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addMaterial}
                    className="flex items-center gap-1 text-sm text-[var(--ds-color-action-primary)] hover:underline"
                  >
                    <Plus className="h-4 w-4" /> Adicionar material
                  </button>
                </div>
              )}

              {/* Step 5: Serviços Executados */}
              {currentStep === 5 && (
                <div className="space-y-3">
                  {form.servicos_executados.map((item, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-5 items-end gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 p-3"
                    >
                      <div className="col-span-3">
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                          Descrição do serviço
                        </label>
                        <input
                          type="text"
                          value={item.descricao}
                          onChange={(e) =>
                            updateServico(i, "descricao", e.target.value)
                          }
                          className={formInputSmClassName}
                          placeholder="Ex: Concretagem de laje"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                          % Concluído
                        </label>
                        <input
                          type="number"
                          aria-label="Percentual concluído"
                          value={item.percentual_concluido}
                          min={0}
                          max={100}
                          onChange={(e) =>
                            updateServico(
                              i,
                              "percentual_concluido",
                              Number(e.target.value),
                            )
                          }
                          className={formInputSmClassName}
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          title="Remover"
                          onClick={() => removeServico(i)}
                          className="mb-0.5 rounded p-1 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addServico}
                    className="flex items-center gap-1 text-sm text-[var(--ds-color-action-primary)] hover:underline"
                  >
                    <Plus className="h-4 w-4" /> Adicionar serviço
                  </button>
                </div>
              )}

              {/* Step 6: Ocorrências + Observações */}
              {currentStep === 6 && (
                <div className="space-y-4">
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.houve_acidente}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            houve_acidente: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded accent-[var(--ds-color-danger)]"
                      />
                      <span className="font-medium text-[var(--ds-color-danger)]">
                        Houve acidente
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.houve_paralisacao}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            houve_paralisacao: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded accent-[var(--ds-color-action-primary)]"
                      />
                      <span className="font-medium text-[var(--ds-color-action-primary)]">
                        Houve paralisação
                      </span>
                    </label>
                  </div>
                  {form.houve_paralisacao && (
                    <div>
                      <label
                        htmlFor="rdo-motivo-paralisacao"
                        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                      >
                        Motivo da paralisação
                      </label>
                      <input
                        id="rdo-motivo-paralisacao"
                        type="text"
                        value={form.motivo_paralisacao}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            motivo_paralisacao: e.target.value,
                          }))
                        }
                        className={formInputClassName}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                      Ocorrências
                    </p>
                    {form.ocorrencias.map((item, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-4 items-end gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 p-3"
                      >
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                            Tipo
                          </label>
                          <select
                            aria-label="Tipo de ocorrência"
                            value={item.tipo}
                            onChange={(e) =>
                              updateOcorrencia(i, "tipo", e.target.value)
                            }
                            className={formInputSmClassName}
                          >
                            {OCORRENCIA_TIPO_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                            Descrição
                          </label>
                          <input
                            type="text"
                            aria-label="Descrição da ocorrência"
                            placeholder="Descreva a ocorrência..."
                            value={item.descricao}
                            onChange={(e) =>
                              updateOcorrencia(i, "descricao", e.target.value)
                            }
                            className={formInputSmClassName}
                          />
                        </div>
                        <div className="flex items-end gap-1">
                          <div className="flex-1">
                            <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">
                              Hora
                            </label>
                            <input
                              type="time"
                              aria-label="Hora da ocorrência"
                              value={item.hora ?? ""}
                              onChange={(e) =>
                                updateOcorrencia(i, "hora", e.target.value)
                              }
                              className={formInputSmClassName}
                            />
                          </div>
                          <button
                            type="button"
                            title="Remover"
                            onClick={() => removeOcorrencia(i)}
                            className="mb-0.5 rounded p-1 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addOcorrencia}
                      className="flex items-center gap-1 text-sm text-[var(--ds-color-action-primary)] hover:underline"
                    >
                      <Plus className="h-4 w-4" /> Adicionar ocorrência
                    </button>
                  </div>
                  <div>
                    <label
                      htmlFor="rdo-observacoes"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                    >
                      Observações gerais
                    </label>
                    <textarea
                      id="rdo-observacoes"
                      value={form.observacoes}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, observacoes: e.target.value }))
                      }
                      rows={5}
                      className={formInputClassName}
                      placeholder="Observações relevantes do dia..."
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="rdo-programa-amanha"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                    >
                      Programa para amanhã
                    </label>
                    <textarea
                      id="rdo-programa-amanha"
                      value={form.programa_servicos_amanha}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          programa_servicos_amanha: e.target.value,
                        }))
                      }
                      rows={4}
                      className={formInputClassName}
                      placeholder="Serviços planejados para o próximo dia..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[var(--ds-color-border-subtle)] px-6 py-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-[var(--ds-color-border-subtle)] px-4 py-2 text-sm text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)] hover:text-[var(--ds-color-text-primary)] transition-colors"
              >
                Cancelar
              </button>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {currentStep > 0 && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep((s) => s - 1)}
                    className="flex items-center gap-1 rounded-xl border border-[var(--ds-color-border-subtle)] px-3 py-2 text-sm text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)] transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </button>
                )}
                {currentStep < STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentStep((s) => s + 1)}
                    className="flex items-center gap-1 rounded-xl bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] transition-colors"
                  >
                    Próximo <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSave({ printAfterSave: true })}
                      disabled={saving}
                      className="rounded-xl border border-[var(--ds-color-border-subtle)] px-5 py-2 text-sm font-medium text-[var(--ds-color-text-primary)] hover:bg-[color:var(--ds-color-surface-muted)] disabled:opacity-50 transition-colors"
                    >
                      {saving
                        ? "Salvando..."
                        : editingId
                          ? "Salvar e imprimir"
                          : "Criar e imprimir"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSave()}
                      disabled={saving}
                      className="rounded-xl bg-[var(--ds-color-action-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-50 transition-colors"
                    >
                      {saving
                        ? "Salvando..."
                        : editingId
                          ? "Salvar alterações"
                          : "Criar RDO"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de visualização ────────────────────────────────── */}
      {viewRdo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-lg)] flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--ds-color-border-subtle)] px-6 py-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold text-[var(--ds-color-action-primary)]">
                  {viewRdo.numero}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${RDO_STATUS_COLORS[viewRdo.status] ?? ""}`}
                >
                  {RDO_STATUS_LABEL[viewRdo.status] ?? viewRdo.status}
                </span>
                {getAllowedStatusTransitions(viewRdo).length > 0 && (
                  <select
                    aria-label="Mover status do RDO"
                    value=""
                    onChange={(e) => {
                      if (e.target.value)
                        handleStatusChange(viewRdo.id, e.target.value);
                    }}
                    className="rounded border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-1 py-0.5 text-xs text-[var(--ds-color-text-secondary)]"
                  >
                    <option value="">Mover para...</option>
                    {getAllowedStatusTransitions(viewRdo).map((s) => (
                      <option key={s} value={s}>
                        {RDO_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setViewRdo(null);
                    handleOpenEdit(viewRdo);
                  }}
                  className="flex items-center gap-1 rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)] transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  type="button"
                  aria-label="Fechar visualização"
                  onClick={() => setViewRdo(null)}
                  className="rounded-lg p-1.5 text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-surface-muted)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-5">
              {/* Info básica */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  {
                    label: "Data",
                    value: new Date(viewRdo.data).toLocaleDateString("pt-BR"),
                  },
                  { label: "Obra/Setor", value: viewRdo.site?.nome ?? "—" },
                  {
                    label: "Responsável",
                    value: viewRdo.responsavel?.nome ?? "—",
                  },
                  {
                    label: "Trabalhadores",
                    value: String(totalTrabalhadores(viewRdo)),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 px-4 py-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-[var(--ds-color-text-primary)]">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Flags */}
              {(viewRdo.houve_acidente || viewRdo.houve_paralisacao) && (
                <div className="flex gap-3">
                  {viewRdo.houve_acidente && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--ds-color-danger)]/10 px-3 py-1 text-xs font-medium text-[var(--ds-color-danger)]">
                      <AlertTriangle className="h-3.5 w-3.5" /> Houve acidente
                    </span>
                  )}
                  {viewRdo.houve_paralisacao && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--ds-color-warning)]/10 px-3 py-1 text-xs font-medium text-[var(--ds-color-warning)]">
                      <AlertTriangle className="h-3.5 w-3.5" /> Houve
                      paralisação
                      {viewRdo.motivo_paralisacao
                        ? `: ${viewRdo.motivo_paralisacao}`
                        : ""}
                    </span>
                  )}
                </div>
              )}

              {/* Clima */}
              {(viewRdo.clima_manha ||
                viewRdo.clima_tarde ||
                viewRdo.temperatura_min != null) && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    <Sun className="h-3.5 w-3.5" /> Condições Climáticas
                  </p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {viewRdo.clima_manha && (
                      <div className="rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-2">
                        <p className="text-xs text-[var(--ds-color-text-muted)]">
                          Manhã
                        </p>
                        <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">
                          {CLIMA_LABEL[viewRdo.clima_manha] ??
                            viewRdo.clima_manha}
                        </p>
                      </div>
                    )}
                    {viewRdo.clima_tarde && (
                      <div className="rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-2">
                        <p className="text-xs text-[var(--ds-color-text-muted)]">
                          Tarde
                        </p>
                        <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">
                          {CLIMA_LABEL[viewRdo.clima_tarde] ??
                            viewRdo.clima_tarde}
                        </p>
                      </div>
                    )}
                    {(viewRdo.temperatura_min != null ||
                      viewRdo.temperatura_max != null) && (
                      <div className="rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-2 flex items-center gap-1">
                        <Thermometer className="h-3.5 w-3.5 text-[var(--ds-color-text-muted)]" />
                        <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">
                          {viewRdo.temperatura_min ?? "?"}°C –{" "}
                          {viewRdo.temperatura_max ?? "?"}°C
                        </p>
                      </div>
                    )}
                    {viewRdo.condicao_terreno && (
                      <div className="rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-2">
                        <p className="text-xs text-[var(--ds-color-text-muted)]">
                          Terreno
                        </p>
                        <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">
                          {viewRdo.condicao_terreno}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mão de obra */}
              {(viewRdo.mao_de_obra ?? []).length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    <Users className="h-3.5 w-3.5" /> Mão de Obra (
                    {viewRdo.mao_de_obra!.reduce((s, m) => s + m.quantidade, 0)}{" "}
                    trabalhadores)
                  </p>
                  <div className="rounded-xl border border-[var(--ds-color-border-subtle)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/40">
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                            Função
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                            Qtd
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                            Turno
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                            Horas
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewRdo.mao_de_obra!.map((m, i) => (
                          <tr
                            key={i}
                            className="border-b border-[var(--ds-color-border-subtle)] last:border-0"
                          >
                            <td className="px-3 py-2 text-[var(--ds-color-text-primary)]">
                              {m.funcao}
                            </td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">
                              {m.quantidade}
                            </td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)] capitalize">
                              {m.turno}
                            </td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">
                              {m.horas}h
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Equipamentos */}
              {(viewRdo.equipamentos ?? []).length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    <Wrench className="h-3.5 w-3.5" /> Equipamentos
                  </p>
                  <div className="rounded-xl border border-[var(--ds-color-border-subtle)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/40">
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                            Equipamento
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                            Qtd
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                            H. trabalhadas
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                            H. ociosas
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewRdo.equipamentos!.map((e, i) => (
                          <tr
                            key={i}
                            className="border-b border-[var(--ds-color-border-subtle)] last:border-0"
                          >
                            <td className="px-3 py-2 text-[var(--ds-color-text-primary)]">
                              {e.nome}
                            </td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">
                              {e.quantidade}
                            </td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">
                              {e.horas_trabalhadas}h
                            </td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">
                              {e.horas_ociosas}h
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Materiais */}
              {(viewRdo.materiais_recebidos ?? []).length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    <Package className="h-3.5 w-3.5" /> Materiais Recebidos
                  </p>
                  <div className="rounded-xl border border-[var(--ds-color-border-subtle)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/40">
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                            Descrição
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                            Qtd
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                            Unidade
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewRdo.materiais_recebidos!.map((m, i) => (
                          <tr
                            key={i}
                            className="border-b border-[var(--ds-color-border-subtle)] last:border-0"
                          >
                            <td className="px-3 py-2 text-[var(--ds-color-text-primary)]">
                              {m.descricao}
                            </td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">
                              {m.quantidade}
                            </td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">
                              {m.unidade}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Serviços */}
              {(viewRdo.servicos_executados ?? []).length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    <CheckSquare className="h-3.5 w-3.5" /> Serviços Executados
                  </p>
                  <div className="space-y-2">
                    {viewRdo.servicos_executados!.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-2"
                      >
                        <span className="flex-1 text-sm text-[var(--ds-color-text-primary)]">
                          {s.descricao}
                        </span>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--ds-color-border-subtle)]"
                            title={`${s.percentual_concluido}% concluído`}
                            aria-hidden="true"
                          >
                            <div
                              className="h-full rounded-full bg-[var(--ds-color-success)] transition-all"
                              style={{ width: `${s.percentual_concluido}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs font-medium text-[var(--ds-color-text-secondary)]">
                            {s.percentual_concluido}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ocorrências */}
              {(viewRdo.ocorrencias ?? []).length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    <AlertTriangle className="h-3.5 w-3.5" /> Ocorrências
                  </p>
                  <div className="space-y-2">
                    {viewRdo.ocorrencias!.map((o, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-2"
                      >
                        <span className="rounded-full bg-[color:var(--ds-color-warning)]/10 px-2 py-0.5 text-xs font-medium text-[var(--ds-color-warning)]">
                          {OCORRENCIA_TIPO_LABEL[o.tipo] ?? o.tipo}
                        </span>
                        <span className="flex-1 text-sm text-[var(--ds-color-text-primary)]">
                          {o.descricao}
                        </span>
                        {o.hora && (
                          <span className="text-xs text-[var(--ds-color-text-muted)]">
                            {o.hora}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Observações */}
              {viewRdo.observacoes && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    Observações gerais
                  </p>
                  <p className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 px-4 py-3 text-sm text-[var(--ds-color-text-primary)] whitespace-pre-wrap">
                    {viewRdo.observacoes}
                  </p>
                </div>
              )}

              {/* Programa amanhã */}
              {viewRdo.programa_servicos_amanha && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    Programa para amanhã
                  </p>
                  <p className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 px-4 py-3 text-sm text-[var(--ds-color-text-primary)] whitespace-pre-wrap">
                    {viewRdo.programa_servicos_amanha}
                  </p>
                </div>
              )}

              {/* Assinaturas */}
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                  <PenLine className="h-3.5 w-3.5" /> Assinaturas
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {(() => {
                    const sig = viewRdo.assinatura_responsavel
                      ? (() => {
                          try {
                            return JSON.parse(viewRdo.assinatura_responsavel!);
                          } catch {
                            return null;
                          }
                        })()
                      : null;
                    return (
                      <div
                        className={`rounded-xl border px-4 py-3 ${sig ? "border-green-200 bg-green-50" : "border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/20"}`}
                      >
                        <p className="text-xs font-semibold text-[var(--ds-color-text-muted)]">
                          Responsável pela Obra
                        </p>
                        {sig ? (
                          <>
                            <p className="mt-1 text-sm font-medium text-green-800">
                              {sig.nome}
                            </p>
                            <p className="text-xs text-green-600">
                              CPF: {sig.cpf}
                            </p>
                            <p className="text-xs text-green-600">
                              {new Date(sig.signed_at).toLocaleString("pt-BR")}
                            </p>
                          </>
                        ) : (
                          <p className="mt-1 text-xs text-[var(--ds-color-text-muted)] italic">
                            Aguardando assinatura
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  {(() => {
                    const sig = viewRdo.assinatura_engenheiro
                      ? (() => {
                          try {
                            return JSON.parse(viewRdo.assinatura_engenheiro!);
                          } catch {
                            return null;
                          }
                        })()
                      : null;
                    return (
                      <div
                        className={`rounded-xl border px-4 py-3 ${sig ? "border-green-200 bg-green-50" : "border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/20"}`}
                      >
                        <p className="text-xs font-semibold text-[var(--ds-color-text-muted)]">
                          Engenheiro Responsável
                        </p>
                        {sig ? (
                          <>
                            <p className="mt-1 text-sm font-medium text-green-800">
                              {sig.nome}
                            </p>
                            <p className="text-xs text-green-600">
                              CPF: {sig.cpf}
                            </p>
                            <p className="text-xs text-green-600">
                              {new Date(sig.signed_at).toLocaleString("pt-BR")}
                            </p>
                          </>
                        ) : (
                          <p className="mt-1 text-xs text-[var(--ds-color-text-muted)] italic">
                            Aguardando assinatura
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ds-color-border-subtle)] px-6 py-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrint(viewRdo)}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--ds-color-border-subtle)] px-3 py-2 text-xs font-medium text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)] transition-colors"
                >
                  <Printer className="h-3.5 w-3.5" /> Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenGovernedPdf(viewRdo)}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--ds-color-border-subtle)] px-3 py-2 text-xs font-medium text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-action-primary)]/10 hover:text-[var(--ds-color-action-primary)] transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />{" "}
                  {viewRdo.pdf_file_key ? "Abrir PDF final" : "Emitir PDF final"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (viewRdo.pdf_file_key) {
                      toast.error(
                        "RDO com PDF final emitido esta bloqueado para novas assinaturas.",
                      );
                      return;
                    }
                    setSignModal({ rdo: viewRdo, tipo: "responsavel" });
                    setSignForm({ nome: "", cpf: "", tipo: "responsavel" });
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--ds-color-border-subtle)] px-3 py-2 text-xs font-medium text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-action-primary)]/10 hover:text-[var(--ds-color-action-primary)] transition-colors"
                >
                  <PenLine className="h-3.5 w-3.5" /> Assinar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmailModal(viewRdo);
                    setEmailTo("");
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--ds-color-border-subtle)] px-3 py-2 text-xs font-medium text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-action-primary)]/10 hover:text-[var(--ds-color-action-primary)] transition-colors"
                >
                  <Mail className="h-3.5 w-3.5" /> Enviar e-mail
                </button>
              </div>
              <button
                type="button"
                onClick={() => setViewRdo(null)}
                className="rounded-xl border border-[var(--ds-color-border-subtle)] px-4 py-2 text-sm text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)] transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de assinatura ───────────────────────────────────── */}
      {signModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-lg)]">
            <div className="flex items-center justify-between border-b border-[var(--ds-color-border-subtle)] px-5 py-4">
              <h2 className="text-base font-semibold text-[var(--ds-color-text-primary)]">
                Assinar RDO
              </h2>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setSignModal(null)}
                className="rounded-lg p-1.5 text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-surface-muted)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                  Tipo de assinatura
                </label>
                <select
                  aria-label="Tipo de assinatura"
                  value={signModal.tipo}
                  onChange={(e) =>
                    setSignModal((prev) =>
                      prev
                        ? {
                            ...prev,
                            tipo: e.target.value as
                              | "responsavel"
                              | "engenheiro",
                          }
                        : prev,
                    )
                  }
                  className={formInputClassName}
                >
                  <option value="responsavel">Responsável pela Obra</option>
                  <option value="engenheiro">Engenheiro Responsável</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="sign-nome"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                >
                  Nome completo
                </label>
                <input
                  id="sign-nome"
                  type="text"
                  value={signForm.nome}
                  onChange={(e) =>
                    setSignForm((f) => ({ ...f, nome: e.target.value }))
                  }
                  className={formInputClassName}
                  placeholder="Nome de quem assina"
                />
              </div>
              <div>
                <label
                  htmlFor="sign-cpf"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
                >
                  CPF
                </label>
                <input
                  id="sign-cpf"
                  type="text"
                  value={signForm.cpf}
                  onChange={(e) =>
                    setSignForm((f) => ({ ...f, cpf: e.target.value }))
                  }
                  className={formInputClassName}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--ds-color-border-subtle)] px-5 py-4">
              <button
                type="button"
                onClick={() => setSignModal(null)}
                className="rounded-xl border border-[var(--ds-color-border-subtle)] px-4 py-2 text-sm text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSign}
                disabled={signing}
                className="flex items-center gap-1.5 rounded-xl bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-50 transition-colors"
              >
                <PenLine className="h-4 w-4" />{" "}
                {signing ? "Assinando..." : "Confirmar assinatura"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de envio de e-mail ──────────────────────────────── */}
      {emailModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-lg)]">
            <div className="flex items-center justify-between border-b border-[var(--ds-color-border-subtle)] px-5 py-4">
              <h2 className="text-base font-semibold text-[var(--ds-color-text-primary)]">
                Enviar RDO por E-mail
              </h2>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setEmailModal(null)}
                className="rounded-lg p-1.5 text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-surface-muted)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-5">
              <p className="mb-3 text-xs text-[var(--ds-color-text-muted)]">
                Enviar <strong>{emailModal.numero}</strong> —{" "}
                {new Date(emailModal.data).toLocaleDateString("pt-BR")}
              </p>
              <label
                htmlFor="email-to"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]"
              >
                Destinatários (separados por vírgula)
              </label>
              <input
                id="email-to"
                type="text"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className={formInputClassName}
                placeholder="email@exemplo.com, outro@exemplo.com"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--ds-color-border-subtle)] px-5 py-4">
              <button
                type="button"
                onClick={() => setEmailModal(null)}
                className="rounded-xl border border-[var(--ds-color-border-subtle)] px-4 py-2 text-sm text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sendingEmail}
                className="flex items-center gap-1.5 rounded-xl bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-50 transition-colors"
              >
                <Send className="h-4 w-4" />{" "}
                {sendingEmail ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
