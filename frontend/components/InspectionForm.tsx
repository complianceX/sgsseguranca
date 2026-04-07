"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import type { FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Plus,
  Printer,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { inspectionsService, type Inspection } from "@/services/inspectionsService";
import { generateInspectionPdf } from "@/lib/pdf/inspectionGenerator";
import { base64ToPdfBlob } from "@/lib/pdf/pdfFile";
import { openPdfForPrint } from "@/lib/print-utils";
import { sitesService, Site } from "@/services/sitesService";
import { usersService, User } from "@/services/usersService";
import { getFormErrorMessage } from "@/lib/error-handler";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, PageLoadingState } from "@/components/ui/state";
import { useAuth } from "@/context/AuthContext";
import { FormPageLayout } from "@/components/layout";
import { usePermissions } from "@/hooks/usePermissions";
import { useDocumentVideos } from "@/hooks/useDocumentVideos";
import { DocumentVideoPanel } from "@/components/document-videos/DocumentVideoPanel";
import { selectedTenantStore } from "@/lib/selectedTenantStore";
import { sessionStore } from "@/lib/sessionStore";
import {
  buildInspectionDraftStorageKey,
  mergeInspectionDraftWithPrefill,
} from "@/lib/inspection-form-draft";

const methodologyOptions = [
  "Observação direta em campo",
  "Entrevista com trabalhadores",
  "Checklist de conformidade",
  "Verificação de documentos",
  "Análise de processo e layout",
  "Registro fotográfico",
] as const;

const inspectionTypeOptions = [
  "Rotina",
  "Programada",
  "Especial",
  "Atendimento a NR",
] as const;
const riskGroupOptions = [
  "Físico",
  "Químico",
  "Biológico",
  "Ergonômico",
  "Acidente",
] as const;
const exposureTypeOptions = [
  "Permanente",
  "Intermitente",
  "Ocasional",
] as const;
const severityOptions = ["Baixa", "Moderada", "Alta", "Crítica"] as const;
const probabilityOptions = ["Baixa", "Média", "Alta"] as const;
const riskLevelOptions = ["Baixo", "Médio", "Alto", "Muito Alto"] as const;
const riskClassificationOptions = [
  "Aceitável",
  "Tolerável",
  "Moderado",
  "Substancial",
  "Intolerável",
] as const;
const actionStatusOptions = [
  "Pendente",
  "Em andamento",
  "Concluída",
  "Cancelada",
] as const;

const riscoSchema = z.object({
  grupo_risco: z.string().min(1, "Selecione o grupo de risco."),
  perigo_fator_risco: z.string().min(1, "Descreva o perigo ou fator de risco."),
  fonte_circunstancia: z.string().min(1, "Informe a fonte ou circunstância."),
  trabalhadores_expostos: z.string().min(1, "Informe quem está exposto."),
  tipo_exposicao: z.string().min(1, "Selecione o tipo de exposição."),
  medidas_existentes: z.string().min(1, "Descreva as medidas existentes."),
  severidade: z.string().min(1, "Selecione a severidade."),
  probabilidade: z.string().min(1, "Selecione a probabilidade."),
  nivel_risco: z.string().min(1, "Informe o nível de risco."),
  classificacao_risco: z.string().min(1, "Informe a classificação do risco."),
  acoes_necessarias: z.string().min(1, "Descreva as ações necessárias."),
  prazo: z.string().min(1, "Informe o prazo da ação."),
  responsavel: z.string().min(1, "Informe o responsável pela ação."),
});

const planoAcaoSchema = z.object({
  acao: z.string().min(1, "Descreva a ação."),
  responsavel: z.string().min(1, "Informe o responsável."),
  prazo: z.string().min(1, "Informe o prazo."),
  status: z.string().min(1, "Selecione o status."),
});

const evidenciaSchema = z.object({
  descricao: z.string().min(1, "Descreva a evidência."),
  url: z.string().optional(),
});

const inspectionSchema = z.object({
  site_id: z.string().min(1, "Selecione um site."),
  setor_area: z.string().min(1, "Informe o setor ou área."),
  tipo_inspecao: z.string().min(1, "Selecione o tipo de inspeção."),
  data_inspecao: z.string().min(1, "Informe a data da inspeção."),
  horario: z.string().min(1, "Informe o horário da inspeção."),
  responsavel_id: z.string().min(1, "Selecione o responsável."),
  objetivo: z.string().optional(),
  descricao_local_atividades: z.string().optional(),
  metodologia: z.array(z.string()).optional(),
  perigos_riscos: z.array(riscoSchema).optional(),
  plano_acao: z.array(planoAcaoSchema).optional(),
  evidencias: z.array(evidenciaSchema).optional(),
  conclusao: z.string().optional(),
});

type InspectionFormData = z.infer<typeof inspectionSchema>;
type RiskFormItem = NonNullable<InspectionFormData["perigos_riscos"]>[number];
type ActionFormItem = NonNullable<InspectionFormData["plano_acao"]>[number];
type EvidenceFormItem = NonNullable<InspectionFormData["evidencias"]>[number];

type RiskSuggestion = {
  score: number;
  nivel: (typeof riskLevelOptions)[number];
  classificacao: (typeof riskClassificationOptions)[number];
  label: string;
};

interface InspectionFormProps {
  id?: string;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function currentTimeInputValue() {
  const now = new Date();
  return `${`${now.getHours()}`.padStart(2, "0")}:${`${now.getMinutes()}`.padStart(2, "0")}`;
}

function normalizeDateInput(value?: string | null) {
  if (!value) return todayInputValue();
  return value.includes("T") ? value.slice(0, 10) : value;
}

function normalizeTimeInput(value?: string | null) {
  if (!value) return currentTimeInputValue();
  const match = value.match(/^\d{2}:\d{2}/);
  return match ? match[0] : value;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Nao foi possivel converter a imagem."));
    reader.readAsDataURL(file);
  });
}

function buildDefaultRisk(): RiskFormItem {
  return {
    grupo_risco: "",
    perigo_fator_risco: "",
    fonte_circunstancia: "",
    trabalhadores_expostos: "",
    tipo_exposicao: "",
    medidas_existentes: "",
    severidade: "",
    probabilidade: "",
    nivel_risco: "",
    classificacao_risco: "",
    acoes_necessarias: "",
    prazo: "",
    responsavel: "",
  };
}

function buildDefaultAction(): ActionFormItem {
  return { acao: "", responsavel: "", prazo: "", status: "Pendente" };
}

function buildDefaultEvidence(): EvidenceFormItem {
  return { descricao: "", url: "" };
}

function buildDefaultValues(
  inspection?: Partial<InspectionFormData> & {
    data_inspecao?: string;
    horario?: string;
  },
): InspectionFormData {
  return {
    site_id: inspection?.site_id || "",
    setor_area: inspection?.setor_area || "",
    tipo_inspecao: inspection?.tipo_inspecao || "Rotina",
    data_inspecao: normalizeDateInput(inspection?.data_inspecao),
    horario: normalizeTimeInput(inspection?.horario),
    responsavel_id: inspection?.responsavel_id || "",
    objetivo: inspection?.objetivo || "",
    descricao_local_atividades: inspection?.descricao_local_atividades || "",
    metodologia: inspection?.metodologia || [],
    perigos_riscos: inspection?.perigos_riscos || [],
    plano_acao: inspection?.plano_acao || [],
    evidencias: inspection?.evidencias || [],
    conclusao: inspection?.conclusao || "",
  };
}

function sortByName<T extends { nome: string }>(items: T[]) {
  return [...items].sort((left, right) =>
    left.nome.localeCompare(right.nome, "pt-BR"),
  );
}

function getRiskSuggestion(
  severidade?: string,
  probabilidade?: string,
): RiskSuggestion | null {
  const severityWeights: Record<string, number> = {
    Baixa: 1,
    Moderada: 2,
    Alta: 3,
    Crítica: 4,
  };
  const probabilityWeights: Record<string, number> = {
    Baixa: 1,
    Média: 2,
    Alta: 3,
  };
  if (!severidade || !probabilidade) return null;
  const score =
    (severityWeights[severidade] || 0) *
    (probabilityWeights[probabilidade] || 0);
  if (!score) return null;
  if (score <= 2)
    return {
      score,
      nivel: "Baixo",
      classificacao: "Aceitável",
      label: "Baixo / Aceitável",
    };
  if (score <= 4)
    return {
      score,
      nivel: "Médio",
      classificacao: "Tolerável",
      label: "Médio / Tolerável",
    };
  if (score <= 8)
    return {
      score,
      nivel: "Alto",
      classificacao: "Substancial",
      label: "Alto / Substancial",
    };
  return {
    score,
    nivel: "Muito Alto",
    classificacao: "Intolerável",
    label: "Muito Alto / Intolerável",
  };
}

function isClosedStatus(status?: string) {
  const normalized = status?.trim().toLowerCase();
  return (
    normalized === "concluída" ||
    normalized === "concluida" ||
    normalized === "cancelada"
  );
}

function findFirstErrorPath(errors: unknown, prefix = ""): string | null {
  if (!errors || typeof errors !== "object") return null;
  for (const [key, value] of Object.entries(
    errors as Record<string, unknown>,
  )) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (
      value &&
      typeof value === "object" &&
      "message" in (value as Record<string, unknown>)
    ) {
      return nextPrefix;
    }
    const nested = findFirstErrorPath(value, nextPrefix);
    if (nested) return nested;
  }
  return null;
}

function FieldErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-[11px] font-medium text-[var(--ds-color-danger)]">
      {message}
    </p>
  );
}

function SectionHeader({
  title,
  description,
  icon,
  badge,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  badge?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--ds-color-border-subtle)] pb-4 md:flex-row md:items-start md:justify-between">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold text-[var(--ds-color-text-primary)]">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ds-color-text-muted)]">
            {description}
          </p>
        </div>
      </div>
      {badge ? (
        <span className="inline-flex items-center rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

const labelClassName =
  "mb-2 block text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-color-text-secondary)]";
const nativeSelectClassName =
  "flex h-11 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-4 text-base font-medium text-[var(--ds-color-text-primary)] outline-none transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60";

const formControlsScopeClassName =
  "[&_input:not([type='checkbox']):not([type='radio'])]:h-11 [&_input:not([type='checkbox']):not([type='radio'])]:px-4 [&_input:not([type='checkbox']):not([type='radio'])]:text-base [&_textarea]:min-h-[8rem] [&_textarea]:px-4 [&_textarea]:py-3 [&_textarea]:text-base [&_textarea]:leading-6 [&_select]:h-11 [&_select]:px-4 [&_select]:text-base";

export function InspectionForm({ id }: InspectionFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canManageInspections = hasPermission("can_manage_inspections");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draftBootstrappedRef = useRef(false);
  const draftSaveTimerRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<Record<number, File[]>>({});
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState(
    () => selectedTenantStore.get()?.companyId || sessionStore.get()?.companyId || "",
  );
  const [inspectionHasFinalPdf, setInspectionHasFinalPdf] = useState(false);
  const inspectionReadOnlyMessage = inspectionHasFinalPdf
    ? "Este relatório já possui PDF final governado e entrou em modo somente leitura."
    : null;
  const [cameraTargetIndex, setCameraTargetIndex] = useState<number | null>(
    null,
  );
  const isFieldMode = searchParams.get("field") === "1";
  const isPhotographicReport = searchParams.get("kind") === "photographic";
  const hasExplicitGoalPrefill = searchParams.has("objetivo");
  const prefillSiteId = searchParams.get("site_id") || "";
  const prefillResponsibleId =
    searchParams.get("responsavel_id") || searchParams.get("user_id") || "";
  const prefillArea =
    searchParams.get("setor_area") || searchParams.get("area") || "";
  const prefillGoal =
    searchParams.get("objetivo") ||
    (isPhotographicReport
      ? "Registrar evidencias fotograficas das frentes de servico e das condicoes observadas em campo."
      : "");
  const draftStorageKey = useMemo(
    () =>
      id
        ? null
        : buildInspectionDraftStorageKey({
            userId: user?.id,
            isPhotographicReport,
            prefillSiteId,
            prefillArea,
            prefillResponsibleId,
            prefillGoal,
            hasExplicitGoalPrefill,
          }),
    [
      hasExplicitGoalPrefill,
      id,
      isPhotographicReport,
      prefillArea,
      prefillGoal,
      prefillResponsibleId,
      prefillSiteId,
      user?.id,
    ],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    setFocus,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InspectionFormData>({
    resolver: zodResolver(inspectionSchema),
    mode: "onBlur",
    reValidateMode: "onBlur",
    defaultValues: buildDefaultValues(),
  });

  const {
    fields: riskFields,
    append: appendRisk,
    remove: removeRisk,
  } = useFieldArray({
    control,
    name: "perigos_riscos",
  });
  const {
    fields: actionFields,
    append: appendAction,
    remove: removeAction,
  } = useFieldArray({
    control,
    name: "plano_acao",
  });
  const {
    fields: evidenceFields,
    append: appendEvidence,
    remove: removeEvidence,
  } = useFieldArray({
    control,
    name: "evidencias",
  });

  const watchedMetodologia = useWatch({
    control,
    name: "metodologia",
    defaultValue: [],
  });
  const watchedRiscos = useWatch({
    control,
    name: "perigos_riscos",
    defaultValue: [],
  });
  const watchedPlanoAcao = useWatch({
    control,
    name: "plano_acao",
    defaultValue: [],
  });
  const watchedEvidencias = useWatch({
    control,
    name: "evidencias",
    defaultValue: [],
  });
  const watchedSiteId = useWatch({
    control,
    name: "site_id",
    defaultValue: "",
  });
  const watchedSetorArea = useWatch({
    control,
    name: "setor_area",
    defaultValue: "",
  });
  const watchedTipoInspecao = useWatch({
    control,
    name: "tipo_inspecao",
    defaultValue: "Rotina",
  });
  const watchedDescricaoLocalAtividades = useWatch({
    control,
    name: "descricao_local_atividades",
    defaultValue: "",
  });
  const watchedObjective = useWatch({
    control,
    name: "objetivo",
    defaultValue: "",
  });

  useEffect(() => {
    const unsubscribe = selectedTenantStore.subscribe((tenant) => {
      setActiveCompanyId(tenant?.companyId || sessionStore.get()?.companyId || "");
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (id) return;

    if (prefillSiteId) {
      setValue("site_id", prefillSiteId, { shouldDirty: false });
    }
    if (prefillResponsibleId) {
      setValue("responsavel_id", prefillResponsibleId, { shouldDirty: false });
    }
    if (prefillArea) {
      setValue("setor_area", prefillArea, { shouldDirty: false });
    }
    if (prefillGoal) {
      setValue("objetivo", prefillGoal, { shouldDirty: false });
    }
    if (isPhotographicReport) {
      setValue("tipo_inspecao", "Especial", { shouldDirty: false });
      setValue(
        "metodologia",
        Array.from(new Set(["Observação direta em campo", "Registro fotográfico"])),
        { shouldDirty: false },
      );
    }
  }, [
    id,
    isPhotographicReport,
    prefillArea,
    prefillGoal,
    prefillResponsibleId,
    prefillSiteId,
    setValue,
  ]);

  useEffect(() => {
    if (!draftStorageKey || fetching || draftBootstrappedRef.current) return;
    draftBootstrappedRef.current = true;
    if (typeof window === "undefined") return;

    const rawDraft = window.localStorage.getItem(draftStorageKey);
    if (!rawDraft) return;

    try {
      const parsed = JSON.parse(rawDraft) as {
        savedAt?: number;
        values?: InspectionFormData;
      };

      if (!parsed.values) return;

      const mergedValues = mergeInspectionDraftWithPrefill(parsed.values, {
        isPhotographicReport,
        prefillSiteId,
        prefillArea,
        prefillResponsibleId,
        prefillGoal,
        hasExplicitGoalPrefill,
      });

      reset(buildDefaultValues(mergedValues));
      if (parsed.savedAt) {
        setDraftSavedAt(parsed.savedAt);
      }
      toast.info("Rascunho da inspeção restaurado automaticamente.");
    } catch (error) {
      console.error("Erro ao restaurar rascunho da inspeção:", error);
    }
  }, [
    draftStorageKey,
    fetching,
    hasExplicitGoalPrefill,
    isPhotographicReport,
    prefillArea,
    prefillGoal,
    prefillResponsibleId,
    prefillSiteId,
    reset,
  ]);

  useEffect(() => {
    if (!draftStorageKey || fetching || id) return;
    if (typeof window === "undefined") return;

    const subscription = watch(() => {
      if (!draftBootstrappedRef.current) return;

      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
      }

      draftSaveTimerRef.current = window.setTimeout(() => {
        const now = Date.now();
        window.localStorage.setItem(
          draftStorageKey,
          JSON.stringify({
            savedAt: now,
            values: getValues(),
          }),
        );
        setDraftSavedAt(now);
      }, 800);
    });

    return () => {
      subscription.unsubscribe();
      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [draftStorageKey, fetching, getValues, id, watch]);
  const metodologiaSelecionada = watchedMetodologia ?? [];
  const riscos = watchedRiscos ?? [];
  const evidencias = watchedEvidencias ?? [];
  const openNcWithSophieHref = useMemo(() => {
    if (!id) return null;
    const params = new URLSearchParams();
    params.set("documentType", "nc");
    params.set("source_type", "inspection");
    params.set("source_reference", id);
    params.set(
      "title",
      watchedSetorArea
        ? `NC de inspeção - ${watchedSetorArea}`
        : "Não conformidade oriunda de inspeção",
    );
    params.set("description", watchedDescricaoLocalAtividades || "");
    if (watchedSiteId) {
      params.set("site_id", watchedSiteId);
    }
    params.set(
      "source_context",
      `Inspeção ${watchedTipoInspecao || "operacional"} no setor ${watchedSetorArea || id}.`,
    );
    return `/dashboard/sst-agent?${params.toString()}`;
  }, [
    id,
    watchedDescricaoLocalAtividades,
    watchedSetorArea,
    watchedSiteId,
    watchedTipoInspecao,
  ]);

  const pendingActions = useMemo(
    () =>
      (watchedPlanoAcao ?? []).filter((item) => !isClosedStatus(item?.status))
        .length,
    [watchedPlanoAcao],
  );
  const highRiskCount = useMemo(
    () =>
      (watchedRiscos ?? []).filter((item) =>
        ["Alto", "Muito Alto"].includes(item?.nivel_risco || ""),
      ).length,
    [watchedRiscos],
  );
  const documentVideos = useDocumentVideos({
    documentId: id,
    enabled: Boolean(id),
    loadVideos: inspectionsService.listVideoAttachments,
    uploadVideo: inspectionsService.uploadVideoAttachment,
    removeVideo: inspectionsService.removeVideoAttachment,
    getVideoAccess: inspectionsService.getVideoAttachmentAccess,
    labels: {
      loadError: "Não foi possível carregar os vídeos da inspeção.",
      uploadSuccess: "Vídeo anexado ao relatório de inspeção.",
      uploadError: "Não foi possível anexar o vídeo à inspeção.",
      removeSuccess: "Vídeo removido da inspeção.",
      removeError: "Não foi possível remover o vídeo da inspeção.",
      accessError: "Não foi possível abrir o vídeo da inspeção.",
    },
  });

  const loadData = useCallback(async () => {
    try {
      setFetching(true);
      setLoadError(null);
      const [sitesData, usersData] = activeCompanyId
        ? await Promise.all([
            sitesService.findPaginated({
              page: 1,
              limit: 200,
              companyId: activeCompanyId,
            }),
            usersService.findPaginated({
              page: 1,
              limit: 200,
              companyId: activeCompanyId,
            }),
          ])
        : [
            { data: [], total: 0, page: 1, lastPage: 1 },
            { data: [], total: 0, page: 1, lastPage: 1 },
          ];

      setSites(sortByName(sitesData.data));
      setUsers(sortByName(usersData.data));

      if (sitesData.lastPage > 1) {
        toast.warning(
          "A lista de sites foi limitada aos primeiros 200 registros.",
        );
      }
      if (usersData.lastPage > 1) {
        toast.warning(
          "A lista de usuários foi limitada aos primeiros 200 registros.",
        );
      }

        if (id) {
          const [inspection, pdfAccess] = await Promise.all([
            inspectionsService.findOne(id),
            inspectionsService.getPdfAccess(id),
          ]);
          reset(
            buildDefaultValues({
              site_id: inspection.site_id,
            setor_area: inspection.setor_area,
            tipo_inspecao: inspection.tipo_inspecao,
            data_inspecao: inspection.data_inspecao,
            horario: inspection.horario,
            responsavel_id: inspection.responsavel_id,
            objetivo: inspection.objetivo || "",
            descricao_local_atividades:
              inspection.descricao_local_atividades || "",
            metodologia: inspection.metodologia || [],
            perigos_riscos: inspection.perigos_riscos || [],
              plano_acao: inspection.plano_acao || [],
              evidencias: inspection.evidencias || [],
              conclusao: inspection.conclusao || "",
            }),
          );
          setInspectionHasFinalPdf(pdfAccess.hasFinalPdf);
          setEvidenceFiles({});
        } else {
          reset(buildDefaultValues());
          setInspectionHasFinalPdf(false);
          setEvidenceFiles({});
        }
      } catch (error) {
      console.error("Erro ao carregar formulário de inspeção:", error);
      setLoadError(
        "Não foi possível carregar os dados necessários para a inspeção.",
      );
      toast.error("Erro ao carregar o formulário de inspeção.");
    } finally {
      setFetching(false);
    }
  }, [activeCompanyId, id, reset]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const currentVideo = videoRef.current;

    return () => {
      if (currentVideo?.srcObject) {
        const stream = currentVideo.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const openCamera = async (index: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraTargetIndex(index);
    } catch (error) {
      console.error("Erro ao acessar câmera:", error);
      toast.error("Não foi possível acessar a câmera deste dispositivo.");
    }
  };

  const closeCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraTargetIndex(null);
  };

  const capturePhoto = () => {
    if (cameraTargetIndex === null || !videoRef.current || !canvasRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");

    if (!context) {
      toast.error("Não foi possível gerar a imagem capturada.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL("image/jpeg", 0.88);

    setValue(`evidencias.${cameraTargetIndex}.url`, imageData, {
      shouldDirty: true,
      shouldValidate: true,
    });

    if (!getValues(`evidencias.${cameraTargetIndex}.descricao`)) {
      setValue(
        `evidencias.${cameraTargetIndex}.descricao`,
        "Registro fotográfico da inspeção",
        {
          shouldDirty: true,
          shouldValidate: true,
        },
      );
    }

    toast.success("Foto capturada e vinculada à evidência.");
    closeCamera();
  };

  const toggleMetodologia = (option: string) => {
    const current = getValues("metodologia") || [];
    const next = current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option];
    setValue("metodologia", next, { shouldDirty: true, shouldValidate: true });
  };

  const applyRiskSuggestion = (index: number) => {
    const currentRisk = getValues(`perigos_riscos.${index}`);
    const suggestion = getRiskSuggestion(
      currentRisk?.severidade,
      currentRisk?.probabilidade,
    );

    if (!suggestion) {
      toast.error(
        "Selecione severidade e probabilidade antes de aplicar a sugestão.",
      );
      return;
    }

    setValue(`perigos_riscos.${index}.nivel_risco`, suggestion.nivel, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(
      `perigos_riscos.${index}.classificacao_risco`,
      suggestion.classificacao,
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
    toast.success(`Sugestão aplicada: ${suggestion.label}.`);
  };

  const createActionFromRisk = (index: number) => {
    const risk = getValues(`perigos_riscos.${index}`);
    if (!risk?.perigo_fator_risco && !risk?.acoes_necessarias) {
      toast.error(
        "Preencha o risco ou a ação necessária antes de gerar uma ação.",
      );
      return;
    }

    appendAction({
      acao:
        risk.acoes_necessarias ||
        `Tratar risco identificado: ${risk.perigo_fator_risco}`.trim(),
      responsavel: risk.responsavel || "",
      prazo: risk.prazo || "",
      status: "Pendente",
    });
    toast.success("Ação adicionada ao plano a partir do risco selecionado.");
  };

  const getGovernedPdfAccess = async (inspectionId: string) =>
    inspectionsService.getPdfAccess(inspectionId);

  const handlePrintAfterSave = async (inspectionId: string) => {
    toast.info("Preparando impressão do relatório...");
    const access = await getGovernedPdfAccess(inspectionId);

    if (access.hasFinalPdf && access.url) {
      openPdfForPrint(access.url, () => {
        toast.info(
          "Pop-up bloqueado. Abrimos o PDF final na mesma aba para impressão.",
        );
      });
      return;
    }

    if (access.hasFinalPdf) {
      toast.warning(
        access.message ||
          "O PDF final da inspeção foi emitido, mas a URL segura não está disponível agora.",
      );
      return;
    }

    toast.info(
      access.message ||
        "PDF final ainda não emitido. Gerando uma versão local para impressão.",
    );

    const fullInspection = await inspectionsService.findOne(inspectionId);
    const result = (await generateInspectionPdf(fullInspection, {
      save: false,
      output: "base64",
      draftWatermark: false,
    })) as { base64: string } | undefined;

    if (!result?.base64) {
      throw new Error("Falha ao gerar o PDF da inspeção para impressão.");
    }

    const fileURL = URL.createObjectURL(base64ToPdfBlob(result.base64));
    openPdfForPrint(fileURL, () => {
      toast.info("Pop-up bloqueado. Abrimos o PDF na mesma aba para impressão.");
    });
    setTimeout(() => URL.revokeObjectURL(fileURL), 60_000);
  };

  const submitInspection = async (
    data: InspectionFormData,
    options?: { printAfterSave?: boolean },
  ) => {
    const shouldPrintAfterSave = options?.printAfterSave ?? false;
    try {
      setLoading(true);
      setSubmitError(null);
      const isBrowserOffline =
        typeof navigator !== "undefined" ? !navigator.onLine : false;

      // Separar evidências com arquivo local para upload dedicado
      const evidenciasComArquivoIndices = Object.entries(evidenceFiles)
        .filter(([, files]) => files && files.length > 0)
        .map(([idx]) => Number(idx));

      const evidenciasSemArquivo = (data.evidencias || []).filter(
        (_item, idx) => !evidenciasComArquivoIndices.includes(idx),
      );

      const inlineEvidence = isBrowserOffline
        ? (
            await Promise.all(
              evidenciasComArquivoIndices.flatMap((idx) =>
                (evidenceFiles[idx] || []).map(async (file) => ({
                  descricao:
                    data.evidencias?.[idx]?.descricao ||
                    `Foto de campo - ${file.name}`,
                  url: await fileToDataUrl(file),
                  original_name: file.name,
                })),
              ),
            )
          ).filter((item) => item.url)
        : [];

      const payload = {
        ...data,
        evidencias: [...evidenciasSemArquivo, ...inlineEvidence],
      };

      let inspectionId = id;
      let offlineQueued = false;
      if (id) {
        const updated = await inspectionsService.update(id, payload);
        inspectionId = updated.id;
        offlineQueued = Boolean(
          (updated as Inspection & { offlineQueued?: boolean }).offlineQueued,
        );
        toast.success(
          offlineQueued
            ? "Inspecao salva na fila offline. Ela sera sincronizada quando a conexao voltar."
            : "Relatório de inspeção atualizado com sucesso.",
        );
      } else {
        const created = await inspectionsService.create(payload);
        inspectionId = created.id;
        offlineQueued = Boolean(
          (created as Inspection & { offlineQueued?: boolean }).offlineQueued,
        );
        toast.success(
          offlineQueued
            ? "Inspecao registrada no modo offline. O envio sera retomado automaticamente."
            : "Relatório de inspeção criado com sucesso.",
        );
      }

      // Upload dos arquivos de evidência (se houver)
      if (inspectionId && !offlineQueued) {
        let inlineFallbackCount = 0;
        for (const idx of evidenciasComArquivoIndices) {
          const files = evidenceFiles[idx];
          if (!files?.length) continue;
          const descricao = data.evidencias?.[idx]?.descricao;
          for (const file of files) {
            const attachResult = await inspectionsService.attachEvidence(
              inspectionId,
              file,
              descricao,
            );
            if (attachResult.degraded) {
              inlineFallbackCount += 1;
            }
          }
        }
        if (inlineFallbackCount > 0) {
          toast.warning(
            `${inlineFallbackCount} evidência(s) foram armazenadas em modo degradado porque o storage externo estava indisponível.`,
          );
        }
      }

      if (draftStorageKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
        setDraftSavedAt(null);
      }

      if (shouldPrintAfterSave) {
        if (offlineQueued || !inspectionId) {
          toast.info(
            "Relatório salvo em modo offline. A impressão ficará disponível após sincronização.",
          );
        } else {
          try {
            await handlePrintAfterSave(inspectionId);
          } catch (printError) {
            console.error(
              "Erro ao preparar impressão automática da inspeção:",
              printError,
            );
            toast.warning(
              "Relatório salvo, mas não foi possível abrir a impressão automática.",
            );
          }
        }
      }

      router.push("/dashboard/inspections");
      router.refresh();
    } catch (error) {
      console.error("Erro ao salvar relatório de inspeção:", error);
      const message = getFormErrorMessage(error, {
        badRequest:
          "Os dados da inspeção estão inválidos. Revise site, responsável, riscos e plano de ação.",
        unauthorized: "Sua sessão expirou. Faça login novamente.",
        forbidden:
          "Você não tem permissão para salvar este relatório de inspeção.",
        server:
          "Erro interno ao salvar a inspeção. Tente novamente em instantes.",
        fallback: "Não foi possível salvar a inspeção. Tente novamente.",
      });
      setSubmitError(message);
      toast.error("Erro ao salvar relatório de inspeção.");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: InspectionFormData) => {
    await submitInspection(data);
  };

  const onInvalid = (formErrors: FieldErrors<InspectionFormData>) => {
    const firstError = findFirstErrorPath(formErrors);
    if (firstError) {
      setFocus(firstError as never);
    }
    toast.error("Revise os campos obrigatórios antes de salvar.");
  };

  if (fetching) {
    return (
      <PageLoadingState
        title="Carregando formulário de inspeção"
        description="Buscando site, responsáveis e estrutura do relatório."
        cards={4}
        tableRows={0}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar o relatório de inspeção"
        description={loadError}
        action={
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadData()}
          >
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <>
      <form
        onSubmit={handleSubmit(onSubmit, onInvalid)}
        className={cn(
          "ds-form-page space-y-6 pb-12",
          formControlsScopeClassName,
          isFieldMode && "mx-auto max-w-5xl space-y-4 pb-32",
        )}
      >
        {inspectionReadOnlyMessage ? (
          <div className="rounded-[var(--ds-radius-xl)] border border-[color:var(--ds-color-warning)]/25 bg-[color:var(--ds-color-warning-subtle)] px-5 py-4 text-sm text-[var(--ds-color-text-secondary)]">
            <p className="font-semibold text-[var(--ds-color-text-primary)]">
              Relatório travado para edição
            </p>
            <p className="mt-1">{inspectionReadOnlyMessage}</p>
          </div>
        ) : null}
        <FormPageLayout
          eyebrow={isFieldMode ? "Modo campo" : "Inspeção operacional"}
          title={
            id
              ? "Edição do relatório de inspeção"
              : isPhotographicReport
                ? "Novo relatório fotográfico"
                : "Novo relatório de inspeção"
          }
          description={
            isFieldMode
              ? "Fluxo reduzido para celular, com captura rápida de evidências, botões maiores e tolerância ao modo offline."
              : "Organizamos o fluxo para registrar contexto, avaliar riscos, desdobrar ações e fechar a inspeção com mais clareza."
          }
          icon={<ClipboardList className="h-5 w-5" />}
          actions={
            <div className={cn("flex flex-wrap items-center gap-2", isFieldMode && "w-full md:w-auto")}>
              {openNcWithSophieHref ? (
                <Link
                  href={openNcWithSophieHref}
                  className="ds-badge ds-badge--warning"
                >
                  <Bot className="h-3.5 w-3.5" />
                  Abrir NC com SOPHIE
                </Link>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/dashboard/inspections")}
                className={cn(isFieldMode && "flex-1 min-w-[150px]")}
              >
                Cancelar
              </Button>
            </div>
          }
          summary={
            <section className="ds-metric-strip">
              <article className="ds-metric-item">
                <p className="ds-metric-item__label">Metodologias</p>
                <div className="ds-metric-item__value">{metodologiaSelecionada.length}</div>
                <p className="ds-metric-item__note">
                  {draftSavedAt
                    ? `Rascunho salvo às ${new Date(draftSavedAt).toLocaleTimeString("pt-BR")}`
                    : "Rascunho salvo automaticamente"}
                </p>
              </article>
              <article className="ds-metric-item ds-metric-item--warning">
                <p className="ds-metric-item__label">Riscos</p>
                <div className="ds-metric-item__value">{riscos.length}</div>
                <p className="ds-metric-item__note">{highRiskCount} altos ou muito altos</p>
              </article>
              <article className="ds-metric-item ds-metric-item--primary">
                <p className="ds-metric-item__label">Ações pendentes</p>
                <div className="ds-metric-item__value">{pendingActions}</div>
                <p className="ds-metric-item__note">Priorize o que ainda depende de execução.</p>
              </article>
              <article className="ds-metric-item ds-metric-item--success">
                <p className="ds-metric-item__label">Evidências</p>
                <div className="ds-metric-item__value">{evidencias.length}</div>
                <p className="ds-metric-item__note">
                  {watchedObjective || watchedDescricaoLocalAtividades
                    ? "Contexto em edição"
                    : "Comece por local, objetivo e fotos"}
                </p>
              </article>
            </section>
          }
          footer={
            <div className={cn("flex flex-col gap-3 md:flex-row md:items-center md:justify-between", isFieldMode && "gap-4")}>
              <div>
                <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  {isFieldMode ? "Pronto para salvar em campo" : "Relatório pronto para salvar"}
                </p>
                <p className="text-sm text-[var(--ds-color-text-muted)]">
                  {isFieldMode
                    ? "Se a conexão cair, o relatório entra na fila local e sincroniza quando a internet voltar."
                    : "Revise riscos críticos, ações pendentes e evidências antes de concluir."}
                </p>
              </div>
              <div className={cn("flex flex-wrap items-center gap-2", isFieldMode && "grid grid-cols-2")}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push("/dashboard/inspections")}
                  size={isFieldMode ? "lg" : "md"}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void handleSubmit(
                      (data) => submitInspection(data, { printAfterSave: true }),
                      onInvalid,
                    )();
                  }}
                  disabled={inspectionHasFinalPdf || loading || isSubmitting}
                  size={isFieldMode ? "lg" : "md"}
                  className={cn(isFieldMode && "col-span-1")}
                >
                  <Printer className="h-4 w-4" />
                  Salvar e imprimir
                </Button>
                <Button
                  type="submit"
                  loading={loading || isSubmitting}
                  disabled={inspectionHasFinalPdf}
                  size={isFieldMode ? "lg" : "md"}
                  className={cn(isFieldMode && "col-span-1")}
                >
                  <Save className="h-4 w-4" />
                  {id ? "Salvar alterações" : isFieldMode ? "Salvar agora" : "Salvar relatório"}
                </Button>
              </div>
            </div>
          }
        >

        <fieldset
          disabled={inspectionHasFinalPdf}
          className={cn("space-y-6", inspectionHasFinalPdf && "opacity-80")}
        >
        {submitError ? (
          <div className="rounded-[var(--ds-radius-lg)] border border-[color:var(--ds-color-danger)]/30 bg-[color:var(--ds-color-danger)]/10 px-4 py-3 text-sm text-[var(--ds-color-text-primary)]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-[var(--ds-color-danger)]" />
              <div>
                <p className="font-semibold">
                  Não conseguimos salvar este relatório.
                </p>
                <p className="mt-1 text-[13px] text-[var(--ds-color-text-secondary)]">
                  {submitError}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <section className="ds-form-section">
            <SectionHeader
              title="Contexto da inspeção"
              description="Defina onde a inspeção ocorreu, quem conduziu a avaliação e qual é o recorte do relatório."
              icon={<ClipboardCheck className="h-5 w-5" />}
              badge="Etapa 1"
            />
            <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2">
                <label htmlFor="inspection-site-id" className={labelClassName}>
                  Site / unidade
                </label>
                <select
                  id="inspection-site-id"
                  {...register("site_id")}
                  className={nativeSelectClassName}
                  aria-invalid={errors.site_id ? "true" : undefined}
                >
                  <option value="">Selecione o site</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.nome}
                    </option>
                  ))}
                </select>
                <FieldErrorText message={errors.site_id?.message} />
              </div>
              <div>
                <label htmlFor="inspection-type" className={labelClassName}>
                  Tipo de inspeção
                </label>
                <select
                  id="inspection-type"
                  {...register("tipo_inspecao")}
                  className={nativeSelectClassName}
                >
                  {inspectionTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <FieldErrorText message={errors.tipo_inspecao?.message} />
              </div>
              <div>
                <label htmlFor="inspection-area" className={labelClassName}>
                  Setor / área
                </label>
                <Input
                  id="inspection-area"
                  placeholder="Ex.: Central de concreto"
                  {...register("setor_area")}
                />
                <FieldErrorText message={errors.setor_area?.message} />
              </div>
              <div>
                <label htmlFor="inspection-date" className={labelClassName}>
                  Data da inspeção
                </label>
                <Input
                  id="inspection-date"
                  type="date"
                  {...register("data_inspecao")}
                />
                <FieldErrorText message={errors.data_inspecao?.message} />
              </div>
              <div>
                <label htmlFor="inspection-time" className={labelClassName}>
                  Horário
                </label>
                <Input
                  id="inspection-time"
                  type="time"
                  {...register("horario")}
                />
                <FieldErrorText message={errors.horario?.message} />
              </div>
              <div className="md:col-span-2">
                <label
                  htmlFor="inspection-responsible"
                  className={labelClassName}
                >
                  Responsável pela inspeção
                </label>
                <select
                  id="inspection-responsible"
                  {...register("responsavel_id")}
                  className={nativeSelectClassName}
                >
                  <option value="">Selecione o responsável</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.nome}
                      {user.funcao ? ` • ${user.funcao}` : ""}
                    </option>
                  ))}
                </select>
                <FieldErrorText message={errors.responsavel_id?.message} />
              </div>
            </div>
            </div>
        </section>

        <section className="ds-form-section">
            <SectionHeader
              title="Objetivo, escopo e metodologia"
              description="Registre o propósito da inspeção, o contexto operacional e as técnicas que sustentaram a avaliação."
              icon={<Sparkles className="h-5 w-5" />}
              badge="Etapa 2"
            />
            <div className="space-y-6">

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label htmlFor="inspection-goal" className={labelClassName}>
                  Objetivo do relatório
                </label>
                <Textarea
                  id="inspection-goal"
                  rows={5}
                  placeholder="Ex.: Verificar conformidade de frentes de trabalho, EPCs, organização e condições seguras."
                  {...register("objetivo")}
                />
              </div>

              <div>
                <label htmlFor="inspection-context" className={labelClassName}>
                  Descrição do local e das atividades
                </label>
                <Textarea
                  id="inspection-context"
                  rows={5}
                  placeholder="Descreva a frente de serviço, as atividades observadas, equipamentos, interferências e pontos relevantes."
                  {...register("descricao_local_atividades")}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className={labelClassName}>Metodologia utilizada</p>
                <p className="text-sm text-[var(--ds-color-text-muted)]">
                  Selecione apenas as abordagens efetivamente usadas. Isso
                  melhora a consistência do relatório e do PDF.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {methodologyOptions.map((option) => {
                  const checked = metodologiaSelecionada.includes(option);

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleMetodologia(option)}
                      className={cn(
                        "flex items-start gap-3 rounded-[var(--ds-radius-md)] border px-4 py-3 text-left transition-all duration-[var(--ds-motion-base)]",
                        checked
                          ? "border-[var(--ds-color-action-primary)] bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-sm)]"
                          : "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)] hover:border-[var(--ds-color-border-strong)] hover:bg-[var(--ds-color-surface-elevated)]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[10px]",
                          checked
                            ? "border-[var(--ds-color-action-primary)] bg-[var(--ds-color-action-primary)] text-white"
                            : "border-[var(--ds-color-border-default)] text-transparent",
                        )}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                      </span>
                      <span className="text-sm font-medium">{option}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            </div>
        </section>

        <section className="ds-form-section">
            <SectionHeader
              title="Perigos, riscos e controles"
              description="Para cada achado, registre o cenário, os expostos, os controles existentes e a ação necessária."
              icon={<ShieldAlert className="h-5 w-5" />}
              badge="Etapa 3"
            />
            <div className="space-y-6">

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--ds-color-text-muted)]">
                Use a sugestão de risco para acelerar a classificação, mas
                revise antes de salvar.
              </p>
              <Button
                type="button"
                variant="secondary"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => appendRisk(buildDefaultRisk())}
              >
                Adicionar risco
              </Button>
            </div>

            {riskFields.length === 0 ? (
              <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/30 px-5 py-8 text-center">
                <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  Nenhum risco foi adicionado ainda.
                </p>
                <p className="mt-2 text-sm text-[var(--ds-color-text-muted)]">
                  Comece pelos riscos mais críticos da frente de serviço e
                  transforme cada um em ação quando necessário.
                </p>
              </div>
            ) : null}

            <div className="space-y-4">
              {riskFields.map((field, index) => {
                const currentRisk = riscos[index];
                const suggestion = getRiskSuggestion(
                  currentRisk?.severidade,
                  currentRisk?.probabilidade,
                );

                return (
                  <div key={field.id} className="ds-form-array-item">
                    <div className="flex flex-col gap-3 border-b border-[var(--ds-color-border-subtle)] pb-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-[var(--ds-color-text-primary)]">
                          Risco #{index + 1}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                          Estruture o achado e deixe o plano de ação pronto
                          para execução.
                        </p>
                      </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {suggestion ? (
                            <span className="ds-badge ds-badge--warning">
                              Score {suggestion.score}: {suggestion.label}
                            </span>
                          ) : (
                            <span className="ds-badge">
                              Defina severidade e probabilidade
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRisk(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Remover
                          </Button>
                        </div>
                    </div>
                    <div className="space-y-5 pt-5">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <label className={labelClassName}>
                            Grupo de risco
                          </label>
                          <select
                            {...register(`perigos_riscos.${index}.grupo_risco`)}
                            className={nativeSelectClassName}
                          >
                            <option value="">Selecione</option>
                            {riskGroupOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <FieldErrorText
                            message={
                              errors.perigos_riscos?.[index]?.grupo_risco
                                ?.message
                            }
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className={labelClassName}>
                            Perigo / fator de risco
                          </label>
                          <Input
                            placeholder="Ex.: trabalho em altura sem proteção completa"
                            {...register(
                              `perigos_riscos.${index}.perigo_fator_risco`,
                            )}
                          />
                          <FieldErrorText
                            message={
                              errors.perigos_riscos?.[index]?.perigo_fator_risco
                                ?.message
                            }
                          />
                        </div>
                        <div>
                          <label className={labelClassName}>
                            Fonte / circunstância
                          </label>
                          <Input
                            placeholder="Ex.: guarda-corpo incompleto"
                            {...register(
                              `perigos_riscos.${index}.fonte_circunstancia`,
                            )}
                          />
                          <FieldErrorText
                            message={
                              errors.perigos_riscos?.[index]
                                ?.fonte_circunstancia?.message
                            }
                          />
                        </div>
                        <div>
                          <label className={labelClassName}>
                            Trabalhadores expostos
                          </label>
                          <Input
                            placeholder="Ex.: equipe de montagem"
                            {...register(
                              `perigos_riscos.${index}.trabalhadores_expostos`,
                            )}
                          />
                          <FieldErrorText
                            message={
                              errors.perigos_riscos?.[index]
                                ?.trabalhadores_expostos?.message
                            }
                          />
                        </div>
                        <div>
                          <label className={labelClassName}>
                            Tipo de exposição
                          </label>
                          <select
                            {...register(
                              `perigos_riscos.${index}.tipo_exposicao`,
                            )}
                            className={nativeSelectClassName}
                          >
                            <option value="">Selecione</option>
                            {exposureTypeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <FieldErrorText
                            message={
                              errors.perigos_riscos?.[index]?.tipo_exposicao
                                ?.message
                            }
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelClassName}>
                          Medidas existentes
                        </label>
                        <Textarea
                          rows={3}
                          placeholder="Descreva EPCs, EPIs, sinalização, procedimentos ou barreiras já existentes."
                          {...register(
                            `perigos_riscos.${index}.medidas_existentes`,
                          )}
                        />
                        <FieldErrorText
                          message={
                            errors.perigos_riscos?.[index]?.medidas_existentes
                              ?.message
                          }
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <label className={labelClassName}>Severidade</label>
                          <select
                            {...register(`perigos_riscos.${index}.severidade`)}
                            className={nativeSelectClassName}
                          >
                            <option value="">Selecione</option>
                            {severityOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <FieldErrorText
                            message={
                              errors.perigos_riscos?.[index]?.severidade
                                ?.message
                            }
                          />
                        </div>
                        <div>
                          <label className={labelClassName}>
                            Probabilidade
                          </label>
                          <select
                            {...register(
                              `perigos_riscos.${index}.probabilidade`,
                            )}
                            className={nativeSelectClassName}
                          >
                            <option value="">Selecione</option>
                            {probabilityOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <FieldErrorText
                            message={
                              errors.perigos_riscos?.[index]?.probabilidade
                                ?.message
                            }
                          />
                        </div>
                        <div>
                          <label className={labelClassName}>
                            Nível de risco
                          </label>
                          <select
                            {...register(`perigos_riscos.${index}.nivel_risco`)}
                            className={nativeSelectClassName}
                          >
                            <option value="">Selecione</option>
                            {riskLevelOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <FieldErrorText
                            message={
                              errors.perigos_riscos?.[index]?.nivel_risco
                                ?.message
                            }
                          />
                        </div>
                        <div>
                          <label className={labelClassName}>
                            Classificação
                          </label>
                          <select
                            {...register(
                              `perigos_riscos.${index}.classificacao_risco`,
                            )}
                            className={nativeSelectClassName}
                          >
                            <option value="">Selecione</option>
                            {riskClassificationOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <FieldErrorText
                            message={
                              errors.perigos_riscos?.[index]
                                ?.classificacao_risco?.message
                            }
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-3">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => applyRiskSuggestion(index)}
                        >
                          <Sparkles className="h-4 w-4" />
                          Aplicar sugestão de risco
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => createActionFromRisk(index)}
                        >
                          <Plus className="h-4 w-4" />
                          Criar ação no plano
                        </Button>
                        <p className="text-xs text-[var(--ds-color-text-muted)]">
                          A sugestão usa severidade x probabilidade para
                          acelerar a classificação.
                        </p>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-3">
                        <div className="xl:col-span-2">
                          <label className={labelClassName}>
                            Ações necessárias
                          </label>
                          <Textarea
                            rows={3}
                            placeholder="Descreva a correção ou bloqueio operacional necessário."
                            {...register(
                              `perigos_riscos.${index}.acoes_necessarias`,
                            )}
                          />
                          <FieldErrorText
                            message={
                              errors.perigos_riscos?.[index]?.acoes_necessarias
                                ?.message
                            }
                          />
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className={labelClassName}>Prazo</label>
                            <Input
                              type="date"
                              {...register(`perigos_riscos.${index}.prazo`)}
                            />
                            <FieldErrorText
                              message={
                                errors.perigos_riscos?.[index]?.prazo?.message
                              }
                            />
                          </div>
                          <div>
                            <label className={labelClassName}>
                              Responsável pela ação
                            </label>
                            <Input
                              placeholder="Ex.: Supervisor da frente"
                              {...register(
                                `perigos_riscos.${index}.responsavel`,
                              )}
                            />
                            <FieldErrorText
                              message={
                                errors.perigos_riscos?.[index]?.responsavel
                                  ?.message
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
        </section>

        <section className="ds-form-section">
            <SectionHeader
              title="Plano de ação"
              description="Consolide as ações corretivas e acompanhe o status de execução diretamente no relatório."
              icon={<ClipboardCheck className="h-5 w-5" />}
              badge="Etapa 4"
            />
            <div className="space-y-6">

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--ds-color-text-muted)]">
                Use o plano para acompanhar pendências. Ações concluídas ou
                canceladas saem da contagem pendente.
              </p>
              <Button
                type="button"
                variant="secondary"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => appendAction(buildDefaultAction())}
              >
                Adicionar ação
              </Button>
            </div>

            {actionFields.length === 0 ? (
              <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/30 px-5 py-8 text-center">
                <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  Nenhuma ação cadastrada.
                </p>
                <p className="mt-2 text-sm text-[var(--ds-color-text-muted)]">
                  Gere ações a partir dos riscos ou cadastre uma ação manual
                  para acompanhamento.
                </p>
              </div>
            ) : null}

            <div className="space-y-4">
              {actionFields.map((field, index) => (
                <div key={field.id} className="ds-form-array-item">
                  <div className="flex flex-row items-start justify-between gap-3 border-b border-[var(--ds-color-border-subtle)] pb-4">
                    <div>
                      <h3 className="text-base font-semibold text-[var(--ds-color-text-primary)]">
                        Ação #{index + 1}
                      </h3>
                      <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                        Descreva claramente o que precisa acontecer e quem
                        conduz.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAction(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                  <div className="space-y-4 pt-5">
                    <div>
                      <label className={labelClassName}>Ação</label>
                      <Textarea
                        rows={3}
                        placeholder="Ex.: instalar guarda-corpo completo e reforçar bloqueio da área."
                        {...register(`plano_acao.${index}.acao`)}
                      />
                      <FieldErrorText
                        message={errors.plano_acao?.[index]?.acao?.message}
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className={labelClassName}>Responsável</label>
                        <Input
                          placeholder="Ex.: encarregado da obra"
                          {...register(`plano_acao.${index}.responsavel`)}
                        />
                        <FieldErrorText
                          message={
                            errors.plano_acao?.[index]?.responsavel?.message
                          }
                        />
                      </div>
                      <div>
                        <label className={labelClassName}>Prazo</label>
                        <Input
                          type="date"
                          {...register(`plano_acao.${index}.prazo`)}
                        />
                        <FieldErrorText
                          message={errors.plano_acao?.[index]?.prazo?.message}
                        />
                      </div>
                      <div>
                        <label className={labelClassName}>Status</label>
                        <select
                          {...register(`plano_acao.${index}.status`)}
                          className={nativeSelectClassName}
                        >
                          {actionStatusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        <FieldErrorText
                          message={errors.plano_acao?.[index]?.status?.message}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </div>
        </section>

        <section className="ds-form-section">
            <SectionHeader
              title="Evidências e conclusão"
              description="Feche a inspeção com rastreabilidade. Inclua evidências e uma conclusão objetiva sobre a condição observada."
              icon={<Camera className="h-5 w-5" />}
              badge="Etapa 5"
            />
            <div className="space-y-6">

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--ds-color-text-muted)]">
                Adicione links, fotos e outras evidências relevantes. O PDF
                passa a refletir melhor esse conteúdo.
              </p>
              <Button
                type="button"
                variant="secondary"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => appendEvidence(buildDefaultEvidence())}
              >
                Adicionar evidência
              </Button>
            </div>

            {evidenceFields.length === 0 ? (
              <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/30 px-5 py-8 text-center">
                <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  Nenhuma evidência registrada.
                </p>
                <p className="mt-2 text-sm text-[var(--ds-color-text-muted)]">
                  Sempre que possível, registre foto ou link de apoio para
                  sustentar os achados da inspeção.
                </p>
              </div>
            ) : null}

            <div className="space-y-4">
              {evidenceFields.map((field, index) => {
                const evidenceUrl = evidencias[index]?.url || "";
                const isImage = evidenceUrl.startsWith("data:image");

                return (
                  <div key={field.id} className="ds-form-array-item">
                    <div className="flex flex-row items-start justify-between gap-3 border-b border-[var(--ds-color-border-subtle)] pb-4">
                      <div>
                        <h3 className="text-base font-semibold text-[var(--ds-color-text-primary)]">
                          Evidência #{index + 1}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                          Descreva o que a evidência comprova e como acessá-la.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEvidence(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                    <div className="space-y-4 pt-5">
                      <div>
                        <label className={labelClassName}>Descrição</label>
                        <Input
                          placeholder="Ex.: Foto do guarda-corpo com abertura lateral"
                          {...register(`evidencias.${index}.descricao`)}
                        />
                        <FieldErrorText
                          message={
                            errors.evidencias?.[index]?.descricao?.message
                          }
                        />
                      </div>
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
                        <div>
                          <label className={labelClassName}>
                            URL ou referência
                          </label>
                          <Input
                            placeholder="https://... ou link interno"
                            {...register(`evidencias.${index}.url`)}
                          />
                          <FieldErrorText
                            message={errors.evidencias?.[index]?.url?.message}
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => openCamera(index)}
                          >
                            <Camera className="h-4 w-4" />
                            Usar câmera
                          </Button>
                        </div>
                        <div className="flex items-end gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(event) => {
                              const files = Array.from(event.target.files || []);
                              setEvidenceFiles((prev) => ({ ...prev, [index]: files }));
                            }}
                            className="hidden"
                            id={`evidence-file-${index}`}
                          />
                          <label
                            htmlFor={`evidence-file-${index}`}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm font-semibold text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-sm)] transition-all hover:border-[var(--ds-color-border-strong)] hover:bg-[var(--ds-color-surface-elevated)]"
                          >
                            <Camera className="h-4 w-4" />
                            Anexar foto
                          </label>
                        </div>
                      </div>
                      {isImage ? (
                        <div className="overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={evidenceUrl}
                            alt={`Pré-visualização da evidência ${index + 1}`}
                            className="max-h-72 w-full object-cover"
                          />
                        </div>
                      ) : evidenceFiles[index]?.length ? (
                        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-3 text-sm text-[var(--ds-color-text-primary)]">
                          {evidenceFiles[index]
                            ?.map((file) => file.name)
                            .join(", ")}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <label htmlFor="inspection-conclusion" className={labelClassName}>
                Conclusão
              </label>
              <Textarea
                id="inspection-conclusion"
                rows={5}
                placeholder="Feche o relatório informando o cenário geral, os principais riscos encontrados e o nível de urgência das ações."
                {...register("conclusao")}
              />
            </div>

            <DocumentVideoPanel
              title="Vídeos governados"
              description="Anexe vídeos oficiais do relatório de inspeção para complementar as evidências com storage governado."
              documentId={id}
              canManage={canManageInspections}
              locked={inspectionHasFinalPdf}
              lockMessage={
                inspectionHasFinalPdf
                  ? "O relatório de inspeção já possui PDF final emitido."
                  : null
              }
              attachments={documentVideos.attachments}
              loading={documentVideos.loading}
              uploading={documentVideos.uploading}
              removingId={documentVideos.removingId}
              onUpload={documentVideos.handleUpload}
              onRemove={documentVideos.handleRemove}
              resolveAccess={documentVideos.resolveAccess}
            />
            </div>
        </section>

        </fieldset>

        </FormPageLayout>
      </form>

      {cameraTargetIndex !== null ? (
        <div className="ds-form-page fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card tone="elevated" padding="lg" className="w-full max-w-3xl">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Capturar evidência fotográfica</CardTitle>
                <CardDescription>
                  Posicione a câmera para registrar o achado e anexe a imagem
                  diretamente ao relatório.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeCamera}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="max-h-[60vh] w-full object-cover"
                />
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={closeCamera}>
                  Cancelar
                </Button>
                <Button type="button" onClick={capturePhoto}>
                  <Camera className="h-4 w-4" />
                  Capturar foto
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
