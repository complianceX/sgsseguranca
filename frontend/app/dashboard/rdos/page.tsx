"use client";

import dynamic from "next/dynamic";
import {
  useState,
  useEffect,
  useCallback,
  useDeferredValue,
  useRef,
} from "react";
import { toast } from "sonner";
import {
  rdosService,
  Rdo,
  MaoDeObraItem,
  EquipamentoItem,
  MaterialItem,
  ServicoItem,
  OcorrenciaItem,
  RDO_ACTIVITY_GOVERNED_PHOTO_REF_PREFIX,
  RDO_STATUS_LABEL,
  RDO_STATUS_COLORS,
  RDO_ALLOWED_TRANSITIONS,
} from "@/services/rdosService";
import { sitesService, Site } from "@/services/sitesService";
import { usersService, User } from "@/services/usersService";
import { downloadExcel } from "@/lib/download-excel";
import {
  Plus,
  Search,
  FileSpreadsheet,
  ClipboardList,
  Trash2,
  AlertTriangle,
  Users,
  Wrench,
  Package,
  CheckSquare,
  CloudRain,
  Eye,
  Pencil,
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
  EmptyState,
  ErrorState,
  PageLoadingState,
} from "@/components/ui/state";
import { InlineCallout } from "@/components/ui/inline-callout";
import { ListPageLayout } from "@/components/layout";
import { cn } from "@/lib/utils";
import { openPdfForPrint } from "@/lib/print-utils";
import { openSafeExternalUrlInNewTab } from "@/lib/security/safe-external-url";
import { useDocumentVideos } from "@/hooks/useDocumentVideos";
import { base64ToPdfBlob, base64ToPdfFile } from "@/lib/pdf/pdfFile";
import { useAuth } from "@/context/AuthContext";
import { isUserVisibleForSite } from "@/lib/site-scoped-user-visibility";
import {
  safeToLocaleDateString,
  toInputDateValue,
} from "@/lib/date/safeFormat";
import { RdoEditorModal } from "@/components/rdos/RdoEditorModal";
import { RdoViewerModal } from "@/components/rdos/RdoViewerModal";
import { RdoActionModals } from "@/components/rdos/RdoActionModals";
import {
  PendingActivityPhoto,
  RdoEquipamentoItem,
  RdoFormState,
  RdoMaoDeObraItem,
  RdoMaterialItem,
  RdoOcorrenciaItem,
  RdoSignModalState,
  RdoServicoItem,
} from "@/components/rdos/rdo-modal-types";
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
const loadRdoPdfGenerator = async () => import("@/lib/pdf/rdoGenerator");

const inputClassName =
  "h-11 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 text-base text-[var(--ds-color-text-primary)] motion-safe:transition-all motion-safe:duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]";

const formInputClassName =
  "w-full min-h-[2.875rem] rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 py-2.5 text-base leading-6 text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)] motion-safe:transition-all";

const formInputSmClassName =
  "w-full min-h-[2.625rem] rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-base text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-focus)] focus:outline-none motion-safe:transition-all";

const STEPS = [
  { label: "Dados Básicos", icon: ClipboardList },
  { label: "Clima", icon: CloudRain },
  { label: "Mão de Obra", icon: Users },
  { label: "Equipamentos", icon: Wrench },
  { label: "Materiais", icon: Package },
  { label: "Serviços", icon: CheckSquare },
  { label: "Ocorrências", icon: AlertTriangle },
];

function isGovernedActivityPhotoReference(value?: string | null) {
  return (
    typeof value === "string" &&
    value.startsWith(RDO_ACTIVITY_GOVERNED_PHOTO_REF_PREFIX)
  );
}

function createRdoRowKey() {
  return crypto.randomUUID();
}

function withRdoRowKey<T extends object>(item: T): T & { __rowKey: string } {
  return {
    ...item,
    __rowKey: createRdoRowKey(),
  };
}

function stripRdoRowKey<T extends { __rowKey: string }>(
  item: T,
): Omit<T, "__rowKey"> {
  const { __rowKey, ...payloadItem } = item;
  void __rowKey;
  return payloadItem;
}

const defaultForm: RdoFormState = {
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

function rdoToForm(rdo: Rdo): RdoFormState {
  return {
    data: toInputDateValue(rdo.data, toInputDateValue(new Date())),
    site_id: rdo.site_id ?? "",
    responsavel_id: rdo.responsavel_id ?? "",
    clima_manha: rdo.clima_manha ?? "",
    clima_tarde: rdo.clima_tarde ?? "",
    temperatura_min:
      rdo.temperatura_min != null ? String(rdo.temperatura_min) : "",
    temperatura_max:
      rdo.temperatura_max != null ? String(rdo.temperatura_max) : "",
    condicao_terreno: rdo.condicao_terreno ?? "",
    mao_de_obra: (rdo.mao_de_obra ?? []).map(withRdoRowKey),
    equipamentos: (rdo.equipamentos ?? []).map(withRdoRowKey),
    materiais_recebidos: (rdo.materiais_recebidos ?? []).map(withRdoRowKey),
    servicos_executados: (rdo.servicos_executados ?? []).map((item) =>
      withRdoRowKey({
        ...item,
        observacao: item.observacao ?? "",
        fotos: item.fotos ?? [],
      }),
    ),
    ocorrencias: (rdo.ocorrencias ?? []).map(withRdoRowKey),
    houve_acidente: rdo.houve_acidente,
    houve_paralisacao: rdo.houve_paralisacao,
    motivo_paralisacao: rdo.motivo_paralisacao ?? "",
    observacoes: rdo.observacoes ?? "",
    programa_servicos_amanha: rdo.programa_servicos_amanha ?? "",
  };
}

export default function RdosPage() {
  const { hasPermission } = useAuth();
  const [rdos, setRdos] = useState<Rdo[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const referenceDataScopeRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState<RdoFormState>(defaultForm);
  const [pendingActivityPhotos, setPendingActivityPhotos] = useState<
    Record<number, PendingActivityPhoto[]>
  >({});
  const [resolvedActivityPhotoUrls, setResolvedActivityPhotoUrls] = useState<
    Record<string, string>
  >({});
  const pendingActivityPhotosRef = useRef<
    Record<number, PendingActivityPhoto[]>
  >({});

  const revokePendingActivityEntries = useCallback(
    (entries?: Record<number, PendingActivityPhoto[]>) => {
      Object.values(entries ?? {}).forEach((photos) => {
        photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      });
    },
    [],
  );

  useEffect(() => {
    pendingActivityPhotosRef.current = pendingActivityPhotos;
  }, [pendingActivityPhotos]);

  useEffect(() => {
    return () => {
      revokePendingActivityEntries(pendingActivityPhotosRef.current);
    };
  }, [revokePendingActivityEntries]);

  const resetPendingActivityPhotos = useCallback(() => {
    revokePendingActivityEntries(pendingActivityPhotosRef.current);
    pendingActivityPhotosRef.current = {};
    setPendingActivityPhotos({});
  }, [revokePendingActivityEntries]);

  const closeEditorModal = useCallback(() => {
    resetPendingActivityPhotos();
    setShowModal(false);
  }, [resetPendingActivityPhotos]);

  // View modal
  const [viewRdo, setViewRdo] = useState<Rdo | null>(null);

  // Sign modal
  const [signModal, setSignModal] = useState<RdoSignModalState>(null);
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

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);
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
    cancelado: 0,
  });
  const canManageRdo = hasPermission("can_manage_rdos");
  const viewRdoLocked =
    Boolean(viewRdo?.pdf_file_key) ||
    viewRdo?.status === "aprovado" ||
    viewRdo?.status === "cancelado";
  const viewRdoLockMessage = viewRdo?.pdf_file_key
    ? "O RDO já possui PDF final emitido."
    : viewRdo?.status === "aprovado"
      ? "O RDO está aprovado."
      : viewRdo?.status === "cancelado"
        ? "O RDO está cancelado."
        : null;
  const viewRdoVideos = useDocumentVideos({
    documentId: viewRdo?.id,
    enabled: Boolean(viewRdo?.id),
    loadVideos: rdosService.listVideoAttachments,
    uploadVideo: rdosService.uploadVideoAttachment,
    removeVideo: rdosService.removeVideoAttachment,
    getVideoAccess: rdosService.getVideoAttachmentAccess,
    labels: {
      loadError: "Não foi possível carregar os vídeos do RDO.",
      uploadSuccess: "Vídeo anexado ao RDO.",
      uploadError: "Não foi possível anexar o vídeo ao RDO.",
      removeSuccess: "Vídeo removido do RDO.",
      removeError: "Não foi possível remover o vídeo do RDO.",
      accessError: "Não foi possível abrir o vídeo do RDO.",
    },
  });

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

  const loadReferenceData = useCallback(async () => {
    const nextScope = canManageRdo ? "manage" : "view";
    if (referenceDataScopeRef.current === nextScope) {
      return;
    }

    try {
      const sitesPromise = sitesService.findAll();
      const usersPromise = canManageRdo
        ? usersService.findAll()
        : Promise.resolve([] as User[]);

      const [sitesResult, usersResult] = await Promise.allSettled([
        sitesPromise,
        usersPromise,
      ]);

      if (sitesResult.status !== "fulfilled") {
        throw new Error("Falha ao carregar as obras do RDO.");
      }
      if (usersResult.status !== "fulfilled") {
        throw new Error("Falha ao carregar os responsáveis do RDO.");
      }

      setSites(sitesResult.value);
      setUsers(usersResult.value);
      referenceDataScopeRef.current = nextScope;
    } catch (error) {
      console.error("Erro ao carregar dados de referência do RDO:", error);
      setLoadError("Não foi possível carregar os dados de apoio do RDO.");
      toast.error("Erro ao carregar dados de apoio do RDO.");
    }
  }, [canManageRdo]);

  const refreshOverview = useCallback(async () => {
    const overviewResult = await rdosService.getAnalyticsOverview();
    setSummary({
      total: overviewResult.totalRdos,
      rascunho: overviewResult.rascunho,
      enviado: overviewResult.enviado,
      aprovado: overviewResult.aprovado,
      cancelado: overviewResult.cancelado,
    });
  }, []);

  const loadRdoPageData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const rdosResult = await rdosService.findPaginated({
        page,
        limit,
        search: deferredSearch || undefined,
        status: filterStatus || undefined,
        site_id: filterSiteId || undefined,
        data_inicio: filterDataInicio || undefined,
        data_fim: filterDataFim || undefined,
      });

      const rdosData = rdosResult;
      setRdos(rdosData.data);
      setTotal(rdosData.total);
      setLastPage(rdosData.lastPage);

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
    deferredSearch,
  ]);

  const refreshRdoDashboard = useCallback(async () => {
    await Promise.all([loadRdoPageData(), refreshOverview()]);
  }, [loadRdoPageData, refreshOverview]);

  useEffect(() => {
    void loadRdoPageData();
  }, [loadRdoPageData]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    void refreshOverview().catch((error) => {
      console.error("Erro ao carregar overview analítico de RDOs:", error);
    });
  }, [refreshOverview]);

  const hydrateActivityPhotoUrls = useCallback(
    async (documentId: string, activities: ServicoItem[]) => {
      const missing = activities.flatMap((activity, activityIndex) =>
        (activity.fotos ?? [])
          .map((photo, photoIndex) => ({ photo, photoIndex, activityIndex }))
          .filter(
            ({ photo }) =>
              isGovernedActivityPhotoReference(photo) &&
              !resolvedActivityPhotoUrls[photo],
          ),
      );

      if (!missing.length) {
        return;
      }

      const resolvedEntries = await Promise.all(
        missing.map(async ({ photo, activityIndex, photoIndex }) => {
          try {
            const access = await rdosService.getActivityPhotoAccess(
              documentId,
              activityIndex,
              photoIndex,
            );
            return access.url ? ([photo, access.url] as const) : null;
          } catch (error) {
            console.error("Erro ao resolver foto da atividade do RDO:", error);
            return null;
          }
        }),
      );

      const nextEntries = Object.fromEntries(
        resolvedEntries.filter((entry): entry is readonly [string, string] =>
          Boolean(entry),
        ),
      );

      if (Object.keys(nextEntries).length) {
        setResolvedActivityPhotoUrls((current) => ({
          ...current,
          ...nextEntries,
        }));
      }
    },
    [resolvedActivityPhotoUrls],
  );

  useEffect(() => {
    if (!showModal || !editingId) {
      return;
    }

    void hydrateActivityPhotoUrls(editingId, form.servicos_executados);
  }, [
    editingId,
    form.servicos_executados,
    hydrateActivityPhotoUrls,
    showModal,
  ]);

  useEffect(() => {
    if (!viewRdo?.id) {
      return;
    }

    void hydrateActivityPhotoUrls(
      viewRdo.id,
      viewRdo.servicos_executados ?? [],
    );
  }, [hydrateActivityPhotoUrls, viewRdo]);

  const getGovernedPdfAccess = useCallback(async (rdoId: string) => {
    const access = await rdosService.getPdfAccess(rdoId);
    return access.hasFinalPdf ? access : null;
  }, []);

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
      const { generateRdoPdf } = await loadRdoPdfGenerator();
      const result = (await generateRdoPdf(fullRdo, {
        save: false,
        output: "base64",
        draftWatermark: false,
      })) as { base64: string; filename: string } | undefined;

      if (!result?.base64) {
        throw new Error("Falha ao gerar o PDF oficial do RDO.");
      }

      const pdfFile = base64ToPdfFile(result.base64, result.filename);
      await rdosService.attachFile(rdo.id, pdfFile);
      await refreshRdoDashboard();
      toast.success("PDF final do RDO emitido e registrado com sucesso.");
      return rdosService.getPdfAccess(rdo.id);
    },
    [getGovernedPdfAccess, refreshRdoDashboard],
  );

  const handleOpenCreate = () => {
    if (!canManageRdo) {
      toast.error("Você não tem permissão para criar RDOs.");
      return;
    }
    resetPendingActivityPhotos();
    setEditingId(null);
    setForm(defaultForm);
    setCurrentStep(0);
    setShowModal(true);
  };

  const handleOpenEdit = (rdo: Rdo) => {
    if (!canManageRdo) {
      toast.error("Você não tem permissão para editar RDOs.");
      return;
    }
    if (rdo.status === "cancelado") {
      toast.error("RDO cancelado está bloqueado para edição.");
      return;
    }
    if (rdo.pdf_file_key) {
      toast.error(
        "RDO com PDF final emitido esta bloqueado para edicao. Gere um novo documento para alterar o conteudo.",
      );
      return;
    }
    resetPendingActivityPhotos();
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
        if (access?.hasFinalPdf && access.url) {
          openPdfForPrint(access.url, () => {
            toast.info(
              "Pop-up bloqueado. Permita pop-ups para imprimir o PDF final do RDO.",
            );
          });
          return;
        }

        if (access?.hasFinalPdf) {
          toast.warning(
            access.message ||
              "O PDF final do RDO foi emitido, mas a URL segura não está disponível agora. Abrimos o download oficial do arquivo para impressão.",
          );
          const officialBlob = await rdosService.downloadPdf(rdo.id);
          const officialFileUrl = URL.createObjectURL(officialBlob);
          openPdfForPrint(officialFileUrl, () => {
            toast.info(
              "Pop-up bloqueado. Permita pop-ups para imprimir o PDF final do RDO.",
            );
          });
          setTimeout(() => URL.revokeObjectURL(officialFileUrl), 60_000);
          return;
        }

        throw new Error(
          "O RDO aprovado precisa do PDF final governado antes da impressão.",
        );
      }

      const fullRdo = await rdosService.findOne(rdo.id);
      const { generateRdoPdf } = await loadRdoPdfGenerator();
      const result = (await generateRdoPdf(fullRdo, {
        save: false,
        output: "base64",
        draftWatermark: true,
      })) as { base64: string } | undefined;

      if (!result?.base64) {
        throw new Error("Falha ao gerar PDF do RDO para impressão.");
      }

      const fileURL = URL.createObjectURL(base64ToPdfBlob(result.base64));
      openPdfForPrint(fileURL, () => {
        toast.info(
          "Pop-up bloqueado. Permita pop-ups para imprimir o PDF final do RDO.",
        );
      });
      setTimeout(() => URL.revokeObjectURL(fileURL), 60_000);
    },
    [ensureGovernedPdf],
  );

  const validateRdoForm = () => {
    if (!form.data) {
      return "Informe a data do RDO.";
    }

    if (form.site_id && form.responsavel_id) {
      const selectedResponsavel = users.find((user) => user.id === form.responsavel_id);
      if (!selectedResponsavel || !isUserVisibleForSite(selectedResponsavel, selectedResponsavel.company_id || "", form.site_id)) {
        return "O responsável selecionado não pertence à obra atual.";
      }
    }

    const temperaturaMin =
      form.temperatura_min !== "" ? Number(form.temperatura_min) : null;
    const temperaturaMax =
      form.temperatura_max !== "" ? Number(form.temperatura_max) : null;

    if (
      temperaturaMin != null &&
      temperaturaMax != null &&
      temperaturaMin > temperaturaMax
    ) {
      return "A temperatura mínima não pode ser maior que a máxima.";
    }

    if (form.houve_paralisacao && !form.motivo_paralisacao.trim()) {
      return "Informe o motivo da paralisação.";
    }

    const invalidMaoDeObra = form.mao_de_obra.findIndex(
      (item) => !item.funcao.trim(),
    );
    if (invalidMaoDeObra >= 0) {
      return `Preencha a função da mão de obra #${invalidMaoDeObra + 1}.`;
    }

    const invalidEquipamento = form.equipamentos.findIndex(
      (item) => !item.nome.trim(),
    );
    if (invalidEquipamento >= 0) {
      return `Preencha o nome do equipamento #${invalidEquipamento + 1}.`;
    }

    const invalidMaterial = form.materiais_recebidos.findIndex(
      (item) => !item.descricao.trim() || !item.unidade.trim(),
    );
    if (invalidMaterial >= 0) {
      return `Preencha descrição e unidade do material #${invalidMaterial + 1}.`;
    }

    const invalidServico = form.servicos_executados.findIndex(
      (item) => !item.descricao.trim(),
    );
    if (invalidServico >= 0) {
      return `Preencha a descrição da atividade #${invalidServico + 1}.`;
    }

    const invalidOcorrencia = form.ocorrencias.findIndex(
      (item) => !item.descricao.trim(),
    );
    if (invalidOcorrencia >= 0) {
      return `Preencha a descrição da ocorrência #${invalidOcorrencia + 1}.`;
    }

    const activityWithTooManyPhotos = form.servicos_executados.findIndex(
      (item, activityIndex) =>
        (item.fotos?.length ?? 0) +
          getPendingActivityPhotos(activityIndex).length >
        10,
    );
    if (activityWithTooManyPhotos >= 0) {
      return `A atividade #${activityWithTooManyPhotos + 1} excedeu o limite de 10 fotos.`;
    }

    return null;
  };

  const uploadQueuedActivityPhotos = async (rdoId: string) => {
    const queuedEntries = Object.entries(pendingActivityPhotosRef.current)
      .map(([activityIndex, photos]) => ({
        activityIndex: Number(activityIndex),
        photos,
      }))
      .filter(({ photos }) => photos.length > 0)
      .sort((left, right) => left.activityIndex - right.activityIndex);

    let uploadedCount = 0;
    let signaturesReset = false;

    for (const entry of queuedEntries) {
      for (const photo of entry.photos) {
        const result = await rdosService.attachActivityPhoto(
          rdoId,
          entry.activityIndex,
          photo.file,
        );
        uploadedCount += 1;
        signaturesReset = signaturesReset || result.signaturesReset;
      }
    }

    return { uploadedCount, signaturesReset };
  };

  const handleSave = async (options?: { printAfterSave?: boolean }) => {
    const shouldPrintAfterSave = options?.printAfterSave ?? false;
    const validationMessage = validateRdoForm();
    if (validationMessage) {
      toast.error(validationMessage);
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
      condicao_terreno: form.condicao_terreno.trim() || undefined,
      mao_de_obra: form.mao_de_obra.map((item) => {
        const payloadItem = stripRdoRowKey(item);
        return {
          ...payloadItem,
          funcao: payloadItem.funcao.trim(),
        };
      }),
      equipamentos: form.equipamentos.map((item) => {
        const payloadItem = stripRdoRowKey(item);
        return {
          ...payloadItem,
          nome: payloadItem.nome.trim(),
          observacao: payloadItem.observacao?.trim() || undefined,
        };
      }),
      materiais_recebidos: form.materiais_recebidos.map((item) => {
        const payloadItem = stripRdoRowKey(item);
        return {
          ...payloadItem,
          descricao: payloadItem.descricao.trim(),
          unidade: payloadItem.unidade.trim(),
          fornecedor: payloadItem.fornecedor?.trim() || undefined,
        };
      }),
      servicos_executados: form.servicos_executados.map((item) => {
        const payloadItem = stripRdoRowKey(item);
        return {
          ...payloadItem,
          descricao: payloadItem.descricao.trim(),
          observacao: payloadItem.observacao?.trim() || undefined,
          fotos: payloadItem.fotos ?? [],
        };
      }),
      ocorrencias: form.ocorrencias.map((item) => {
        const payloadItem = stripRdoRowKey(item);
        return {
          ...payloadItem,
          descricao: payloadItem.descricao.trim(),
          hora: payloadItem.hora?.trim() || undefined,
        };
      }),
      houve_acidente: form.houve_acidente,
      houve_paralisacao: form.houve_paralisacao,
      motivo_paralisacao: form.motivo_paralisacao.trim() || undefined,
      observacoes: form.observacoes.trim() || undefined,
      programa_servicos_amanha:
        form.programa_servicos_amanha.trim() || undefined,
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

      try {
        const queuedUploadResult = await uploadQueuedActivityPhotos(
          savedRdo.id,
        );
        if (queuedUploadResult.uploadedCount > 0) {
          savedRdo = await rdosService.findOne(savedRdo.id);
          if (queuedUploadResult.signaturesReset) {
            toast.warning(
              "RDO salvo e fotos anexadas, mas as assinaturas foram invalidadas pela mudança de conteúdo.",
            );
          } else {
            toast.success(
              `${queuedUploadResult.uploadedCount} foto(s) de atividade anexada(s) com governança.`,
            );
          }
        }
      } catch (uploadError) {
        console.error(
          "Erro ao enviar fotos pendentes das atividades do RDO:",
          uploadError,
        );
        toast.warning(
          getApiErrorMessage(uploadError) ||
            "O RDO foi salvo, mas uma ou mais fotos da atividade não puderam ser enviadas.",
        );
      }

      closeEditorModal();
      try {
        await refreshRdoDashboard();
      } catch (refreshError) {
        console.error("Erro ao atualizar a lista de RDOs após salvar:", refreshError);
        toast.warning(
          "RDO salvo, mas a atualização da lista falhou. Recarregue a tela para ver o conteúdo atualizado.",
        );
      }

      if (shouldPrintAfterSave) {
        try {
          await handlePrintAfterSave(savedRdo);
        } catch (printError) {
          console.error(
            "Erro ao preparar impressão automática do RDO:",
            printError,
          );
          toast.warning(
            "RDO salvo, mas não foi possível abrir a impressão automática.",
          );
        }
      }
    } catch (error) {
      console.error("Erro ao salvar RDO:", error);
      toast.error(getApiErrorMessage(error) || "Erro ao salvar RDO.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (!canManageRdo) {
      toast.error("Você não tem permissão para alterar o status do RDO.");
      return;
    }
    try {
      const updated = await rdosService.updateStatus(id, newStatus);
      setRdos((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updated } : r)),
      );
      if (viewRdo?.id === id) {
        setViewRdo((v) => (v ? { ...v, ...updated } : v));
      }
      void refreshOverview().catch((error) => {
        console.error("Erro ao atualizar overview após mudança de status:", error);
      });
      toast.success(`Status atualizado para "${RDO_STATUS_LABEL[newStatus]}"`);
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast.error(
        getApiErrorMessage(error) || "Erro ao atualizar status do RDO.",
      );
    }
  };

  const handleCancelRdo = async (rdo: Rdo) => {
    if (!canManageRdo) {
      toast.error("Você não tem permissão para cancelar RDOs.");
      return;
    }

    if (rdo.status === "cancelado") {
      toast.error("Este RDO já está cancelado.");
      return;
    }

    if (rdo.pdf_file_key) {
      toast.error("RDO com PDF final emitido não pode ser cancelado.");
      return;
    }

    const reason = window.prompt("Informe o motivo do cancelamento do RDO:");
    if (!reason || !reason.trim()) {
      return;
    }

    try {
      const updated = await rdosService.cancel(rdo.id, reason.trim());
      setRdos((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (viewRdo?.id === updated.id) {
        setViewRdo(updated);
      }
      await refreshOverview();
      toast.success("RDO cancelado com sucesso.");
    } catch (error) {
      console.error("Erro ao cancelar RDO:", error);
      toast.error(
        getApiErrorMessage(error) || "Não foi possível cancelar o RDO.",
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManageRdo) {
      toast.error("Você não tem permissão para excluir RDOs.");
      return;
    }
    if (!confirm("Deseja excluir este RDO?")) return;
    try {
      await rdosService.delete(id);
      toast.success("RDO excluído.");
      await refreshRdoDashboard();
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
        withRdoRowKey({
          funcao: "",
          quantidade: 1,
          turno: "manha",
          horas: 8,
        }),
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
      arr[i] = { ...arr[i], [field]: value } as RdoMaoDeObraItem;
      return { ...f, mao_de_obra: arr };
    });

  const addEquipamento = () =>
    setForm((f) => ({
      ...f,
      equipamentos: [
        ...f.equipamentos,
        withRdoRowKey({
          nome: "",
          quantidade: 1,
          horas_trabalhadas: 0,
          horas_ociosas: 0,
        }),
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
      arr[i] = { ...arr[i], [field]: value } as RdoEquipamentoItem;
      return { ...f, equipamentos: arr };
    });

  const addMaterial = () =>
    setForm((f) => ({
      ...f,
      materiais_recebidos: [
        ...f.materiais_recebidos,
        withRdoRowKey({
          descricao: "",
          unidade: "un",
          quantidade: 0,
        }),
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
      arr[i] = { ...arr[i], [field]: value } as RdoMaterialItem;
      return { ...f, materiais_recebidos: arr };
    });

  const addServico = () =>
    setForm((f) => ({
      ...f,
      servicos_executados: [
        ...f.servicos_executados,
        withRdoRowKey({
          descricao: "",
          percentual_concluido: 0,
          observacao: "",
          fotos: [],
        }),
      ],
    }));
  const removeServico = (i: number) => {
    setForm((f) => ({
      ...f,
      servicos_executados: f.servicos_executados.filter((_, idx) => idx !== i),
    }));
    setPendingActivityPhotos((current) => {
      const next: Record<number, PendingActivityPhoto[]> = {};
      Object.entries(current).forEach(([rawIndex, photos]) => {
        const currentIndex = Number(rawIndex);
        if (currentIndex === i) {
          photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
          return;
        }

        next[currentIndex > i ? currentIndex - 1 : currentIndex] = photos;
      });
      return next;
    });
  };
  const updateServico = (
    i: number,
    field: keyof ServicoItem,
    value: string | number | string[],
  ) =>
    setForm((f) => {
      const arr = [...f.servicos_executados];
      arr[i] = { ...arr[i], [field]: value } as RdoServicoItem;
      return { ...f, servicos_executados: arr };
    });

  const resolveActivityPhotoSrc = useCallback(
    (photo: string) => {
      if (!isGovernedActivityPhotoReference(photo)) {
        return photo;
      }

      return resolvedActivityPhotoUrls[photo] || "";
    },
    [resolvedActivityPhotoUrls],
  );

  const getPendingActivityPhotos = useCallback(
    (activityIndex: number) => pendingActivityPhotos[activityIndex] ?? [],
    [pendingActivityPhotos],
  );

  const handleAddActivityPhotos = async (
    activityIndex: number,
    files: FileList | null,
  ) => {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) {
      return;
    }

    if (editingId) {
      try {
        const uploaded: Array<{
          photoReference: string;
          signaturesReset: boolean;
        }> = [];

        for (const file of selectedFiles) {
          const result = await rdosService.attachActivityPhoto(
            editingId,
            activityIndex,
            file,
          );
          uploaded.push(result);
        }

        const appendedReferences = uploaded.map((entry) => entry.photoReference);
        setForm((current) => {
          const nextActivities = [...current.servicos_executados];
          const currentActivity = nextActivities[activityIndex];
          if (!currentActivity) {
            return current;
          }

          nextActivities[activityIndex] = {
            ...currentActivity,
            fotos: [...(currentActivity.fotos ?? []), ...appendedReferences],
          };

          return { ...current, servicos_executados: nextActivities };
        });

        const refreshedRdo = await rdosService.findOne(editingId);
        setRdos((current) =>
          current.map((item) =>
            item.id === refreshedRdo.id ? refreshedRdo : item,
          ),
        );
        if (viewRdo?.id === refreshedRdo.id) {
          setViewRdo(refreshedRdo);
        }

        if (uploaded.some((entry) => entry.signaturesReset)) {
          toast.warning(
            "As assinaturas do RDO foram invalidadas porque o conteúdo da atividade foi alterado.",
          );
        } else {
          toast.success("Foto(s) da atividade anexada(s) ao RDO.");
        }
      } catch (error) {
        console.error("Erro ao anexar fotos da atividade do RDO:", error);
        toast.error(
          getApiErrorMessage(error) ||
            "Não foi possível anexar as fotos da atividade.",
        );
      }
      return;
    }

    const nextPendingPhotos = selectedFiles.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
    }));

    setPendingActivityPhotos((current) => {
      const existing = current[activityIndex] ?? [];
      return {
        ...current,
        [activityIndex]: [...existing, ...nextPendingPhotos],
      };
    });
    toast.info(
      "As fotos da atividade serão enviadas ao storage governado após salvar o RDO.",
    );
  };

  const handleRemoveActivityPhoto = async (
    activityIndex: number,
    photoIndex: number,
    photo: string,
  ) => {
    if (!isGovernedActivityPhotoReference(photo)) {
      setPendingActivityPhotos((current) => {
        const currentPhotos = current[activityIndex] ?? [];
        const photoToRemove = currentPhotos[photoIndex];
        if (photoToRemove) {
          URL.revokeObjectURL(photoToRemove.previewUrl);
        }

        const nextActivityPhotos = currentPhotos.filter(
          (_, currentIndex) => currentIndex !== photoIndex,
        );
        return {
          ...current,
          [activityIndex]: nextActivityPhotos,
        };
      });
      return;
    }

    if (!editingId) {
      return;
    }

    try {
      const result = await rdosService.removeActivityPhoto(
        editingId,
        activityIndex,
        photoIndex,
      );
      setForm((current) => {
        const nextActivities = [...current.servicos_executados];
        const currentActivity = nextActivities[activityIndex];
        if (!currentActivity) {
          return current;
        }

        nextActivities[activityIndex] = {
          ...currentActivity,
          fotos: (currentActivity.fotos ?? []).filter(
            (_, currentIndex) => currentIndex !== photoIndex,
          ),
        };

        return { ...current, servicos_executados: nextActivities };
      });
      setResolvedActivityPhotoUrls((current) => {
        const next = { ...current };
        delete next[photo];
        return next;
      });

      const refreshedRdo = await rdosService.findOne(editingId);
      setRdos((current) =>
        current.map((item) =>
          item.id === refreshedRdo.id ? refreshedRdo : item,
        ),
      );
      if (viewRdo?.id === refreshedRdo.id) {
        setViewRdo(refreshedRdo);
      }

      if (result.signaturesReset) {
        toast.warning(
          "Foto removida. As assinaturas do RDO foram invalidadas pela alteração do conteúdo.",
        );
      } else {
        toast.success("Foto da atividade removida.");
      }
    } catch (error) {
      console.error("Erro ao remover foto da atividade do RDO:", error);
      toast.error(
        getApiErrorMessage(error) ||
          "Não foi possível remover a foto da atividade.",
      );
    }
  };

  const addOcorrencia = () =>
    setForm((f) => ({
      ...f,
      ocorrencias: [
        ...f.ocorrencias,
        withRdoRowKey({ tipo: "outro", descricao: "" }),
      ],
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
      arr[i] = { ...arr[i], [field]: value } as RdoOcorrenciaItem;
      return { ...f, ocorrencias: arr };
    });

  const printGeneratedRdoPdf = useCallback(
    async (fullRdo: Rdo, draftWatermark: boolean) => {
      const { generateRdoPdf } = await loadRdoPdfGenerator();
      const result = (await generateRdoPdf(fullRdo, {
        save: false,
        output: "base64",
        draftWatermark,
      })) as { base64: string } | undefined;

      if (!result?.base64) {
        throw new Error("Falha ao gerar o PDF do RDO para impressão.");
      }

      const fileURL = URL.createObjectURL(base64ToPdfBlob(result.base64));
      openPdfForPrint(fileURL, () => {
        toast.info(
          "Pop-up bloqueado. Permita pop-ups para imprimir o PDF final do RDO.",
        );
      });
      setTimeout(() => URL.revokeObjectURL(fileURL), 60_000);
    },
    [],
  );

  const handlePrint = (rdo: Rdo) => {
    void (async () => {
      try {
        const shouldUseGovernedPdf =
          Boolean(rdo.pdf_file_key) || rdo.status === "aprovado";

        if (shouldUseGovernedPdf) {
          const access =
            canManageRdo && !rdo.pdf_file_key
              ? await ensureGovernedPdf(rdo)
              : await getGovernedPdfAccess(rdo.id);
          if (access?.hasFinalPdf && access.url) {
            openPdfForPrint(access.url, () => {
              toast.info(
                "Pop-up bloqueado. Permita pop-ups para imprimir o PDF final do RDO.",
              );
            });
            return;
          }

        if (access?.hasFinalPdf) {
          toast.warning(
            access.message ||
              "O PDF final do RDO foi emitido, mas a URL segura não está disponível agora. Abrimos o download oficial do arquivo para impressão.",
          );
          const officialBlob = await rdosService.downloadPdf(rdo.id);
          const fileURL = URL.createObjectURL(officialBlob);
          openPdfForPrint(fileURL, () => {
            toast.info(
              "Pop-up bloqueado. Permita pop-ups para imprimir o PDF final do RDO.",
            );
          });
          setTimeout(() => URL.revokeObjectURL(fileURL), 60_000);
          return;
        }

          throw new Error(
            "O RDO aprovado precisa do PDF final governado antes da impressão.",
          );
        }

        const fullRdo = await rdosService.findOne(rdo.id);
        await printGeneratedRdoPdf(fullRdo, true);
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
        if (!canManageRdo && !rdo.pdf_file_key) {
          toast.error(
            "Você não tem permissão para emitir o PDF final deste RDO.",
          );
          return;
        }

        const access =
          canManageRdo && !rdo.pdf_file_key
            ? await ensureGovernedPdf(rdo)
            : await getGovernedPdfAccess(rdo.id);
        if (!access) {
          toast.error(
            "O RDO precisa estar aprovado e assinado pelo responsável e engenheiro antes da emissão final.",
          );
          return;
        }

        if (!access.hasFinalPdf) {
          toast.error(
            "O RDO ainda não possui PDF final governado disponível.",
          );
          return;
        }

        if (!access.url) {
          toast.warning(
            access.message ||
              "PDF final emitido, mas a URL segura não está disponível no momento. Abrimos o download oficial do arquivo.",
          );
          const officialBlob = await rdosService.downloadPdf(rdo.id);
          const fileUrl = URL.createObjectURL(officialBlob);
          const openedWindow = window.open(
            fileUrl,
            "_blank",
            "noopener,noreferrer",
          );
          if (!openedWindow) {
            toast.error(
              "Não foi possível abrir o PDF final em uma nova janela. Permita pop-ups para continuar.",
            );
            URL.revokeObjectURL(fileUrl);
            return;
          }
          setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
          return;
        }

        const opened = openSafeExternalUrlInNewTab(access.url, () => {
          toast.error(
            "Não foi possível abrir o PDF final em uma nova janela. Permita pop-ups para continuar.",
          );
        });
        if (!opened) {
          return;
        }
      } catch (error) {
        console.error("Erro ao emitir/abrir PDF final do RDO:", error);
        toast.error("Não foi possível emitir ou abrir o PDF final do RDO.");
      }
    },
    [canManageRdo, ensureGovernedPdf, getGovernedPdfAccess],
  );

  const handleSign = async () => {
    if (!signModal) return;
    if (!canManageRdo) {
      toast.error("Você não tem permissão para assinar RDOs.");
      return;
    }
    if (signModal.rdo.status === "rascunho") {
      toast.error("Envie o RDO para revisão antes de coletar assinaturas.");
      return;
    }
    const cpfDigits = signForm.cpf.replace(/\D/g, "");
    if (!signForm.nome || cpfDigits.length !== 11) {
      toast.error("Preencha nome e CPF.");
      return;
    }
    const normalizedCpf = cpfDigits.replace(
      /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
      "$1.$2.$3-$4",
    );
    setSigning(true);
    try {
      const updated = await rdosService.sign(signModal.rdo.id, {
        tipo: signModal.tipo,
        nome: signForm.nome,
        cpf: normalizedCpf,
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
    if (!canManageRdo) {
      toast.error("Você não tem permissão para enviar RDOs por e-mail.");
      return;
    }
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
      const access = await rdosService.getPdfAccess(emailModal.id);
      if (!access.hasFinalPdf) {
        toast.info(
          access.message ||
            "Emita o PDF final governado antes de enviar este RDO por e-mail.",
        );
        return;
      }

      if (access.message) {
        toast.info(
          `${access.message} O envio oficial continuará usando o PDF final governado do RDO.`,
        );
      }

      const result = await rdosService.sendEmail(emailModal.id, emails);
      toast.success(result.message);
      setEmailModal(null);
      setEmailTo("");
    } catch (error) {
      toast.error(getApiErrorMessage(error) || "Erro ao enviar e-mail.");
    } finally {
      setSendingEmail(false);
    }
  };

  const filteredRdos = rdos;

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
          <Button type="button" onClick={refreshRdoDashboard}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ListPageLayout
        eyebrow="Diário de obra"
        title="Relatórios Diários de Obras"
        description="Controle produção diária, clima, mão de obra, ocorrências e status do canteiro."
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              leftIcon={<FileSpreadsheet className="h-4 w-4" />}
              onClick={() => downloadExcel("/rdos/export/excel", "rdos.xlsx")}
            >
              Exportar Excel
            </Button>
            {canManageRdo ? (
              <Button
                type="button"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={handleOpenCreate}
              >
                Novo RDO
              </Button>
            ) : null}
          </div>
        }
        metrics={[
          {
            label: "Total de RDOs",
            value: summary.total,
            note: "Registros visíveis no recorte atual.",
          },
          {
            label: "Rascunhos",
            value: summary.rascunho,
            note: "Pendentes de envio ou revisão final.",
            tone: "warning",
          },
          {
            label: "Enviados",
            value: summary.enviado,
            note: "Aguardando leitura e decisão.",
            tone: "primary",
          },
          {
            label: "Aprovados",
            value: summary.aprovado,
            note: "Com ciclo operacional concluído.",
            tone: "success",
          },
          {
            label: "Cancelados",
            value: summary.cancelado,
            note: "Registros encerrados sem emissão.",
            tone: "danger",
          },
        ]}
        toolbarTitle="Base de RDOs"
        toolbarDescription={`${total} registro(s) no recorte atual com filtros por status, obra e período.`}
        toolbarContent={
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-secondary)]" />
              <input
                type="text"
                placeholder="Buscar número, obra ou responsável..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
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
              <option value="cancelado">Cancelado</option>
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
        }
        footer={
          filteredRdos.length > 0 ? (
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
        <div className="space-y-4">
          {summary.rascunho > 0 ? (
            <InlineCallout
              tone="warning"
              icon={<AlertTriangle className="h-4 w-4" />}
              title="Há RDOs pendentes de envio"
              description={`${summary.rascunho} relatório(s) ainda estão em rascunho. Feche o ciclo diário e encaminhe para aprovação.`}
            />
          ) : null}

          {filteredRdos.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Nenhum RDO encontrado"
                description={
                  deferredSearch
                    ? "Nenhum resultado corresponde ao filtro aplicado."
                    : "Ainda não existem RDOs registrados para este tenant."
                }
                action={
                  !deferredSearch && canManageRdo ? (
                    <button
                      type="button"
                      onClick={handleOpenCreate}
                      className={cn(
                        buttonVariants(),
                        "inline-flex items-center",
                      )}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Novo RDO
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table className="min-w-[980px]">
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
                        {safeToLocaleDateString(
                          rdo.data,
                          "pt-BR",
                          undefined,
                          "—",
                        )}
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
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${RDO_STATUS_COLORS[rdo.status] ?? "border-[color:var(--ds-color-text-secondary)]/30 bg-[color:var(--ds-color-text-secondary)]/12 text-[var(--ds-color-text-secondary)]"}`}
                          >
                            {RDO_STATUS_LABEL[rdo.status] ?? rdo.status}
                          </span>
                          {canManageRdo && statusTransitions.length > 0 && (
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
                          <span className="text-[var(--ds-color-text-secondary)]">
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
                          <span className="text-xs text-[var(--ds-color-text-secondary)]">
                            Não
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => setViewRdo(rdo)}
                            title="Visualizar"
                            aria-label={`Visualizar RDO ${rdo.numero}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canManageRdo ? (
                            <>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => handleOpenEdit(rdo)}
                                className={cn(
                                  "",
                                  (rdo.pdf_file_key ||
                                    rdo.status === "cancelado") &&
                                    "opacity-40",
                                )}
                                aria-label={`Editar RDO ${rdo.numero}`}
                                title={
                                  rdo.status === "cancelado"
                                    ? "RDO cancelado: edição bloqueada"
                                    : rdo.pdf_file_key
                                      ? "RDO com PDF final: edição bloqueada"
                                      : "Editar"
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  if (
                                    rdo.status === "aprovado" ||
                                    rdo.status === "cancelado"
                                  ) {
                                    toast.error(
                                      "RDO aprovado ou cancelado não pode ser excluído.",
                                    );
                                    return;
                                  }
                                  handleDelete(rdo.id);
                                }}
                                className={cn(
                                  "text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]",
                                  (rdo.status === "aprovado" ||
                                    rdo.status === "cancelado") &&
                                    "opacity-40",
                                )}
                                aria-label={`Excluir RDO ${rdo.numero}`}
                                title={
                                  rdo.status === "aprovado" ||
                                  rdo.status === "cancelado"
                                    ? "RDO aprovado ou cancelado não pode ser excluído"
                                    : "Excluir"
                                }
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
        </div>
      </ListPageLayout>

      <StoredFilesPanel
        title="Storage semanal de RDO"
        description="Acompanhe os PDFs finais governados dos RDOs emitidos por semana e baixe o pacote consolidado quando precisar."
        listStoredFiles={rdosService.listFiles}
        getPdfAccess={rdosService.getPdfAccess}
        downloadWeeklyBundle={rdosService.downloadWeeklyBundle}
      />

      <RdoEditorModal
        open={showModal}
        editingId={editingId}
        currentStep={currentStep}
        steps={STEPS}
        form={form}
        setForm={setForm}
        sites={sites}
        users={users}
        saving={saving}
        formInputClassName={formInputClassName}
        formInputSmClassName={formInputSmClassName}
        onClose={closeEditorModal}
        onSave={handleSave}
        setCurrentStep={setCurrentStep}
        addMaoDeObra={addMaoDeObra}
        removeMaoDeObra={removeMaoDeObra}
        updateMaoDeObra={updateMaoDeObra}
        addEquipamento={addEquipamento}
        removeEquipamento={removeEquipamento}
        updateEquipamento={updateEquipamento}
        addMaterial={addMaterial}
        removeMaterial={removeMaterial}
        updateMaterial={updateMaterial}
        addServico={addServico}
        removeServico={removeServico}
        updateServico={updateServico}
        addOcorrencia={addOcorrencia}
        removeOcorrencia={removeOcorrencia}
        updateOcorrencia={updateOcorrencia}
        getPendingActivityPhotos={getPendingActivityPhotos}
        onAddActivityPhotos={handleAddActivityPhotos}
        onRemoveActivityPhoto={handleRemoveActivityPhoto}
        resolveActivityPhotoSrc={resolveActivityPhotoSrc}
      />

      <RdoViewerModal
        open={Boolean(viewRdo)}
        viewRdo={viewRdo}
        canManageRdo={canManageRdo}
        viewRdoLocked={viewRdoLocked}
        viewRdoLockMessage={viewRdoLockMessage}
        viewRdoVideos={viewRdoVideos}
        getAllowedStatusTransitions={getAllowedStatusTransitions}
        resolveActivityPhotoSrc={resolveActivityPhotoSrc}
        onClose={() => setViewRdo(null)}
        onEdit={(rdo) => {
          setViewRdo(null);
          handleOpenEdit(rdo);
        }}
        onPrint={handlePrint}
        onOpenGovernedPdf={handleOpenGovernedPdf}
        onCancelRdo={handleCancelRdo}
        onOpenSign={(rdo) => {
          if (rdo.pdf_file_key) {
            toast.error(
              "RDO com PDF final emitido esta bloqueado para novas assinaturas.",
            );
            return;
          }
          if (rdo.status === "rascunho") {
            toast.error(
              "Envie o RDO para revisão antes de coletar assinaturas.",
            );
            return;
          }
          if (rdo.status === "cancelado") {
            toast.error("RDO cancelado não pode ser assinado.");
            return;
          }
          setSignModal({ rdo, tipo: "responsavel" });
          setSignForm({ nome: "", cpf: "", tipo: "responsavel" });
        }}
        onOpenEmail={(rdo) => {
          setEmailModal(rdo);
          setEmailTo("");
        }}
        onChangeStatus={handleStatusChange}
      />

      <RdoActionModals
        signModal={signModal}
        setSignModal={setSignModal}
        signForm={signForm}
        setSignForm={setSignForm}
        signing={signing}
        onSign={handleSign}
        emailModal={emailModal}
        setEmailModal={setEmailModal}
        emailTo={emailTo}
        setEmailTo={setEmailTo}
        sendingEmail={sendingEmail}
        onSendEmail={handleSendEmail}
        formInputClassName={formInputClassName}
      />
    </>
  );
}
