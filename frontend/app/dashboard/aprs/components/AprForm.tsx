"use client";

import dynamic from "next/dynamic";
import {
  ChangeEvent,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  Apr,
  AprActivityTemplate,
  AprExcelImportPreview,
  AprRiskItemInput,
  aprsService,
} from "@/services/aprsService";
import { activitiesService, Activity } from "@/services/activitiesService";
import { risksService, Risk } from "@/services/risksService";
import { episService, Epi } from "@/services/episService";
import { toolsService, Tool } from "@/services/toolsService";
import { machinesService, Machine } from "@/services/machinesService";
import { sitesService, Site } from "@/services/sitesService";
import { companiesService, Company } from "@/services/companiesService";
import { usersService, User } from "@/services/usersService";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Save,
  ArrowLeft,
  Sparkles,
  Loader2,
  Plus,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ClipboardList,
  ShieldCheck,
  FileText,
  Printer,
  Upload,
  Download,
  Minimize2,
  Maximize2,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { aiService } from "@/services/aiService";
import { isAiEnabled } from "@/lib/featureFlags";
import { signaturesService } from "@/services/signaturesService";
import { useFormSubmit } from "@/hooks/useFormSubmit";
import { AuditSection } from "@/components/AuditSection";
import { PageHeader } from "@/components/layout";
import { PageLoadingState } from "@/components/ui/state";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import { downloadExcel } from "@/lib/download-excel";
import { openPdfForPrint, openUrlInNewTab } from "@/lib/print-utils";
import type { AprLogEntry } from "./AprTimeline";
import { useAuth } from "@/context/AuthContext";
import type {
  SophieDraftChecklistSuggestion,
  SophieDraftRiskSuggestion,
} from "@/lib/sophie-draft-storage";
import { applyAprImportPreview } from "@/lib/apr-import";
import { aprSchema, type AprFormData } from "./aprForm.schema";
import { useAprCalculations } from "./useAprCalculations";
import { AprActionModal } from "./AprActionModal";
import { useAprDraft } from "../hooks/useAprDraft";
import { useApiStatus } from "@/hooks/useApiStatus";
import {
  type AprOfflineSyncStatus,
  type AprDraftPendingOfflineSync,
  createAprDraftMetadata,
  readAprDraft,
} from "./aprDraftStorage";
import { trackAprOfflineTelemetry } from "./aprOfflineTelemetry";
import { AprApprovalPanel } from "./AprApprovalPanel";
import { AprCompliancePanel } from "./AprCompliancePanel";
import { handleApiError } from "@/lib/error-handler";
import type { AprValidationResult } from "@/services/aprsService";
import {
  getOfflineQueueSnapshot,
  removeOfflineQueueItem,
  retryOfflineQueueItem,
} from "@/lib/offline-sync";
import { safeToLocaleString, toInputDateValue } from "@/lib/date/safeFormat";

const SignatureModal = dynamic(
  () =>
    import("../../checklists/components/SignatureModal").then(
      (module) => module.SignatureModal,
    ),
  { ssr: false },
);

const AprTimeline = dynamic(
  () => import("./AprTimeline").then((module) => module.AprTimeline),
  {
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-4 text-sm text-[var(--ds-color-text-secondary)]">
        Carregando histórico da APR...
      </div>
    ),
  },
);

const AprRiskRow = dynamic(() =>
  import("./AprRiskRow").then((module) => module.AprRiskRow),
);

const AprExecutiveSummary = dynamic(() =>
  import("./AprExecutiveSummary").then((module) => module.AprExecutiveSummary),
);

const loadAprPdfGenerator = () => import("@/lib/pdf/aprGenerator");
const loadPdfFileUtils = () => import("@/lib/pdf/pdfFile");

/* Schema movido para ./aprForm.schema.ts
   (mantemos o nome `aprSchema` via import para o zodResolver)
  // Campo interno: indica que o usuário anexou uma APR já preenchida e assinada (PDF).
  // Usado somente para validação/UX do wizard; não deve ser enviado para a API.
  pdf_signed: z.boolean().optional(),
  numero: z.string().min(1, "O número é obrigatório"),
  titulo: z.string().min(5, "O título deve ter pelo menos 5 caracteres"),
  descricao: z.string().optional(),
  data_inicio: z.string(),
  data_fim: z.string(),
  status: z.enum(["Pendente", "Aprovada", "Cancelada", "Encerrada"]),
  is_modelo: z.boolean().optional(),
  is_modelo_padrao: z.boolean().optional(),
  company_id: z.string().min(1, "Selecione uma empresa"),
  site_id: z.string().min(1, "Selecione um site"),
  elaborador_id: z.string().min(1, "Selecione um elaborador"),
  activities: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  epis: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  machines: z.array(z.string()).optional(),
  participants: z.array(z.string()).optional(),
  itens_risco: z
    .array(
      z.object({
        atividade_processo: z.string().optional(),
        agente_ambiental: z.string().optional(),
        condicao_perigosa: z.string().optional(),
        fontes_circunstancias: z.string().optional(),
        possiveis_lesoes: z.string().optional(),
        probabilidade: z.string().optional(),
        severidade: z.string().optional(),
        categoria_risco: z.string().optional(),
        medidas_prevencao: z.string().optional(),
        responsavel: z.string().optional(),
        prazo: z.string().optional(),
        status_acao: z.string().optional(),
      }),
    )
    .optional(),
  auditado_por_id: z.string().optional(),
  data_auditoria: z.string().optional(),
  resultado_auditoria: z.string().optional(),
  notas_auditoria: z.string().optional(),
});

type AprFormData = z.infer<typeof aprSchema>;
*/
type AprMutationPayload = Omit<AprFormData, "pdf_signed">;
type AprSubmitResult = {
  aprId?: string;
  offlineQueued?: boolean;
  offlineQueueItemId?: string;
  offlineQueueDeduplicated?: boolean;
};

interface AprFormProps {
  id?: string;
}

const APR_STEPS = [
  {
    id: 1,
    title: "Dados básicos",
    description: "Identificação, contexto, responsável e escopo.",
    icon: FileText,
  },
  {
    id: 2,
    title: "Riscos e controles",
    description: "Participantes, assinaturas e planilha técnica.",
    icon: ClipboardList,
  },
  {
    id: 3,
    title: "Revisão final",
    description: "Validação final e emissão governada.",
    icon: ShieldCheck,
  },
] as const;

const aprBackButtonClass =
  "group rounded-full p-2 text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[color:var(--ds-color-surface-muted)] hover:text-[var(--ds-color-text-primary)]";
const aprSectionTitleClass =
  "mb-3 text-sm font-bold text-[var(--ds-color-text-primary)]";
const aprLabelClass =
  "mb-1.5 block text-[13px] font-semibold text-[var(--ds-color-text-secondary)]";
const aprLabelCompactClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]";
const aprFieldClass =
  "w-full min-h-[2.875rem] rounded-[var(--ds-radius-md)] border border-[var(--component-field-border)] bg-[color:var(--component-field-bg)] px-4 py-2.5 text-base leading-6 text-[var(--component-field-text)] shadow-[var(--component-field-shadow)] transition-all focus:border-[var(--component-field-border-focus)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)]";
const aprFileFieldClass =
  "block w-full rounded-[var(--ds-radius-md)] border border-[var(--component-field-border)] bg-[color:var(--component-field-bg)] px-4 py-2.5 text-base text-[var(--component-field-text)] shadow-[var(--component-field-shadow)] transition-all focus:border-[var(--component-field-border-focus)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)] file:mr-4 file:rounded-[var(--ds-radius-sm)] file:border-0 file:bg-[color:var(--color-card-muted)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[var(--color-text-secondary)] hover:file:bg-[color:var(--ds-color-primary-subtle)]";
const aprFieldErrorClass =
  "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)]";
const aprFieldDisabledClass =
  "disabled:bg-[color:var(--color-card-muted)]/60 disabled:cursor-not-allowed disabled:opacity-60";
const aprCheckboxClass =
  "h-5 w-5 rounded border-[var(--component-field-border)] text-[var(--ds-color-action-primary)] transition-all focus:ring-[var(--ds-color-action-primary)]";
const aprErrorTextClass = "mt-1 text-xs text-[var(--ds-color-danger)]";
const aprSuccessButtonCompactClass =
  "rounded-[var(--ds-radius-md)] bg-[var(--component-button-success-bg)] px-3 py-2 text-xs font-semibold text-[var(--component-button-success-text)] shadow-[var(--ds-shadow-sm)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)] disabled:opacity-60";
const aprPrimaryCompactButtonClass =
  "rounded-[var(--ds-radius-md)] bg-[var(--component-button-primary-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text-inverse)] shadow-[var(--ds-shadow-sm)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)] disabled:opacity-60";
const aprSuccessButtonClass =
  "rounded-[var(--ds-radius-md)] bg-[var(--component-button-success-bg)] px-4 py-2 text-sm font-semibold text-[var(--component-button-success-text)] shadow-[var(--ds-shadow-sm)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)] disabled:opacity-60";
const aprNeutralButtonClass =
  "rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-secondary-active)] px-4 py-2 text-sm font-semibold text-[var(--ds-color-action-secondary-foreground)] shadow-[var(--ds-shadow-sm)] transition-colors hover:bg-[var(--ds-color-action-secondary-hover)] disabled:opacity-60";
const aprSoftPrimaryButtonClass =
  "rounded-[var(--ds-radius-md)] border border-[var(--ds-color-primary-border)] bg-[color:var(--ds-color-primary-subtle)] px-3 py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors hover:bg-[color:var(--ds-color-primary-subtle)]/78 disabled:opacity-60";
const aprInteractivePanelClass =
  "rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 shadow-[var(--component-card-shadow)] transition-shadow hover:shadow-[var(--component-card-shadow-elevated)]";
const aprSubtleMetaCardClass =
  "flex flex-col gap-1 rounded-[var(--ds-radius-lg)] border border-[var(--color-border-subtle)] bg-[color:var(--color-card)] p-3 text-sm text-[var(--color-text-secondary)]";
const aprWarningInlineClass =
  "rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-3 py-2 text-xs text-[var(--color-warning)]";
const aprDangerInlineClass =
  "rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-4 py-3 text-sm text-[var(--color-danger)]";
const aprGhostActionClass =
  "rounded-[var(--ds-radius-md)] border border-[var(--component-button-secondary-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--component-button-secondary-bg-hover)]";
const aprPrimaryActionClass =
  "flex items-center justify-center space-x-2 rounded-[var(--ds-radius-md)] bg-[var(--component-button-primary-bg)] px-6 py-2.5 text-sm font-bold text-[var(--color-text-inverse)] shadow-[var(--ds-shadow-md)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-lg)] disabled:opacity-60";
const aprPrimarySubmitActionClass =
  "flex items-center justify-center space-x-2 rounded-[var(--ds-radius-md)] bg-[var(--component-button-primary-bg)] px-8 py-2.5 text-sm font-bold text-[var(--color-text-inverse)] shadow-[var(--ds-shadow-md)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-lg)] active:scale-95 disabled:opacity-50";
const aprFieldStatCardClass =
  "rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-default)] bg-[color:var(--ds-color-surface-muted)]/28 px-3 py-3";

/* function getCategoriaBadgeClass(categoria?: string) {
  switch (categoria) {
    case "Aceitável":
      return "risk-badge-acceptable";
    case "Atenção":
      return "risk-badge-attention";
    case "Substancial":
      return "risk-badge-substantial";
    case "Crítico":
      return "risk-badge-critical";
    default:
      return "bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]";
  }
}
*/

function createEmptyRiskRow(): NonNullable<AprFormData["itens_risco"]>[number] {
  return {
    atividade_processo: "",
    etapa: "",
    agente_ambiental: "",
    condicao_perigosa: "",
    fontes_circunstancias: "",
    possiveis_lesoes: "",
    probabilidade: "",
    severidade: "",
    categoria_risco: "",
    medidas_prevencao: "",
    epc: "",
    epi: "",
    permissao_trabalho: "",
    normas_relacionadas: "",
    responsavel: "",
    prazo: "",
    status_acao: "",
  };
}

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function normalizeRiskRow(
  row?: Partial<NonNullable<AprFormData["itens_risco"]>[number]>,
): NonNullable<AprFormData["itens_risco"]>[number] {
  return {
    ...createEmptyRiskRow(),
    ...row,
  };
}

function mapPersistedRiskItemToFormRow(
  item: NonNullable<Apr["risk_items"]>[number],
): NonNullable<AprFormData["itens_risco"]>[number] {
  return normalizeRiskRow({
    atividade_processo: item.atividade || "",
    etapa: item.etapa || "",
    agente_ambiental: item.agente_ambiental || "",
    condicao_perigosa: item.condicao_perigosa || "",
    fontes_circunstancias: item.fonte_circunstancia || "",
    possiveis_lesoes: item.lesao || "",
    probabilidade:
      item.probabilidade !== undefined && item.probabilidade !== null
        ? String(item.probabilidade)
        : "",
    severidade:
      item.severidade !== undefined && item.severidade !== null
        ? String(item.severidade)
        : "",
    categoria_risco: item.categoria_risco || "",
    medidas_prevencao: item.medidas_prevencao || "",
    epc: item.epc || "",
    epi: item.epi || "",
    permissao_trabalho: item.permissao_trabalho || "",
    normas_relacionadas: item.normas_relacionadas || "",
    responsavel: item.responsavel || "",
    prazo: item.prazo || "",
    status_acao: item.status_acao || "",
  });
}

function buildRiskRowKey(
  row?: Partial<NonNullable<AprFormData["itens_risco"]>[number]>,
) {
  const normalized = normalizeRiskRow(row);
  return [
    normalized.atividade_processo,
    normalized.etapa,
    normalized.condicao_perigosa,
    normalized.agente_ambiental,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
}

export function AprForm({ id }: AprFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, hasPermission } = useAuth();
  const canCreate = hasPermission("can_create_apr");
  const canView = hasPermission("can_view_apr");
  const isUnauthorized = !canView && !canCreate;

  // Guard de acesso sem quebrar a ordem dos hooks.
  useEffect(() => {
    if (isUnauthorized) {
      router.replace("/dashboard");
    }
  }, [isUnauthorized, router]);
  const { isOffline } = useApiStatus();
  const { getActionCriteriaText } = useAprCalculations();
  const prefillCompanyIdParam = searchParams.get("company_id");
  const prefillSiteIdParam = searchParams.get("site_id");
  const prefillUserIdParam =
    searchParams.get("elaborador_id") || searchParams.get("user_id");
  const prefillCompanyId = isUuidLike(prefillCompanyIdParam)
    ? String(prefillCompanyIdParam)
    : "";
  const prefillSiteId = isUuidLike(prefillSiteIdParam)
    ? String(prefillSiteIdParam)
    : "";
  const prefillUserId = isUuidLike(prefillUserIdParam)
    ? String(prefillUserIdParam)
    : "";
  const prefillTitle = searchParams.get("title") || "";
  const prefillDescription = searchParams.get("description") || "";
  const isFieldMode = searchParams.get("field") === "1";
  const [fetching, setFetching] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [emittingGovernedPdf, setEmittingGovernedPdf] = useState(false);
  const [closingApr, setClosingApr] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [currentApr, setCurrentApr] = useState<Apr | null>(null);
  const [aprLogs, setAprLogs] = useState<AprLogEntry[]>([]);
  const [versionHistory, setVersionHistory] = useState<
    Array<{ id: string; numero: string; versao: number; status: string }>
  >([]);
  const [compareTargetId, setCompareTargetId] = useState("");
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<{
    summary: {
      totalBase: number;
      totalTarget: number;
      added: number;
      removed: number;
      changed: number;
    };
  } | null>(null);
  const [selectedRiskItemEvidence, setSelectedRiskItemEvidence] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [evidenceLatitude, setEvidenceLatitude] = useState<string>("");
  const [evidenceLongitude, setEvidenceLongitude] = useState<string>("");
  const [evidenceAccuracy, setEvidenceAccuracy] = useState<string>("");
  const [aprEvidences, setAprEvidences] = useState<
    Array<{
      id: string;
      apr_risk_item_id: string;
      original_name?: string;
      hash_sha256: string;
      watermarked_hash_sha256?: string;
      uploaded_at: string;
      captured_at?: string;
      url?: string;
      watermarked_url?: string;
      integrity_flags?: Record<string, unknown>;
    }>
  >([]);
  const [hashToVerify, setHashToVerify] = useState("");
  const [verifyingHash, setVerifyingHash] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    matchedIn?: "original" | "watermarked";
    message?: string;
  } | null>(null);
  const [suggestingControls, setSuggestingControls] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);
  const [excelPreview, setExcelPreview] =
    useState<AprExcelImportPreview | null>(null);
  const [activityTemplates, setActivityTemplates] = useState<
    Array<Pick<AprActivityTemplate, "tipo_atividade" | "label" | "descricao">>
  >([]);
  const [selectedActivityTemplate, setSelectedActivityTemplate] =
    useState<AprActivityTemplate | null>(null);
  const [loadingActivityTemplate, setLoadingActivityTemplate] = useState(false);

  const [, setActivities] = useState<Activity[]>([]);
  const [, setRisks] = useState<Risk[]>([]);
  const [, setEpis] = useState<Epi[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [, setTools] = useState<Tool[]>([]);
  const [, setMachines] = useState<Machine[]>([]);

  // Signature States
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [currentSigningUser, setCurrentSigningUser] = useState<User | null>(
    null,
  );
  const [signatures, setSignatures] = useState<
    Record<string, { data: string; type: string }>
  >({});
  const [persistedSignatures, setPersistedSignatures] = useState<
    Record<string, { id?: string; data: string; type: string }>
  >({});
  const [currentStep, setCurrentStep] = useState(1);
  const {
    draftId,
    setDraftId,
    draftRestored,
    setDraftRestored,
    draftPendingOfflineSync,
    setDraftPendingOfflineSync,
    draftSecurityNotice,
    setDraftSecurityNotice,
    sophieSuggestedRisks,
    setSophieSuggestedRisks,
    sophieMandatoryChecklists,
    setSophieMandatoryChecklists,
    draftStorageKey,
    legacyDraftStorageKey,
    draftMetadata,
    clearDraft: clearDraftState,
    scheduleDraftPersist,
    persistPendingOfflineSync,
    draftSaving,
    draftLastSavedAt,
    draftSaveError,
    retryDraftPersist,
  } = useAprDraft({
    id,
    companyId: user?.company_id,
    isReadOnly: Boolean(
      currentApr?.pdf_file_key ||
        currentApr?.status === "Aprovada" ||
        currentApr?.status === "Cancelada" ||
        currentApr?.status === "Encerrada" ||
        currentApr?.approval_steps?.some((step) => step.status !== "pending"),
    ),
    fetching,
    currentStep,
    getValues: () => getValues(),
  });
  const submitIntentRef = useRef<"save" | "save_and_print">("save");
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const compliancePanelRef = useRef<HTMLDivElement | null>(null);
  const [complianceResult, setComplianceResult] = useState<AprValidationResult | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [formActionModal, setFormActionModal] = useState<
    "approve" | "finalize" | null
  >(null);
  const [formActionModalLoading, setFormActionModalLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    getValues,
    setError,
    clearErrors,
    trigger,
    formState: { errors, isDirty },
  } = useForm<AprFormData>({
    resolver: zodResolver(aprSchema),
    defaultValues: {
      pdf_signed: false,
      numero: "",
      titulo: prefillTitle,
      descricao: prefillDescription,
      tipo_atividade: "",
      frente_trabalho: "",
      area_risco: "",
      turno: "",
      local_execucao_detalhado: "",
      responsavel_tecnico_nome: "",
      responsavel_tecnico_registro: "",
      status: "Pendente",
      is_modelo: false,
      is_modelo_padrao: false,
      data_inicio: new Date().toISOString().split("T")[0],
      data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      company_id: prefillCompanyId,
      site_id: prefillSiteId,
      elaborador_id: prefillUserId,
      activities: [],
      risks: [],
      epis: [],
      tools: [],
      machines: [],
      participants: prefillUserId ? [prefillUserId] : [],
      itens_risco: [],
    },
  });

  const getValuesRef = useRef(getValues);
  useEffect(() => {
    getValuesRef.current = getValues;
  }, [getValues]);

  const watchedStatus = useWatch({
    control,
    name: "status",
    defaultValue: "Pendente",
  });
  const isModelo = watch("is_modelo");
  const approvalSteps = currentApr?.approval_steps || [];
  const pendingApprovalStep =
    approvalSteps.find((step) => step.status === "pending") || null;
  const approvalProgressStarted = approvalSteps.some(
    (step) => step.status !== "pending",
  );
  const isApproved = currentApr?.status === "Aprovada";
  const hasFinalPdf = Boolean(currentApr?.pdf_file_key);
  const isReadOnly =
    watchedStatus === "Aprovada" ||
    watchedStatus === "Cancelada" ||
    watchedStatus === "Encerrada" ||
    hasFinalPdf ||
    approvalProgressStarted;
  const readOnlyReason = useMemo(() => {
    if (!isReadOnly) return null;
    return hasFinalPdf
      ? "APR bloqueada para edição porque já possui PDF final emitido."
      : watchedStatus === "Aprovada"
        ? "APR bloqueada para edição porque já foi aprovada."
        : watchedStatus === "Cancelada"
          ? "APR cancelada. Gere uma nova APR se o trabalho precisar ser reavaliado."
          : watchedStatus === "Encerrada"
            ? "APR encerrada e bloqueada para edição."
            : approvalProgressStarted
              ? `APR bloqueada para edição porque a aprovação foi iniciada${pendingApprovalStep ? `. Próxima etapa: ${pendingApprovalStep.title}.` : "."}`
              : "APR bloqueada para edição pelo fluxo formal.";
  }, [
    approvalProgressStarted,
    hasFinalPdf,
    isReadOnly,
    pendingApprovalStep,
    watchedStatus,
  ]);

  const selectedCompanyId = watch("company_id");
  const selectedSiteId = watch("site_id");
  const selectedElaboradorId = watch("elaborador_id");
  const selectedTipoAtividade = watch("tipo_atividade");
  const tituloApr = watch("titulo");
  const dataInicioApr = watch("data_inicio");
  const filteredSites = sites.filter(
    (site) => site.company_id === selectedCompanyId,
  );
  const filteredUsers = users.filter(
    (user) =>
      user.company_id === selectedCompanyId &&
      user.site_id === selectedSiteId,
  );
  const signatureChanges = useMemo(() => {
    const signaturesToDelete = Object.entries(persistedSignatures).filter(
      ([userId, persisted]) => {
        const current = signatures[userId];
        return (
          !current ||
          current.data !== persisted.data ||
          current.type !== persisted.type
        );
      },
    );
    const signaturesToCreate = Object.entries(signatures).filter(
      ([userId, current]) => {
        const persisted = persistedSignatures[userId];
        return (
          !persisted ||
          current.data !== persisted.data ||
          current.type !== persisted.type
        );
      },
    );

    return {
      signaturesToDelete,
      signaturesToCreate,
      hasPendingChanges:
        signaturesToDelete.length > 0 || signaturesToCreate.length > 0,
    };
  }, [persistedSignatures, signatures]);
  const offlineSyncIdentity = useMemo(() => {
    if (id) {
      return {
        correlationId: `apr:update:${id}`,
        dedupeKey: `apr:update:${id}`,
      };
    }

    if (!draftId) {
      return null;
    }

    return {
      correlationId: `apr:draft:${draftId}`,
      dedupeKey: `apr:create:${draftId}`,
    };
  }, [draftId, id]);

  const selectedRiskIdsRaw = useWatch({
    control,
    name: "risks",
    defaultValue: [],
  });
  const selectedEpiIdsRaw = useWatch({
    control,
    name: "epis",
    defaultValue: [],
  });
  const selectedParticipantIdsRaw = useWatch({
    control,
    name: "participants",
    defaultValue: [],
  });
  const selectedRiskIds = useMemo(
    () => selectedRiskIdsRaw ?? [],
    [selectedRiskIdsRaw],
  );
  const selectedEpiIds = useMemo(
    () => selectedEpiIdsRaw ?? [],
    [selectedEpiIdsRaw],
  );
  const selectedParticipantIds = useMemo(
    () => selectedParticipantIdsRaw ?? [],
    [selectedParticipantIdsRaw],
  );
  const pendingOfflineSyncUi = useMemo(() => {
    if (!draftPendingOfflineSync) {
      return null;
    }

    switch (draftPendingOfflineSync.status) {
      case "syncing":
        return {
          badge: "Sincronizando base",
          summary:
            "A APR base já foi salva localmente e está em sincronização com o servidor.",
          nextStep:
            "Aguarde a confirmação da sincronização para continuar assinaturas, PDF final e emissão governada.",
        };
      case "failed":
        return {
          badge: "Falha na sincronização",
          summary:
            "A APR base segue salva localmente, mas a sincronização falhou e exige ação do operador.",
          nextStep:
            "Tente sincronizar novamente ou descarte este envio local antes de reenviar.",
        };
      case "synced_base":
        return {
          badge: "Base sincronizada",
          summary:
            "A APR base já alcançou o servidor. O que falta agora é concluir assinaturas e emissão final online.",
          nextStep:
            "Libere o rascunho para continuar a conclusão operacional com conexão ativa.",
        };
      case "orphaned":
        return {
          badge: "Estado local órfão",
          summary:
            "O navegador não localizou mais o envio correspondente na fila offline. A APR base pode ter sincronizado, sido removida ou perdido a referência local.",
          nextStep:
            "Valide a listagem antes de liberar ou reenviar, para evitar duplicidade operacional.",
        };
      default:
        return {
          badge: "Base enfileirada",
          summary:
            "A APR base foi salva localmente e está aguardando sincronização com o servidor.",
          nextStep:
            "Assinaturas, PDF final e emissão governada permanecem bloqueados até a conclusão online.",
        };
    }
  }, [draftPendingOfflineSync]);
  const notifyReadOnly = useCallback(
    (action?: string) => {
      if (!readOnlyReason) return;
      toast.warning("APR em modo somente leitura", {
        description: action ? `${readOnlyReason} ${action}` : readOnlyReason,
      });
    },
    [readOnlyReason],
  );
  const aiEnabled = isAiEnabled();
  const selectedCompany = companies.find(
    (company) => company.id === selectedCompanyId,
  );
  const selectedSite = sites.find((site) => site.id === selectedSiteId);
  const selectedElaborador = users.find(
    (user) => user.id === selectedElaboradorId,
  );
  const selectedActivityTemplateSummary =
    activityTemplates.find(
      (template) => template.tipo_atividade === selectedTipoAtividade,
    ) || null;
  const selectedActivityTypeLabel =
    selectedActivityTemplateSummary?.label ||
    (hasText(selectedTipoAtividade)
      ? String(selectedTipoAtividade).replace(/_/g, " ")
      : "Não definido");
  const canApproveCurrentApr = Boolean(
    id &&
      currentApr &&
      currentApr.status === "Pendente" &&
      !hasFinalPdf &&
      (!approvalSteps.length || pendingApprovalStep),
  );
  const isRiskRowStarted = useCallback(
    (item: NonNullable<AprFormData["itens_risco"]>[number] | undefined) => {
      if (!item) return false;
      return [
        item.atividade_processo,
        item.etapa,
        item.agente_ambiental,
        item.condicao_perigosa,
        item.fontes_circunstancias,
        item.possiveis_lesoes,
        item.probabilidade,
        item.severidade,
        item.medidas_prevencao,
        item.epc,
        item.epi,
        item.permissao_trabalho,
        item.normas_relacionadas,
        item.responsavel,
        item.prazo,
        item.status_acao,
      ].some((value) => hasText(value));
    },
    [],
  );
  const isRiskRowMateriallyComplete = useCallback(
    (item: NonNullable<AprFormData["itens_risco"]>[number] | undefined) => {
      if (!item) return false;
      const hasIdentification =
        hasText(item.atividade_processo) ||
        hasText(item.etapa) ||
        hasText(item.condicao_perigosa) ||
        hasText(item.agente_ambiental);
      const hasEvaluation =
        hasText(item.probabilidade) && hasText(item.severidade);
      const hasControl =
        hasText(item.medidas_prevencao) ||
        hasText(item.epc) ||
        hasText(item.epi) ||
        hasText(item.permissao_trabalho) ||
        hasText(item.normas_relacionadas);
      return hasIdentification && hasEvaluation && hasControl;
    },
    [],
  );

  useEffect(() => {
    let active = true;
    aprsService
      .listActivityTemplates()
      .then((templates) => {
        if (active) {
          setActivityTemplates(templates);
        }
      })
      .catch((error) => {
        console.error("Erro ao carregar templates de atividade da APR:", error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTipoAtividade) {
      setSelectedActivityTemplate(null);
      return;
    }

    let active = true;
    setLoadingActivityTemplate(true);
    aprsService
      .getActivityTemplate(selectedTipoAtividade)
      .then((template) => {
        if (active) {
          setSelectedActivityTemplate(template);
        }
      })
      .catch((error) => {
        console.error(
          "Erro ao carregar detalhes do template de atividade da APR:",
          error,
        );
        if (active) {
          setSelectedActivityTemplate(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoadingActivityTemplate(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedTipoAtividade]);

  useEffect(() => {
    if (!selectedElaborador?.nome) {
      return;
    }
    if (hasText(getValuesRef.current("responsavel_tecnico_nome"))) {
      return;
    }
    setValue("responsavel_tecnico_nome", selectedElaborador.nome, {
      shouldDirty: false,
    });
  }, [selectedElaborador?.nome, setValue]);

  const getGovernedPdfAccess = useCallback(async (aprId: string) => {
    const access = await aprsService.getPdfAccess(aprId);
    return access.hasFinalPdf ? access : null;
  }, []);

  const ensureGovernedPdf = useCallback(
    async (apr: Apr) => {
      const existingAccess = await getGovernedPdfAccess(apr.id);
      if (existingAccess) {
        return existingAccess;
      }

      if (apr.status !== "Aprovada") {
        return null;
      }

      const generatedAccess = await aprsService.generateFinalPdf(apr.id);
      if (generatedAccess.generated) {
        toast.success("PDF final da APR emitido e registrado com sucesso.");
      }
      return generatedAccess;
    },
    [getGovernedPdfAccess],
  );

  const reloadAprWorkflowContext = useCallback(
    async (aprId: string) => {
      const [freshApr, logs, versions] = await Promise.all([
        aprsService.findOne(aprId),
        aprsService.getLogs(aprId),
        aprsService.getVersionHistory(aprId),
      ]);
      setCurrentApr(freshApr);
      setValue("status", freshApr.status);
      setAprLogs(logs);
      setVersionHistory(
        versions.map((item) => ({
          id: item.id,
          numero: item.numero,
          versao: item.versao,
          status: item.status,
        })),
      );
      return freshApr;
    },
    [setValue],
  );

  const handlePrintAfterSave = useCallback(
    async (aprId: string) => {
      toast.info("Preparando impressão da APR...");
      const current = await aprsService.findOne(aprId);
      const shouldUseGovernedPdf =
        Boolean(current.pdf_file_key) || current.status === "Aprovada";

      if (shouldUseGovernedPdf) {
        const access = await ensureGovernedPdf(current);
        if (access?.url) {
          openPdfForPrint(access.url, () => {
            toast.info(
              "Pop-up bloqueado. Abrimos o PDF final da APR na mesma aba para impressão.",
            );
          });
          return;
        }

        toast.warning(
          access?.message ||
            "O PDF final da APR foi emitido, mas a URL segura não está disponível agora.",
        );
        return;
      }

      const [fullApr, aprSignatures, evidences] = await Promise.all([
        aprsService.findOne(aprId),
        signaturesService.findByDocument(aprId, "APR"),
        aprsService.listAprEvidences(aprId),
      ]);
      const [{ generateAprPdf }, { base64ToPdfBlob }] = await Promise.all([
        loadAprPdfGenerator(),
        loadPdfFileUtils(),
      ]);
      const result = (await generateAprPdf(fullApr, aprSignatures, {
        save: false,
        output: "base64",
        evidences,
        draftWatermark: true,
      })) as { base64: string } | undefined;

      if (!result?.base64) {
        throw new Error("Falha ao gerar o PDF da APR para impressão.");
      }

      const fileURL = URL.createObjectURL(base64ToPdfBlob(result.base64));
      openPdfForPrint(fileURL, () => {
        toast.info(
          "Pop-up bloqueado. Abrimos o PDF na mesma aba para impressão.",
        );
      });
      setTimeout(() => URL.revokeObjectURL(fileURL), 60_000);
    },
    [ensureGovernedPdf],
  );

  const buildChecklistSuggestionHref = useCallback(
    (suggestion: SophieDraftChecklistSuggestion) => {
      const params = new URLSearchParams();
      params.set("templateId", suggestion.id);
      if (selectedCompanyId) params.set("company_id", selectedCompanyId);
      if (selectedSiteId) params.set("site_id", selectedSiteId);
      if (tituloApr) params.set("title", `${tituloApr} • ${suggestion.label}`);
      if (watch("descricao")) {
        params.set("description", String(watch("descricao")));
      }
      return `/dashboard/checklists/new?${params.toString()}`;
    },
    [selectedCompanyId, selectedSiteId, tituloApr, watch],
  );

  const {
    fields: riskFields,
    append: appendRisk,
    remove: removeRisk,
    replace: replaceRisk,
    move: moveRisk,
  } = useFieldArray({
    control,
    name: "itens_risco",
  });
  const watchedRiskRows = useWatch({
    control,
    name: "itens_risco",
  }) as AprFormData["itens_risco"];
  const materiallyCompleteRiskCount = useMemo(
    () =>
      (watchedRiskRows || []).filter((item) =>
        isRiskRowMateriallyComplete(item),
      ).length,
    [isRiskRowMateriallyComplete, watchedRiskRows],
  );
  const totalRiskLines = riskFields.length;
  const completedSignatures = Object.keys(signatures).length;
  const [compactMode, setCompactMode] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const riskFieldsRef = useRef(riskFields);
  const pendingRiskRemovalTimeoutsRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const registerOfflineBlocked = useCallback(
    (reason: string) => {
      trackAprOfflineTelemetry("offline_blocked", {
        draftId: draftId || undefined,
        queueItemId: draftPendingOfflineSync?.queueItemId,
        dedupeKey: draftPendingOfflineSync?.dedupeKey,
        syncStatus: draftPendingOfflineSync?.status,
        intent: submitIntentRef.current,
        reason,
        source: "apr_form",
      });
    },
    [draftId, draftPendingOfflineSync],
  );
  const hiddenCompactDetailsCount = useMemo(() => {
    if (!compactMode) return 0;
    return (watchedRiskRows || []).reduce((count, item, index) => {
      if (expandedRows.has(index)) return count;
      const missingGovernanceData =
        !String(item?.medidas_prevencao || "").trim() ||
        !String(item?.responsavel || "").trim() ||
        !String(item?.prazo || "").trim() ||
        !String(item?.status_acao || "").trim();
      return missingGovernanceData ? count + 1 : count;
    }, 0);
  }, [compactMode, expandedRows, watchedRiskRows]);

  const duplicateRiskRow = useCallback(
    (index: number) => {
      if (isReadOnly) {
        notifyReadOnly("Não é possível duplicar linhas em uma APR bloqueada.");
        return;
      }
      const source = getValues(`itens_risco.${index}` as const);
      appendRisk({
        ...createEmptyRiskRow(),
        ...source,
      });
    },
    [appendRisk, getValues, isReadOnly, notifyReadOnly],
  );

  const moveRiskRow = useCallback(
    (from: number, to: number) => {
      if (isReadOnly) {
        notifyReadOnly("Não é possível reordenar linhas em uma APR bloqueada.");
        return;
      }
      if (to < 0 || to >= riskFields.length) return;
      moveRisk(from, to);
    },
    [isReadOnly, moveRisk, notifyReadOnly, riskFields.length],
  );

  const handleRemoveRiskRow = useCallback(
    (index: number, fieldId: string) => {
      if (isReadOnly) {
        notifyReadOnly("Não é possível remover linhas em uma APR bloqueada.");
        return;
      }
      const hasLine = index >= 0 && index < riskFields.length;
      if (!hasLine) return;

      const pendingKey = `apr-risk-remove-${fieldId}`;
      if (pendingRiskRemovalTimeoutsRef.current.has(pendingKey)) {
        return;
      }

      const finalizeRemoval = () => {
        pendingRiskRemovalTimeoutsRef.current.delete(pendingKey);
        const currentIndex = riskFieldsRef.current.findIndex(
          (field) => field.id === fieldId,
        );
        if (currentIndex < 0) return;

        removeRisk(currentIndex);
        setExpandedRows((prev) => {
          if (prev.size === 0) return prev;
          const next = new Set<number>();
          prev.forEach((rowIndex) => {
            if (rowIndex === currentIndex) return;
            next.add(rowIndex > currentIndex ? rowIndex - 1 : rowIndex);
          });
          return next;
        });
      };

      const timeoutId = setTimeout(finalizeRemoval, 5000);
      pendingRiskRemovalTimeoutsRef.current.set(pendingKey, timeoutId);

      toast.warning("Linha de risco marcada para remoção.", {
        id: pendingKey,
        duration: 5000,
        description: "Você pode desfazer esta ação antes da remoção definitiva.",
        action: {
          label: "Desfazer",
          onClick: () => {
            const pendingTimeout =
              pendingRiskRemovalTimeoutsRef.current.get(pendingKey);
            if (pendingTimeout) {
              clearTimeout(pendingTimeout);
              pendingRiskRemovalTimeoutsRef.current.delete(pendingKey);
            }
          },
        },
      });
    },
    [isReadOnly, notifyReadOnly, removeRisk, riskFields.length],
  );

  const toggleExpandedRow = useCallback((index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  useEffect(() => {
    riskFieldsRef.current = riskFields;
  }, [riskFields]);

  useEffect(() => {
    const pendingRemovals = pendingRiskRemovalTimeoutsRef.current;
    return () => {
      pendingRemovals.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      pendingRemovals.clear();
    };
  }, []);

  // (refatorado) Critério de ação e resumo executivo agora são calculados em componentes isolados.
  /* const ACTION_CRITERIA: Record<string, string> = useMemo(
    () => ({
      Aceitável: "Não são requeridos controles adicionais.",
      Atenção: "Reavaliar e adotar medidas complementares.",
      Substancial: "Não iniciar sem redução de risco.",
      Crítico: "Interromper e agir imediatamente.",
    }),
    [],
  );

  const riskSummary = useMemo(() => {
    const summary = { total: 0, aceitavel: 0, atencao: 0, substancial: 0, critico: 0, incompletas: 0 };
    (watchedRiskItems ?? []).forEach((item) => {
      summary.total += 1;
      const p = String(item?.probabilidade || "");
      const s = String(item?.severidade || "");
      if (!p || !s) {
        summary.incompletas += 1;
        return;
      }
      const calc = calculateAprRiskEvaluation(p, s);
      switch (calc.categoria) {
        case "Aceitável": summary.aceitavel += 1; break;
        case "Atenção": summary.atencao += 1; break;
        case "Substancial": summary.substancial += 1; break;
        case "Crítico": summary.critico += 1; break;
      }
    });
    return summary;
  }, [watchedRiskItems]);

  const getRiskRowCompleteness = useCallback(
    (item: NonNullable<AprFormData["itens_risco"]>[number] | undefined) => {
      if (!item) return "empty";
      const hasIdentification = Boolean(
        item.atividade_processo || item.condicao_perigosa || item.agente_ambiental,
      );
      const hasEvaluation = Boolean(item.probabilidade && item.severidade);
      const hasControl = Boolean(item.medidas_prevencao);
      if (hasIdentification && hasEvaluation && hasControl) return "complete";
      if (hasIdentification || hasEvaluation) return "partial";
      return "empty";
    },
    [],
  );
  */

  // Increment formVersion on dirty to re-trigger compliance debounce
  useEffect(() => {
    if (isDirty) setFormVersion((v) => v + 1);
  }, [isDirty]);

  // Unsaved changes warning
  useEffect(() => {
    if (!isDirty && !signatureChanges.hasPendingChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, signatureChanges.hasPendingChanges]);

  const applyExcelPreviewToForm = useCallback(
    (preview: AprExcelImportPreview) => {
      if (isReadOnly) {
        notifyReadOnly("Importação não está disponível em uma APR bloqueada.");
        return;
      }
      const applied = applyAprImportPreview(preview, {
        companies,
        sites,
        users,
        selectedCompanyId,
      });

      Object.entries(applied.fieldValues).forEach(([field, value]) => {
        if (!value) {
          return;
        }

        setValue(field as keyof AprFormData, value, {
          shouldDirty: true,
          shouldValidate: true,
        });
      });

      replaceRisk(
        applied.riskItems.length > 0
          ? applied.riskItems.map((item) => normalizeRiskRow(item))
          : [createEmptyRiskRow()],
      );

      if (applied.unresolved.length > 0) {
        toast.warning(
          `Preview aplicado com pendência de vínculo: ${applied.unresolved.join(", ")}.`,
        );
      }

      toast.success(
        `${preview.importedRows} linha(s) da planilha aplicadas ao formulário.`,
      );
    },
    [
      companies,
      isReadOnly,
      notifyReadOnly,
      replaceRisk,
      selectedCompanyId,
      setValue,
      sites,
      users,
    ],
  );

  const handleExcelFileSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      if (isReadOnly) {
        notifyReadOnly("Importação não está disponível em uma APR bloqueada.");
        if (event.target) {
          event.target.value = "";
        }
        return;
      }
      const selectedFile = event.target.files?.[0];
      if (!selectedFile) {
        return;
      }

      try {
        setImportingExcel(true);
        const preview = await aprsService.previewExcelImport(selectedFile);
        setExcelPreview(preview);

        if (preview.errors.length > 0) {
          toast.error(
            preview.errors[0] ||
              "A planilha possui inconsistências de importação.",
          );
          return;
        }

        toast.success(
          `Preview da planilha concluído: ${preview.importedRows} linha(s) pronta(s) para revisão.`,
        );
      } catch (error) {
        console.error("Erro ao importar planilha APR:", error);
        const message =
          typeof error === "object" &&
          error !== null &&
          "response" in error &&
          typeof (error as { response?: { data?: { message?: string } } })
            .response?.data?.message === "string"
            ? (error as { response?: { data?: { message?: string } } })
                .response!.data!.message
            : "Não foi possível interpretar a planilha APR.";
        toast.error(message);
      } finally {
        setImportingExcel(false);
        if (event.target) {
          event.target.value = "";
        }
      }
    },
    [isReadOnly, notifyReadOnly],
  );

  const hasSuggestedRiskInMatrix = useCallback(
    (suggestion: SophieDraftRiskSuggestion) =>
      (getValuesRef.current("itens_risco") ?? []).some(
        (item) =>
          String(item?.condicao_perigosa || "")
            .trim()
            .toLowerCase() === suggestion.label.trim().toLowerCase(),
      ),
    [],
  );

  const applySuggestedAprRisk = useCallback(
    (suggestion: SophieDraftRiskSuggestion) => {
      if (isReadOnly) {
        notifyReadOnly(
          "Não é possível aplicar sugestões em uma APR bloqueada.",
        );
        return;
      }
      let appliedSelection = false;

      if (suggestion.id && !selectedRiskIds.includes(suggestion.id)) {
        setValue("risks", [...selectedRiskIds, suggestion.id], {
          shouldDirty: true,
          shouldValidate: true,
        });
        appliedSelection = true;
      }

      if (!hasSuggestedRiskInMatrix(suggestion)) {
        appendRisk({
          ...createEmptyRiskRow(),
          atividade_processo: tituloApr || "Atividade assistida pela SOPHIE",
          agente_ambiental: suggestion.category || "",
          condicao_perigosa: suggestion.label,
        });
        appliedSelection = true;
      }

      if (appliedSelection) {
        toast.success(`Sugestão aplicada: ${suggestion.label}`);
      } else {
        toast.info(`A sugestão ${suggestion.label} já está refletida na APR.`);
      }
    },
    [
      appendRisk,
      hasSuggestedRiskInMatrix,
      isReadOnly,
      notifyReadOnly,
      selectedRiskIds,
      setValue,
      tituloApr,
    ],
  );

  const applyAllSuggestedAprRisks = useCallback(() => {
    if (isReadOnly) {
      notifyReadOnly("Não é possível aplicar sugestões em uma APR bloqueada.");
      return;
    }
    let appliedCount = 0;
    const nextSelectedRiskIds = [...selectedRiskIds];
    sophieSuggestedRisks.forEach((suggestion) => {
      const shouldSelect =
        suggestion.id && !nextSelectedRiskIds.includes(suggestion.id);
      const shouldAppend = !hasSuggestedRiskInMatrix(suggestion);

      if (shouldSelect || shouldAppend) {
        if (shouldSelect) {
          nextSelectedRiskIds.push(suggestion.id as string);
        }

        if (shouldAppend) {
          appendRisk({
            ...createEmptyRiskRow(),
            atividade_processo: tituloApr || "Atividade assistida pela SOPHIE",
            agente_ambiental: suggestion.category || "",
            condicao_perigosa: suggestion.label,
          });
        }
        appliedCount += 1;
      }
    });

    if (nextSelectedRiskIds.length !== selectedRiskIds.length) {
      setValue("risks", Array.from(new Set(nextSelectedRiskIds)), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    if (appliedCount > 0) {
      toast.success(
        `${appliedCount} sugestão(ões) da SOPHIE aplicadas na APR.`,
      );
    } else {
      toast.info("As sugestões da SOPHIE já foram refletidas na APR.");
    }
  }, [
    appendRisk,
    hasSuggestedRiskInMatrix,
    isReadOnly,
    notifyReadOnly,
    selectedRiskIds,
    setValue,
    sophieSuggestedRisks,
    tituloApr,
  ]);

  const applySelectedActivityTemplate = useCallback(() => {
    if (isReadOnly) {
      notifyReadOnly(
        "Não é possível aplicar template de atividade em uma APR bloqueada.",
      );
      return;
    }
    if (!selectedActivityTemplate) {
      toast.warning("Selecione um tipo de atividade com template disponível.");
      return;
    }

    const templateRows = selectedActivityTemplate.risk_items.map((item) =>
      normalizeRiskRow({
        atividade_processo:
          item.atividade || selectedActivityTemplate.label || tituloApr || "",
        etapa: item.etapa || "",
        agente_ambiental: item.agente_ambiental || "",
        condicao_perigosa: item.condicao_perigosa || "",
        fontes_circunstancias: item.fonte_circunstancia || "",
        possiveis_lesoes: item.lesao || "",
        probabilidade:
          item.probabilidade !== undefined ? String(item.probabilidade) : "",
        severidade:
          item.severidade !== undefined ? String(item.severidade) : "",
        medidas_prevencao: item.medidas_prevencao || "",
        responsavel: item.responsavel || "",
        status_acao: item.status_acao || "Pendente",
      }),
    );

    const currentRows = (getValues("itens_risco") || []).map((item) =>
      normalizeRiskRow(item),
    );
    const existingKeys = new Set(
      currentRows.filter((item) => isRiskRowStarted(item)).map(buildRiskRowKey),
    );
    const uniqueTemplateRows = templateRows.filter(
      (row) => !existingKeys.has(buildRiskRowKey(row)),
    );

    if (uniqueTemplateRows.length === 0) {
      toast.info(
        "Os riscos principais deste template já estão refletidos na grade da APR.",
      );
      return;
    }

    const nextRows = currentRows.some((item) => isRiskRowStarted(item))
      ? [...currentRows, ...uniqueTemplateRows]
      : uniqueTemplateRows;
    replaceRisk(nextRows);
    clearErrors("itens_risco");
    toast.success(
      `${uniqueTemplateRows.length} linha(s) do template ${selectedActivityTemplate.label} aplicadas à APR.`,
    );
  }, [
    clearErrors,
    getValues,
    isReadOnly,
    isRiskRowStarted,
    notifyReadOnly,
    replaceRisk,
    selectedActivityTemplate,
    tituloApr,
  ]);

  const { handleSubmit: onSubmit, loading } = useFormSubmit(
    async (data: AprFormData) => {
      if (id && isReadOnly) {
        throw new Error(
          hasFinalPdf
            ? "APR com PDF final emitido está bloqueada. Crie uma nova versão."
            : readOnlyReason ||
                "APR bloqueada para edição. Utilize o fluxo formal ou gere nova versão quando aplicável.",
        );
      }
      if (draftPendingOfflineSync) {
        registerOfflineBlocked("pending_sync_lock");
        throw new Error(
          "Este rascunho ainda está marcado com sincronização pendente. Valide a APR na listagem ou descarte o estado pendente antes de enviar novamente.",
        );
      }
      if (isOffline && signatureChanges.hasPendingChanges) {
        registerOfflineBlocked("signature_requires_online");
        throw new Error(
          "Assinaturas da APR só podem ser concluídas online. Reconecte-se para enviar as assinaturas ou remova as alterações de assinatura antes de salvar offline.",
        );
      }
      if (isOffline && submitIntentRef.current === "save_and_print") {
        registerOfflineBlocked("save_and_print_requires_online");
        throw new Error(
          'Salvar e imprimir exige conexão ativa. Use apenas "Salvar" para enfileirar a APR base e finalize a impressão quando estiver online.',
        );
      }

      let aprId = id;
      let offlineQueued = false;
      let offlineQueueItemId: string | undefined;
      let offlineQueueDeduplicated = false;
      const basePayload = Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== "pdf_signed"),
      ) as AprMutationPayload;
      const normalizedRiskItems: AprRiskItemInput[] = (
        data.itens_risco || []
      ).map((item) => ({
        atividade_processo: item.atividade_processo || "",
        etapa: item.etapa || "",
        agente_ambiental: item.agente_ambiental || "",
        condicao_perigosa: item.condicao_perigosa || "",
        fonte_circunstancia: item.fontes_circunstancias || "",
        possiveis_lesoes: item.possiveis_lesoes || "",
        probabilidade: item.probabilidade
          ? Number(item.probabilidade)
          : undefined,
        severidade: item.severidade ? Number(item.severidade) : undefined,
        categoria_risco: item.categoria_risco || "",
        medidas_prevencao: item.medidas_prevencao || "",
        epc: item.epc || "",
        epi: item.epi || "",
        permissao_trabalho: item.permissao_trabalho || "",
        normas_relacionadas: item.normas_relacionadas || "",
        responsavel: item.responsavel || "",
        prazo: item.prazo || "",
        status_acao: item.status_acao || "",
      }));
      const payload = {
        ...basePayload,
        itens_risco: data.itens_risco,
        risk_items: normalizedRiskItems,
      } as AprMutationPayload & {
        risk_items: AprRiskItemInput[];
      };

      if (id && isApproved) {
        throw new Error(
          "APR aprovada está bloqueada para edição. Emita o PDF final na listagem ou crie uma nova versão para alterar o documento.",
        );
      }

      const allowOfflineQueue =
        !signatureChanges.hasPendingChanges &&
        submitIntentRef.current !== "save_and_print";

      if (id) {
        const updated = await aprsService.update(id, payload, {
          allowOfflineQueue,
          offlineSync: {
            correlationId: offlineSyncIdentity?.correlationId,
            dedupeKey: offlineSyncIdentity?.dedupeKey,
            draftId: draftId || undefined,
            source: "apr_form",
            // Passa o updated_at do registro carregado para detecção de conflito
            // no servidor caso a APR seja editada simultaneamente por outro usuário
            conflictGuardUpdatedAt: currentApr?.updated_at
              ? String(currentApr.updated_at)
              : undefined,
          },
        });
        offlineQueued = Boolean(
          (
            updated as Apr & {
              offlineQueued?: boolean;
              offlineQueueItemId?: string;
              offlineQueueDeduplicated?: boolean;
            }
          ).offlineQueued,
        );
        offlineQueueItemId = (
          updated as Apr & {
            offlineQueued?: boolean;
            offlineQueueItemId?: string;
            offlineQueueDeduplicated?: boolean;
          }
        ).offlineQueueItemId;
        offlineQueueDeduplicated = Boolean(
          (
            updated as Apr & {
              offlineQueued?: boolean;
              offlineQueueItemId?: string;
              offlineQueueDeduplicated?: boolean;
            }
          ).offlineQueueDeduplicated,
        );
      } else {
        const newApr = await aprsService.create(payload, {
          allowOfflineQueue,
          offlineSync: {
            correlationId: offlineSyncIdentity?.correlationId,
            dedupeKey: offlineSyncIdentity?.dedupeKey,
            draftId: draftId || undefined,
            source: "apr_form",
          },
        });
        aprId = newApr.id;
        offlineQueued = Boolean(
          (
            newApr as Apr & {
              offlineQueued?: boolean;
              offlineQueueItemId?: string;
              offlineQueueDeduplicated?: boolean;
            }
          ).offlineQueued,
        );
        offlineQueueItemId = (
          newApr as Apr & {
            offlineQueued?: boolean;
            offlineQueueItemId?: string;
            offlineQueueDeduplicated?: boolean;
          }
        ).offlineQueueItemId;
        offlineQueueDeduplicated = Boolean(
          (
            newApr as Apr & {
              offlineQueued?: boolean;
              offlineQueueItemId?: string;
              offlineQueueDeduplicated?: boolean;
            }
          ).offlineQueueDeduplicated,
        );
      }

      if (aprId && !offlineQueued) {
        const signatureIdsToDelete = signatureChanges.signaturesToDelete
          .map(([, persisted]) => persisted.id)
          .filter((signatureId): signatureId is string => Boolean(signatureId));

        if (signatureIdsToDelete.length > 0) {
          await Promise.all(
            signatureIdsToDelete.map((signatureId) =>
              signaturesService.deleteById(signatureId),
            ),
          );
        }

        if (signatureChanges.signaturesToCreate.length > 0) {
          await Promise.all(
            signatureChanges.signaturesToCreate.map(([userId, sig]) =>
              signaturesService.create({
                user_id: userId,
                document_id: aprId as string,
                document_type: "APR",
                signature_data: sig.data,
                type: sig.type,
              }),
            ),
          );
        }
      }

      if (id && !offlineQueued) {
        const [updatedApr, logs, versions, evidences] = await Promise.all([
          aprsService.findOne(id),
          aprsService.getLogs(id),
          aprsService.getVersionHistory(id),
          aprsService.listAprEvidences(id),
        ]);
        setCurrentApr(updatedApr);
        setAprLogs(logs);
        setAprEvidences(evidences);
        setVersionHistory(
          versions.map((item) => ({
            id: item.id,
            numero: item.numero,
            versao: item.versao,
            status: item.status,
          })),
        );
      }

      return {
        aprId: aprId || undefined,
        offlineQueued,
        offlineQueueItemId,
        offlineQueueDeduplicated,
      } as AprSubmitResult;
    },
    {
      successMessage: (result) => {
        const submitResult = (result as AprSubmitResult | undefined) || {};
        if (submitResult.offlineQueued) {
          return "APR base enfileirada para sincronização. Assinaturas e emissão final continuam bloqueadas até o retorno da conexão.";
        }
        return id
          ? "APR atualizada com sucesso!"
          : "APR cadastrada com sucesso!";
      },
      redirectTo: "/dashboard/aprs",
      skipRedirect: (result) => {
        const submitResult = (result as AprSubmitResult | undefined) || {};
        return (
          submitIntentRef.current === "save_and_print" ||
          Boolean(submitResult.offlineQueued)
        );
      },
      context: "APR",
      onSuccess: (result) => {
        const submitResult = (result as AprSubmitResult | undefined) || {};

        if (submitResult.offlineQueued) {
          const resolvedDraftId = draftId || createAprDraftMetadata().draftId;
          if (!draftId) {
            setDraftId(resolvedDraftId);
          }
          const pendingSync: AprDraftPendingOfflineSync = {
            draftId: resolvedDraftId,
            queuedAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
            queueItemId: submitResult.offlineQueueItemId,
            dedupeKey: offlineSyncIdentity?.dedupeKey,
            aprId: submitResult.aprId,
            intent: submitIntentRef.current,
            status: "queued",
          };
          persistPendingOfflineSync(pendingSync);
          trackAprOfflineTelemetry(
            submitResult.offlineQueueDeduplicated
              ? "offline_deduplicated"
              : "offline_enqueued",
            {
              draftId: pendingSync.draftId,
              queueItemId: pendingSync.queueItemId,
              dedupeKey: pendingSync.dedupeKey,
              aprId: pendingSync.aprId,
              syncStatus: pendingSync.status,
              intent: pendingSync.intent,
              source: "apr_submit_success",
            },
          );
          toast.info(
            submitResult.offlineQueueDeduplicated
              ? "A APR base já estava enfileirada. Atualizamos o envio local existente sem criar duplicidade."
              : "A APR base foi salva localmente e enfileirada para sincronização. Assinaturas e emissão final continuam pendentes.",
          );
          return;
        }

        clearDraftState();

        if (submitIntentRef.current !== "save_and_print") {
          return;
        }

        const finishRedirect = () => {
          router.push("/dashboard/aprs");
          router.refresh();
        };

        if (!submitResult.aprId || submitResult.offlineQueued) {
          toast.info(
            "APR salva em modo offline. A impressão ficará disponível após sincronização.",
          );
          finishRedirect();
          return;
        }

        void (async () => {
          try {
            await handlePrintAfterSave(submitResult.aprId as string);
          } catch (printError) {
            console.error(
              "Erro ao preparar impressão automática da APR:",
              printError,
            );
            toast.warning(
              "APR salva, mas não foi possível abrir a impressão automática.",
            );
          } finally {
            finishRedirect();
          }
        })();
      },
    },
  );

  useEffect(() => {
    if (!isModelo) {
      setValue("is_modelo_padrao", false);
    }
  }, [isModelo, setValue]);

  const handleAiAnalysis = async () => {
    if (isReadOnly) {
      notifyReadOnly(
        "Ações de sugestão/análise não estão disponíveis em modo somente leitura.",
      );
      return;
    }
    if (!isAiEnabled()) {
      toast.error("IA desativada neste ambiente.");
      return;
    }
    const titulo = watch("titulo");
    const descricao = watch("descricao");

    if (!titulo && !descricao) {
      toast.error("Preencha o título ou descrição para a análise do SGS.");
      return;
    }

    try {
      setAnalyzing(true);
      const result = await aiService.analyzeApr(
        titulo + " " + (descricao || ""),
      );

      if (result.risks.length > 0) {
        setValue("risks", [...new Set([...selectedRiskIds, ...result.risks])]);
      }

      if (result.epis.length > 0) {
        setValue("epis", [...new Set([...selectedEpiIds, ...result.epis])]);
      }

      toast.success("SGS analisou a atividade e sugeriu riscos e EPIs!", {
        description: result.explanation,
        duration: 5000,
      });
    } catch (error) {
      console.error("Erro na análise do SGS:", error);
      toast.error("Não foi possível realizar a análise no momento.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSuggestControls = useCallback(async () => {
    if (isReadOnly) {
      notifyReadOnly("Não é possível sugerir controles em uma APR bloqueada.");
      return;
    }
    if (riskFields.length === 0) {
      toast.error("Adicione ao menos uma linha de risco para gerar sugestões.");
      return;
    }

    try {
      setSuggestingControls(true);
      const rows = watch("itens_risco") || [];
      await Promise.all(
        rows.map(async (row, index) => {
          const result = await aprsService.getControlSuggestions({
            probability: row?.probabilidade
              ? Number(row.probabilidade)
              : undefined,
            severity: row?.severidade ? Number(row.severidade) : undefined,
            exposure: 1,
            activity: row?.atividade_processo || tituloApr,
            condition: row?.condicao_perigosa,
          });

          const suggestionText = result.suggestions
            .map((item) => `${item.title}: ${item.description}`)
            .join(" | ");

          if (suggestionText) {
            setValue(`itens_risco.${index}.medidas_prevencao`, suggestionText, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
        }),
      );

      toast.success("Sugestões de controles aplicadas nas linhas de risco.");
    } catch (error) {
      console.error("Erro ao sugerir controles:", error);
      toast.error("Não foi possível gerar sugestões de controles.");
    } finally {
      setSuggestingControls(false);
    }
  }, [
    isReadOnly,
    notifyReadOnly,
    riskFields.length,
    setValue,
    tituloApr,
    watch,
  ]);

  const handleApproveApr = useCallback(async () => {
    if (!id) return;
    if (!canApproveCurrentApr) {
      toast.warning(
        "Aprovação indisponível para esta APR no estado atual do fluxo.",
      );
      return;
    }
    setFormActionModal("approve");
  }, [canApproveCurrentApr, id]);

  const handleEmitGovernedPdf = useCallback(async () => {
    if (!id || !currentApr) return;
    if (isOffline) {
      registerOfflineBlocked("final_pdf_requires_online");
      toast.warning(
        "A emissão do PDF final governado exige conexão ativa com o servidor.",
      );
      return;
    }
    if (currentApr.status !== "Aprovada") {
      toast.warning(
        "Somente APRs aprovadas podem emitir o PDF final governado.",
      );
      return;
    }

    try {
      setEmittingGovernedPdf(true);
      const access = await ensureGovernedPdf(currentApr);
      await reloadAprWorkflowContext(id);

      if (access?.url) {
        openUrlInNewTab(access.url);
        return;
      }

      toast.warning(
        access?.message ||
          "O PDF final foi emitido, mas a URL segura ainda não está disponível.",
      );
    } catch (error) {
      console.error("Erro ao emitir PDF governado da APR:", error);
      toast.error("Não foi possível emitir o PDF final governado.");
    } finally {
      setEmittingGovernedPdf(false);
    }
  }, [
    currentApr,
    ensureGovernedPdf,
    id,
    isOffline,
    registerOfflineBlocked,
    reloadAprWorkflowContext,
  ]);

  const handleCloseApr = useCallback(async () => {
    if (!id || !currentApr) return;
    if (currentApr.status !== "Aprovada") {
      toast.warning("Somente APRs aprovadas podem ser encerradas.");
      return;
    }
    if (!currentApr.pdf_file_key) {
      toast.warning(
        "Emita o PDF final governado da APR antes de encerrar o documento.",
      );
      return;
    }
    setFormActionModal("finalize");
  }, [currentApr, id]);

  const confirmFormAction = useCallback(async () => {
    if (!id || !formActionModal) return;
    setFormActionModalLoading(true);

    try {
      if (formActionModal === "approve") {
        setFinalizing(true);
        await aprsService.approve(id);
        const refreshedApr = await reloadAprWorkflowContext(id);
        const nextPendingStep =
          refreshedApr.approval_steps?.find((step) => step.status === "pending") ||
          null;
        if (refreshedApr.status === "Aprovada") {
          toast.success("APR aprovada com sucesso.");
        } else {
          toast.success(
            nextPendingStep
              ? `Etapa aprovada. Próxima aprovação: ${nextPendingStep.title}.`
              : "Etapa de aprovação concluída.",
          );
        }
      } else {
        setClosingApr(true);
        await aprsService.finalize(id);
        await reloadAprWorkflowContext(id);
        toast.success("APR encerrada com sucesso.");
      }
      setFormActionModal(null);
    } catch (error) {
      const contextLabel =
        formActionModal === "approve" ? "Aprovação de APR" : "Encerramento de APR";
      handleApiError(error, contextLabel);
    } finally {
      setFormActionModalLoading(false);
      setFinalizing(false);
      setClosingApr(false);
    }
  }, [formActionModal, id, reloadAprWorkflowContext]);

  const handleOpenGovernedPdf = useCallback(async () => {
    if (!id || !currentApr) return;
    if (isOffline) {
      registerOfflineBlocked("open_final_pdf_requires_online");
      toast.warning(
        "O PDF final governado só pode ser aberto enquanto houver conexão ativa.",
      );
      return;
    }

    try {
      const access = await aprsService.getPdfAccess(id);
      if (access.url) {
        openUrlInNewTab(access.url);
        return;
      }

      if (currentApr.status === "Aprovada") {
        await handleEmitGovernedPdf();
        return;
      }

      toast.warning(
        access.message ||
          "O PDF final governado não está disponível para abertura agora.",
      );
    } catch (error) {
      console.error("Erro ao abrir PDF governado da APR:", error);
      toast.error("Não foi possível abrir o PDF final governado.");
    }
  }, [
    currentApr,
    handleEmitGovernedPdf,
    id,
    isOffline,
    registerOfflineBlocked,
  ]);

  const handleCreateVersion = useCallback(async () => {
    if (!id) return;
    try {
      setCreatingVersion(true);
      const newApr = await aprsService.createNewVersion(id);
      toast.success(`Nova versão criada: ${newApr.numero}`);
      router.push(`/dashboard/aprs/edit/${newApr.id}`);
    } catch (error) {
      console.error("Erro ao criar nova versão:", error);
      toast.error("Não foi possível criar nova versão.");
    } finally {
      setCreatingVersion(false);
    }
  }, [id, router]);

  const handleCompareVersions = useCallback(async () => {
    if (!id || !compareTargetId) return;
    try {
      setComparing(true);
      const result = await aprsService.compareVersions(id, compareTargetId);
      setCompareResult({ summary: result.summary });
      toast.success("Comparação de versões concluída.");
    } catch (error) {
      console.error("Erro ao comparar versões:", error);
      toast.error("Não foi possível comparar as versões.");
    } finally {
      setComparing(false);
    }
  }, [id, compareTargetId]);

  const handleCaptureLocation = useCallback(() => {
    if (isReadOnly) {
      notifyReadOnly(
        "Captura de localização não está disponível em uma APR bloqueada.",
      );
      return;
    }
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada neste navegador.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setEvidenceLatitude(String(position.coords.latitude));
        setEvidenceLongitude(String(position.coords.longitude));
        setEvidenceAccuracy(String(position.coords.accuracy));
        toast.success("Localização capturada.");
      },
      () => toast.error("Não foi possível capturar a localização."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [isReadOnly, notifyReadOnly]);

  const handleUploadEvidence = useCallback(async () => {
    if (isReadOnly) {
      notifyReadOnly(
        "Envio de evidências não está disponível em uma APR bloqueada.",
      );
      return;
    }
    if (!id || !selectedRiskItemEvidence || !evidenceFile) {
      toast.error("Selecione item de risco e imagem.");
      return;
    }
    if (!evidenceLatitude || !evidenceLongitude) {
      toast.error("Capture a geolocalização antes de enviar a evidência.");
      return;
    }
    if (!evidenceFile.type.startsWith("image/")) {
      toast.error("Envie uma imagem válida para manter a trilha de evidência.");
      return;
    }
    const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024; // 15 MB
    if (evidenceFile.size > MAX_EVIDENCE_BYTES) {
      toast.error(
        `A imagem excede o limite de 15 MB (${(evidenceFile.size / 1024 / 1024).toFixed(1)} MB). Compacte a imagem antes de enviar.`,
      );
      return;
    }
    try {
      setUploadingEvidence(true);
      await aprsService.uploadRiskEvidence(
        id,
        selectedRiskItemEvidence,
        evidenceFile,
        {
          captured_at: new Date().toISOString(),
          latitude: evidenceLatitude ? Number(evidenceLatitude) : undefined,
          longitude: evidenceLongitude ? Number(evidenceLongitude) : undefined,
          accuracy_m: evidenceAccuracy ? Number(evidenceAccuracy) : undefined,
          device_id:
            typeof window !== "undefined"
              ? window.navigator.userAgent.slice(0, 110)
              : undefined,
        },
      );
      const evidences = await aprsService.listAprEvidences(id);
      setAprEvidences(evidences);
      setEvidenceFile(null);
      toast.success("Evidência enviada com hash de integridade.");
    } catch (error) {
      console.error("Erro ao enviar evidência:", error);
      toast.error("Falha ao enviar evidência.");
    } finally {
      setUploadingEvidence(false);
    }
  }, [
    id,
    isReadOnly,
    notifyReadOnly,
    selectedRiskItemEvidence,
    evidenceFile,
    evidenceLatitude,
    evidenceLongitude,
    evidenceAccuracy,
  ]);

  const handleVerifyHash = useCallback(async () => {
    if (!hashToVerify.trim()) {
      toast.error("Informe o hash SHA-256 para validar.");
      return;
    }
    try {
      setVerifyingHash(true);
      const result = await aprsService.verifyEvidenceHash(hashToVerify.trim());
      setVerificationResult({
        verified: result.verified,
        matchedIn: result.matchedIn,
        message: result.message,
      });
      if (result.verified) {
        toast.success("Hash validado com sucesso.");
      } else {
        toast.error(result.message || "Hash não encontrado.");
      }
    } catch (error) {
      console.error("Erro ao verificar hash:", error);
      toast.error("Falha ao validar hash.");
    } finally {
      setVerifyingHash(false);
    }
  }, [hashToVerify]);

  useEffect(() => {
    async function loadData() {
      try {
        let companySeedId = isUuidLike(user?.company_id)
          ? String(user?.company_id)
          : "";

        const loadCompanies = async (selectedCompanyId?: string) => {
          const isGlobalAdmin = user?.profile?.nome === "Administrador Geral";
          let nextCompanies: Company[] = [];
          const scopedCompanyId = isUuidLike(selectedCompanyId)
            ? String(selectedCompanyId)
            : undefined;

          if (isGlobalAdmin) {
            try {
              const companiesPage = await companiesService.findPaginated({
                page: 1,
                limit: 100,
              });
              nextCompanies = companiesPage.data;
            } catch (error) {
              console.error(
                "Erro ao carregar lista de empresas da APR:",
                error,
              );
            }
          } else {
            const fallbackCompanyId =
              scopedCompanyId ||
              (isUuidLike(user?.company_id)
                ? String(user?.company_id)
                : undefined);
            if (fallbackCompanyId) {
              try {
                const selectedCompany =
                  await companiesService.findOne(fallbackCompanyId);
                nextCompanies = [selectedCompany];
              } catch (error) {
                console.error(
                  "Erro ao carregar empresa padrão da APR para o usuário:",
                  error,
                );
              }
            }
          }

          if (
            isGlobalAdmin &&
            scopedCompanyId &&
            !nextCompanies.some((company) => company.id === scopedCompanyId)
          ) {
            try {
              const selectedCompany =
                await companiesService.findOne(scopedCompanyId);
              nextCompanies = dedupeById([selectedCompany, ...nextCompanies]);
            } catch {
              nextCompanies = dedupeById(nextCompanies);
            }
          }

          setCompanies(dedupeById(nextCompanies));
        };

        if (id) {
          setLoadingTimeline(true);
          setDraftId(null);
          setDraftPendingOfflineSync(null);
          const [apr, sigs] = await Promise.all([
            aprsService.findOne(id),
            signaturesService.findByDocument(id, "APR"),
          ]);
          setCurrentApr(apr);
          const [logs, versions, evidences] = await Promise.all([
            aprsService.getLogs(id),
            aprsService.getVersionHistory(id),
            aprsService.listAprEvidences(id),
          ]);
          setAprLogs(logs);
          setAprEvidences(evidences);
          setVersionHistory(
            versions.map((item) => ({
              id: item.id,
              numero: item.numero,
              versao: item.versao,
              status: item.status,
            })),
          );

          // Pre-populate signatures state from backend
          const sigMap: Record<string, { data: string; type: string }> = {};
          const persistedSigMap: Record<
            string,
            { id?: string; data: string; type: string }
          > = {};
          sigs.forEach((s) => {
            if (!s.user_id) return;
            sigMap[s.user_id] = { data: s.signature_data, type: s.type };
            persistedSigMap[s.user_id] = {
              id: s.id,
              data: s.signature_data,
              type: s.type,
            };
          });
          setSignatures(sigMap);
          setPersistedSignatures(persistedSigMap);
          companySeedId = apr.company_id || companySeedId;
          setActivities(dedupeById(apr.activities || []));
          setRisks(dedupeById(apr.risks || []));
          setEpis(dedupeById(apr.epis || []));
          setTools(dedupeById(apr.tools || []));
          setMachines(dedupeById(apr.machines || []));
          setSites(dedupeById(apr.site ? [apr.site] : []));
          setUsers(
            dedupeById([
              ...(apr.elaborador ? [apr.elaborador] : []),
              ...(apr.participants || []),
              ...(apr.auditado_por ? [apr.auditado_por] : []),
            ]),
          );
          setSophieSuggestedRisks([]);
          setSophieMandatoryChecklists([]);

          reset({
            pdf_signed: Boolean(apr.pdf_file_key),
            numero: apr.numero,
            titulo: apr.titulo,
            descricao: apr.descricao || "",
            tipo_atividade: apr.tipo_atividade || "",
            frente_trabalho: apr.frente_trabalho || "",
            area_risco: apr.area_risco || "",
            turno: apr.turno || "",
            local_execucao_detalhado: apr.local_execucao_detalhado || "",
            responsavel_tecnico_nome: apr.responsavel_tecnico_nome || "",
            responsavel_tecnico_registro:
              apr.responsavel_tecnico_registro || "",
            data_inicio: toInputDateValue(apr.data_inicio),
            data_fim: toInputDateValue(apr.data_fim),
            status: apr.status,
            company_id: apr.company_id,
            site_id: apr.site_id,
            elaborador_id: apr.elaborador_id,
            activities: apr.activities.map((a: Activity) => a.id),
            risks: apr.risks.map((r: Risk) => r.id),
            epis: apr.epis.map((e: Epi) => e.id),
            tools: apr.tools.map((t: Tool) => t.id),
            machines: apr.machines.map((m: Machine) => m.id),
            participants: apr.participants.map((p: User) => p.id),
            is_modelo: apr.is_modelo || false,
            is_modelo_padrao: apr.is_modelo_padrao || false,
            itens_risco:
              apr.risk_items && apr.risk_items.length > 0
                ? apr.risk_items.map((item) => mapPersistedRiskItemToFormRow(item))
                : apr.itens_risco && apr.itens_risco.length > 0
                  ? apr.itens_risco.map((item) => normalizeRiskRow(item))
                  : [],
            auditado_por_id: apr.auditado_por_id || "",
            data_auditoria: toInputDateValue(apr.data_auditoria),
            resultado_auditoria: apr.resultado_auditoria || "",
            notas_auditoria: apr.notas_auditoria || "",
          });
          setLoadingTimeline(false);
        } else if (draftStorageKey && typeof window !== "undefined") {
          setPersistedSignatures({});
          setSignatures({});
          const draftReadResult = readAprDraft(
            draftStorageKey,
            legacyDraftStorageKey,
          );

          if (draftReadResult.corrupted) {
            trackAprOfflineTelemetry("draft_corrupted_discarded", {
              source: "apr_form_load",
            });
            setDraftSecurityNotice((prev) => ({ ...prev, corrupted: true }));
          }

          if (draftReadResult.removedSensitiveState) {
            trackAprOfflineTelemetry("draft_restored_sanitized", {
              draftId: draftReadResult.draft?.metadata.draftId,
              source: "apr_form_load",
            });
            setDraftSecurityNotice((prev) => ({
              ...prev,
              sensitiveDataRemoved: true,
            }));
          }

          if (draftReadResult.draft) {
            const parsedDraft = draftReadResult.draft;
            setDraftId(parsedDraft.metadata.draftId);

            if (draftReadResult.migratedFromLegacy) {
              trackAprOfflineTelemetry("draft_legacy_detected", {
                draftId: parsedDraft.metadata.draftId,
                source: "apr_form_load",
              });
            }

            if (parsedDraft.values) {
              reset({
                ...getValuesRef.current(),
                ...parsedDraft.values,
              });
              companySeedId = parsedDraft.values.company_id || companySeedId;
              replaceRisk(
                parsedDraft.values.itens_risco &&
                  parsedDraft.values.itens_risco.length > 0
                  ? parsedDraft.values.itens_risco.map((item) =>
                      normalizeRiskRow(item),
                    )
                  : [],
              );
            }

            setCurrentStep(parsedDraft.step);

            setSophieSuggestedRisks(parsedDraft.metadata?.suggestedRisks || []);
            setSophieMandatoryChecklists(
              parsedDraft.metadata?.mandatoryChecklists || [],
            );
            setDraftPendingOfflineSync(
              parsedDraft.metadata?.pendingOfflineSync || null,
            );

            setDraftRestored(true);
          } else {
            const initialMetadata = createAprDraftMetadata();
            setPersistedSignatures({});
            setSignatures({});
            setDraftId(initialMetadata.draftId);
            setSophieSuggestedRisks([]);
            setSophieMandatoryChecklists([]);
            setDraftPendingOfflineSync(null);
            const defaultAprPage = await aprsService.findPaginated({
              page: 1,
              limit: 20,
              companyId: user?.company_id,
              isModeloPadrao: true,
            });
            const defaultAprItem = defaultAprPage.data[0];

            if (defaultAprItem) {
              const defaultApr = await aprsService.findOne(defaultAprItem.id);
              companySeedId = defaultApr.company_id || companySeedId;
              setValue("company_id", defaultApr.company_id || "");
              setValue("titulo", defaultApr.titulo);
              setValue("descricao", defaultApr.descricao || "");
              setValue("tipo_atividade", defaultApr.tipo_atividade || "");
              setValue("frente_trabalho", defaultApr.frente_trabalho || "");
              setValue("area_risco", defaultApr.area_risco || "");
              setValue("turno", defaultApr.turno || "");
              setValue(
                "local_execucao_detalhado",
                defaultApr.local_execucao_detalhado || "",
              );
              setValue(
                "responsavel_tecnico_nome",
                defaultApr.responsavel_tecnico_nome || "",
              );
              setValue(
                "responsavel_tecnico_registro",
                defaultApr.responsavel_tecnico_registro || "",
              );
              setValue(
                "activities",
                (defaultApr.activities || []).map((activity) => activity.id),
              );
              setValue(
                "risks",
                (defaultApr.risks || []).map((risk) => risk.id),
              );
              setValue(
                "epis",
                (defaultApr.epis || []).map((epi) => epi.id),
              );
              setValue(
                "tools",
                (defaultApr.tools || []).map((tool) => tool.id),
              );
              setValue(
                "machines",
                (defaultApr.machines || []).map((machine) => machine.id),
              );
              setValue(
                "participants",
                (defaultApr.participants || []).map(
                  (participant) => participant.id,
                ),
              );
              replaceRisk(
                defaultApr.risk_items && defaultApr.risk_items.length > 0
                  ? defaultApr.risk_items.map((item) =>
                      mapPersistedRiskItemToFormRow(item),
                    )
                  : defaultApr.itens_risco && defaultApr.itens_risco.length > 0
                    ? defaultApr.itens_risco.map((item) => normalizeRiskRow(item))
                  : [],
              );
              setActivities(dedupeById(defaultApr.activities || []));
              setRisks(dedupeById(defaultApr.risks || []));
              setEpis(dedupeById(defaultApr.epis || []));
              setTools(dedupeById(defaultApr.tools || []));
              setMachines(dedupeById(defaultApr.machines || []));
              setSites(dedupeById(defaultApr.site ? [defaultApr.site] : []));
              setUsers(
                dedupeById([
                  ...(defaultApr.elaborador ? [defaultApr.elaborador] : []),
                  ...(defaultApr.participants || []),
                  ...(defaultApr.auditado_por ? [defaultApr.auditado_por] : []),
                ]),
              );
            }
          }
        }

        await loadCompanies(companySeedId);
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        toast.error("Erro ao carregar dados para o formulário.");
      } finally {
        setLoadingTimeline(false);
        setFetching(false);
      }
    }
    loadData();
  }, [
    draftStorageKey,
    id,
    legacyDraftStorageKey,
    replaceRisk,
    reset,
    setDraftId,
    setDraftPendingOfflineSync,
    setDraftRestored,
    setDraftSecurityNotice,
    setSophieMandatoryChecklists,
    setSophieSuggestedRisks,
    setValue,
    user?.company_id,
    user?.profile?.nome,
  ]);

  useEffect(() => {
    if (draftSecurityNotice.corrupted) {
      toast.warning(
        "Um rascunho local inválido foi descartado para proteger a integridade da APR.",
      );
      setDraftSecurityNotice((prev) => ({ ...prev, corrupted: false }));
    }

    if (draftSecurityNotice.sensitiveDataRemoved) {
      toast.warning(
        "Assinaturas antigas não foram restauradas do navegador por segurança. Recolha-as novamente quando estiver online.",
      );
      setDraftSecurityNotice((prev) => ({
        ...prev,
        sensitiveDataRemoved: false,
      }));
    }
  }, [draftSecurityNotice, setDraftSecurityNotice]);

  useEffect(() => {
    if (!draftPendingOfflineSync) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const queue = await getOfflineQueueSnapshot();
      if (cancelled) {
        return;
      }

      const queuedItem = queue.find(
        (item) =>
          item.id === draftPendingOfflineSync.queueItemId ||
          (draftPendingOfflineSync.dedupeKey &&
            item.dedupeKey === draftPendingOfflineSync.dedupeKey),
      );

      if (queuedItem) {
        const nextStatus: AprOfflineSyncStatus =
          queuedItem.state === "retry_waiting" ? "failed" : "queued";
        const nextError =
          queuedItem.state === "retry_waiting"
            ? queuedItem.lastError
            : undefined;

        if (
          draftPendingOfflineSync.queueItemId !== queuedItem.id ||
          draftPendingOfflineSync.status !== nextStatus ||
          draftPendingOfflineSync.lastError !== nextError
        ) {
          persistPendingOfflineSync({
            ...draftPendingOfflineSync,
            queueItemId: queuedItem.id,
            dedupeKey: queuedItem.dedupeKey,
            draftId: draftPendingOfflineSync.draftId,
            status: nextStatus,
            lastError: nextError,
            lastUpdatedAt: new Date().toISOString(),
          });
        }

        return;
      }

      if (
        draftPendingOfflineSync.status !== "synced_base" &&
        draftPendingOfflineSync.status !== "orphaned"
      ) {
        const nextPending = {
          ...draftPendingOfflineSync,
          status: "orphaned" as const,
          lastError:
            draftPendingOfflineSync.lastError ||
            "O envio local não foi encontrado na fila offline atual.",
          lastUpdatedAt: new Date().toISOString(),
        };
        persistPendingOfflineSync(nextPending);
        trackAprOfflineTelemetry("offline_orphaned", {
          draftId: draftPendingOfflineSync.draftId,
          queueItemId: draftPendingOfflineSync.queueItemId,
          dedupeKey: draftPendingOfflineSync.dedupeKey,
          syncStatus: "orphaned",
          source: "apr_form_reconcile",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftPendingOfflineSync, persistPendingOfflineSync]);

  useEffect(() => {
    if (!draftPendingOfflineSync) {
      return;
    }

    const handleOfflineSyncItem = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          status?: string;
          error?: string;
          item?: {
            id?: string;
            dedupeKey?: string;
          };
        }>
      ).detail;
      const itemId = detail?.item?.id;
      const dedupeKey = detail?.item?.dedupeKey;
      const matchesCurrentDraft =
        itemId === draftPendingOfflineSync.queueItemId ||
        (draftPendingOfflineSync.dedupeKey &&
          dedupeKey === draftPendingOfflineSync.dedupeKey);

      if (!matchesCurrentDraft) {
        return;
      }

      const now = new Date().toISOString();

      if (detail.status === "syncing") {
        persistPendingOfflineSync({
          ...draftPendingOfflineSync,
          status: "syncing",
          lastUpdatedAt: now,
        });
        trackAprOfflineTelemetry("offline_syncing", {
          draftId: draftPendingOfflineSync.draftId,
          queueItemId: draftPendingOfflineSync.queueItemId,
          dedupeKey: draftPendingOfflineSync.dedupeKey,
          syncStatus: "syncing",
          source: "offline_queue_event",
        });
        return;
      }

      if (detail.status === "sent") {
        persistPendingOfflineSync({
          ...draftPendingOfflineSync,
          status: "synced_base",
          lastError: undefined,
          lastUpdatedAt: now,
        });
        trackAprOfflineTelemetry("offline_synced", {
          draftId: draftPendingOfflineSync.draftId,
          queueItemId: draftPendingOfflineSync.queueItemId,
          dedupeKey: draftPendingOfflineSync.dedupeKey,
          syncStatus: "synced_base",
          source: "offline_queue_event",
        });
        return;
      }

      if (detail.status === "retry_scheduled") {
        persistPendingOfflineSync({
          ...draftPendingOfflineSync,
          status: "failed",
          lastError: detail.error,
          lastUpdatedAt: now,
        });
        trackAprOfflineTelemetry("offline_failed", {
          draftId: draftPendingOfflineSync.draftId,
          queueItemId: draftPendingOfflineSync.queueItemId,
          dedupeKey: draftPendingOfflineSync.dedupeKey,
          syncStatus: "failed",
          reason: detail.error,
          source: "offline_queue_event",
        });
        return;
      }

      if (detail.status === "deduplicated") {
        persistPendingOfflineSync({
          ...draftPendingOfflineSync,
          status: "queued",
          lastError: undefined,
          lastUpdatedAt: now,
        });
        trackAprOfflineTelemetry("offline_deduplicated", {
          draftId: draftPendingOfflineSync.draftId,
          queueItemId: draftPendingOfflineSync.queueItemId,
          dedupeKey: draftPendingOfflineSync.dedupeKey,
          syncStatus: "queued",
          source: "offline_queue_event",
        });
        return;
      }

      if (detail.status === "conflict") {
        toast.error(
          "Conflito de edição: a APR foi modificada por outro usuário enquanto você estava offline. Recarregue a página e aplique suas alterações novamente.",
          { duration: 8000 },
        );
        persistPendingOfflineSync({
          ...draftPendingOfflineSync,
          status: "failed",
          lastError: detail.error ?? "Conflito de edição simultânea.",
          lastUpdatedAt: now,
        });
        trackAprOfflineTelemetry("offline_conflict", {
          draftId: draftPendingOfflineSync.draftId,
          queueItemId: draftPendingOfflineSync.queueItemId,
          dedupeKey: draftPendingOfflineSync.dedupeKey,
          syncStatus: "failed",
          source: "offline_queue_event",
        });
        return;
      }

      if (
        detail.status === "removed" &&
        draftPendingOfflineSync.status !== "synced_base"
      ) {
        persistPendingOfflineSync({
          ...draftPendingOfflineSync,
          status: "orphaned",
          lastError: "O envio local foi removido da fila offline.",
          lastUpdatedAt: now,
        });
        trackAprOfflineTelemetry("offline_orphaned", {
          draftId: draftPendingOfflineSync.draftId,
          queueItemId: draftPendingOfflineSync.queueItemId,
          dedupeKey: draftPendingOfflineSync.dedupeKey,
          syncStatus: "orphaned",
          source: "offline_queue_event",
        });
      }
    };

    window.addEventListener(
      "app:offline-sync-item",
      handleOfflineSyncItem as EventListener,
    );

    return () => {
      window.removeEventListener(
        "app:offline-sync-item",
        handleOfflineSyncItem as EventListener,
      );
    };
  }, [draftPendingOfflineSync, persistPendingOfflineSync]);

  useEffect(() => {
    async function loadCompanyScopedCatalogs() {
      if (!selectedCompanyId) {
        setActivities([]);
        setRisks([]);
        setEpis([]);
        setTools([]);
        setMachines([]);
        setSites([]);
        setUsers([]);
        return;
      }

      if (!isUuidLike(selectedCompanyId)) {
        console.warn(
          "Empresa inválida ao carregar catálogos da APR:",
          selectedCompanyId,
        );
        setActivities([]);
        setRisks([]);
        setEpis([]);
        setTools([]);
        setMachines([]);
        setSites([]);
        setUsers([]);
        toast.error(
          "A empresa selecionada para a APR está inválida. Recarregue a tela e selecione novamente.",
        );
        return;
      }

      try {
        const [
          actResult,
          riskResult,
          epiResult,
          siteResult,
          userResult,
          toolResult,
          machineResult,
        ] = await Promise.allSettled([
          activitiesService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
          risksService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
          episService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
          sitesService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
          usersService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
            siteId: selectedSiteId || undefined,
          }),
          toolsService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
          machinesService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
        ]);

        const catalogFailures: string[] = [];

        const mergeCatalog = <T extends { id: string; company_id: string }>(
          result: PromiseSettledResult<{ data: T[] }>,
          label: string,
          setter: (updater: (prev: T[]) => T[]) => void,
        ) => {
          if (result.status === "fulfilled") {
            setter((prev) =>
              dedupeById([
                ...prev.filter((item) => item.company_id !== selectedCompanyId),
                ...result.value.data,
              ]),
            );
            return;
          }

          catalogFailures.push(label);
          console.error(
            `Erro ao carregar catálogo da APR: ${label}`,
            result.reason,
          );
        };

        mergeCatalog(actResult, "atividades", setActivities);
        mergeCatalog(riskResult, "riscos", setRisks);
        mergeCatalog(epiResult, "EPIs", setEpis);
        mergeCatalog(siteResult, "obras", setSites);
        mergeCatalog(userResult, "usuários", setUsers);
        mergeCatalog(toolResult, "ferramentas", setTools);
        mergeCatalog(machineResult, "máquinas", setMachines);

        if (catalogFailures.length > 0) {
          toast.error("Alguns catálogos da APR não puderam ser carregados.", {
            description: `Falharam: ${catalogFailures.join(", ")}.`,
          });
        }
      } catch (error) {
        console.error("Erro inesperado ao carregar catálogos da APR:", error);
        toast.error("Erro ao carregar catálogos da APR.");
      }
    }

    void loadCompanyScopedCatalogs();
  }, [selectedCompanyId, selectedSiteId]);

  useEffect(() => {
    if (id || selectedCompanyId) return;
    const companyId = user?.company_id;
    if (!isUuidLike(companyId)) return;
    setValue("company_id", String(companyId));
    if (isUuidLike(user?.site_id)) {
      setValue("site_id", String(user?.site_id));
    }
    if (isUuidLike(user?.id)) {
      setValue("elaborador_id", String(user?.id));
      setValue("participants", [String(user?.id)]);
    }
  }, [
    id,
    selectedCompanyId,
    setValue,
    user?.company_id,
    user?.id,
    user?.site_id,
  ]);

  useEffect(() => {
    if (isReadOnly) return;
    if (fetching) return;
    if (!draftStorageKey || typeof window === "undefined" || id) {
      return;
    }

    const subscription = watch(() => {
      scheduleDraftPersist();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [draftStorageKey, fetching, id, isReadOnly, scheduleDraftPersist, watch]);

  useEffect(() => {
    if (isReadOnly) return;
    if (fetching) return;
    if (!draftStorageKey || typeof window === "undefined" || id) {
      return;
    }

    scheduleDraftPersist();
  }, [
    currentStep,
    draftMetadata,
    draftStorageKey,
    fetching,
    id,
    isReadOnly,
    scheduleDraftPersist,
  ]);

  const toggleSelection = useCallback(
    (
      field:
        | "activities"
        | "risks"
        | "epis"
        | "tools"
        | "machines"
        | "participants",
      value: string,
    ) => {
      if (isReadOnly) {
        notifyReadOnly(
          "Não é possível alterar seleções/assinaturas em uma APR bloqueada.",
        );
        return;
      }
      const current = watch(field) || [];
      const isSelected = current.includes(value);

      if (field === "participants") {
        if (draftPendingOfflineSync) {
          registerOfflineBlocked("pending_sync_signature_lock");
          toast.warning(
            "Libere o rascunho pendente antes de alterar participantes ou assinaturas.",
          );
          return;
        }
        if (isSelected) {
          const updated = current.filter((id: string) => id !== value);
          setValue(field, updated, { shouldValidate: true });
          const newSignatures = { ...signatures };
          delete newSignatures[value];
          setSignatures(newSignatures);
        } else {
          if (isOffline) {
            registerOfflineBlocked("signature_capture_requires_online");
            toast.warning(
              "A captura de assinaturas da APR exige conexão ativa. Salve a APR base offline e conclua as assinaturas quando estiver online.",
            );
            return;
          }
          const user = users.find((u) => u.id === value);
          if (user) {
            setCurrentSigningUser(user);
            setIsSignatureModalOpen(true);
          }
        }
      } else {
        const updated = isSelected
          ? current.filter((id: string) => id !== value)
          : [...current, value];
        setValue(field, updated, { shouldValidate: true });
      }
    },
    [
      draftPendingOfflineSync,
      isOffline,
      isReadOnly,
      notifyReadOnly,
      registerOfflineBlocked,
      setValue,
      signatures,
      users,
      watch,
    ],
  );

  const handleSaveSignature = useCallback(
    (signatureData: string, type: string) => {
      if (isReadOnly) {
        notifyReadOnly(
          "Não é possível salvar assinaturas em uma APR bloqueada.",
        );
        return;
      }
      if (currentSigningUser) {
        setSignatures((prev) => ({
          ...prev,
          [currentSigningUser.id]: { data: signatureData, type },
        }));

        const current = watch("participants") || [];
        const updated = Array.from(
          new Set([...current, currentSigningUser.id]),
        );
        setValue("participants", updated, { shouldValidate: true });
        toast.success(`Assinatura de ${currentSigningUser.nome} capturada!`);
      }
    },
    [currentSigningUser, isReadOnly, notifyReadOnly, setValue, watch],
  );
  const handleReleasePendingOfflineState = useCallback(() => {
    if (!draftPendingOfflineSync) {
      return;
    }

    persistPendingOfflineSync(null);
    trackAprOfflineTelemetry("offline_released", {
      draftId: draftPendingOfflineSync.draftId,
      queueItemId: draftPendingOfflineSync.queueItemId,
      dedupeKey: draftPendingOfflineSync.dedupeKey,
      syncStatus: draftPendingOfflineSync.status,
      source: "manual_release",
    });
    toast.info(
      draftPendingOfflineSync.status === "synced_base"
        ? "A APR base já sincronizou. Agora você pode concluir assinaturas e emissão final online."
        : "O estado pendente foi liberado. Verifique a listagem antes de reenviar para evitar duplicidade operacional.",
    );
  }, [draftPendingOfflineSync, persistPendingOfflineSync]);
  const handleDiscardPendingOfflineSync = useCallback(async () => {
    if (!draftPendingOfflineSync) {
      return;
    }

    if (
      !confirm(
        "Descartar o envio local remove esta APR da fila offline e libera o rascunho para um novo envio. Deseja continuar?",
      )
    ) {
      return;
    }

    if (draftPendingOfflineSync.queueItemId) {
      await removeOfflineQueueItem(draftPendingOfflineSync.queueItemId);
    }

    persistPendingOfflineSync(null);
    trackAprOfflineTelemetry("offline_discarded", {
      draftId: draftPendingOfflineSync.draftId,
      queueItemId: draftPendingOfflineSync.queueItemId,
      dedupeKey: draftPendingOfflineSync.dedupeKey,
      syncStatus: draftPendingOfflineSync.status,
      source: "manual_discard",
    });
    toast.info(
      "O envio local foi descartado. O rascunho sanitizado continua disponível para novo envio controlado.",
    );
  }, [draftPendingOfflineSync, persistPendingOfflineSync]);
  const handleRetryPendingOfflineSync = useCallback(async () => {
    if (!draftPendingOfflineSync?.queueItemId) {
      return;
    }

    const result = await retryOfflineQueueItem(
      draftPendingOfflineSync.queueItemId,
    );
    if (result.status === "sent") {
      toast.success(
        "A APR base foi sincronizada. Conclua as assinaturas e a emissão final online.",
      );
      return;
    }

    if (result.status === "pending") {
      toast.info(
        "A sincronização foi tentada novamente. O envio local continua em acompanhamento.",
      );
      return;
    }

    toast.warning(
      "A retentativa não pôde concluir a sincronização agora. Revise o estado da fila ou descarte o envio local.",
    );
  }, [draftPendingOfflineSync?.queueItemId]);
  const canReleasePendingOfflineState =
    draftPendingOfflineSync?.status === "synced_base" ||
    draftPendingOfflineSync?.status === "orphaned";
  const canRetryPendingOfflineState =
    draftPendingOfflineSync?.status === "failed" &&
    Boolean(draftPendingOfflineSync.queueItemId);
  const saveAndPrintBlockReason = isOffline
    ? "Salvar e imprimir exige conexão ativa."
    : draftPendingOfflineSync
      ? "Existe uma sincronização pendente para este rascunho."
      : null;
  const saveBlockReason = draftPendingOfflineSync
    ? "Existe uma sincronização pendente para este rascunho."
    : null;

  const nextStep = useCallback(async () => {
    let fields: (keyof AprFormData)[] = [];
    let hasBlockingError = false;

    if (currentStep === 1) {
      fields = [
        "numero",
        "titulo",
        "tipo_atividade",
        "frente_trabalho",
        "turno",
        "local_execucao_detalhado",
        "responsavel_tecnico_nome",
        "responsavel_tecnico_registro",
        "company_id",
        "site_id",
        "elaborador_id",
        "data_inicio",
        "data_fim",
      ];
    } else if (currentStep === 2) {
      fields = ["participants", "itens_risco"];
    }

    const isValid = await trigger(fields);
    hasBlockingError = !isValid;

    if (currentStep === 1) {
      const requiredStepOneFields: Array<keyof AprFormData> = [
        "tipo_atividade",
        "frente_trabalho",
        "turno",
        "local_execucao_detalhado",
        "responsavel_tecnico_nome",
        "responsavel_tecnico_registro",
      ];

      const fieldMessages: Partial<Record<keyof AprFormData, string>> = {
        tipo_atividade: "Selecione o tipo de atividade da APR.",
        frente_trabalho: "Informe a frente de trabalho.",
        turno: "Informe o turno previsto.",
        local_execucao_detalhado:
          "Informe o local detalhado de execução da APR.",
        responsavel_tecnico_nome:
          "Informe o responsável técnico pela APR.",
        responsavel_tecnico_registro:
          "Informe o registro profissional do responsável técnico.",
      };

      requiredStepOneFields.forEach((field) => {
        if (hasText(getValues(field))) {
          clearErrors(field);
          return;
        }
        setError(field, {
          type: "manual",
          message: fieldMessages[field] || "Campo obrigatório.",
        });
        hasBlockingError = true;
      });
    } else if (currentStep === 2) {
      if (selectedParticipantIds.length === 0) {
        setError("participants", {
          type: "manual",
          message:
            "Selecione ao menos um participante assinante para avançar.",
        });
        hasBlockingError = true;
      } else {
        clearErrors("participants");
      }

      if (materiallyCompleteRiskCount === 0) {
        setError("itens_risco", {
          type: "manual",
          message:
            "Inclua pelo menos uma linha de risco com identificação, avaliação e controles para revisar a APR.",
        });
        hasBlockingError = true;
      } else {
        clearErrors("itens_risco");
      }
    }

    if (hasBlockingError) return;

    setCurrentStep((prev) => prev + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [
    clearErrors,
    currentStep,
    getValues,
    materiallyCompleteRiskCount,
    selectedParticipantIds.length,
    setError,
    trigger,
  ]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => prev - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (fetching) {
    return (
      <PageLoadingState
        title={id ? "Carregando APR" : "Preparando APR"}
        description="Buscando atividades, riscos, participantes e dados do documento para montar o fluxo."
        cards={3}
        tableRows={4}
      />
    );
  }

  return (
    <div
      className={cn(
        "ds-form-page mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500",
        currentStep === 2 ? "w-full max-w-[min(96vw,1880px)]" : "max-w-4xl",
        isFieldMode && currentStep !== 2 && "max-w-5xl pb-28",
        isFieldMode && currentStep === 2 && "pb-28",
      )}
    >
      <PageHeader
        eyebrow="Análise de risco"
        title={
          id ? "Editar APR" : isFieldMode ? "Nova APR em campo" : "Nova APR"
        }
        description={
          isFieldMode
            ? "Fluxo adaptado para obra e celular, com retomada automática do rascunho e foco em preenchimento rápido."
            : `Preencha os campos abaixo para ${id ? "atualizar" : "criar"} a Análise Preliminar de Risco.`
        }
        icon={
          <Link
            href="/dashboard/aprs"
            className={aprBackButtonClass}
            title="Voltar para APRs"
          >
            <ArrowLeft className="h-5 w-5 group-hover:-translate-x-0.5 transition-transform" />
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isFieldMode ? (
              <StatusPill tone="success">Modo campo</StatusPill>
            ) : null}
            {draftRestored ? (
              <StatusPill tone="warning">Rascunho ativo</StatusPill>
            ) : null}
            {!id && draftStorageKey ? (
              draftSaving ? (
                <StatusPill tone="neutral">Salvando rascunho…</StatusPill>
              ) : draftLastSavedAt ? (
                <StatusPill tone="success">
                  Rascunho salvo {draftLastSavedAt.toLocaleTimeString()}
                </StatusPill>
              ) : null
            ) : null}
            {watch("status") === "Aprovada" ? (
              <StatusPill tone="success">Aprovada</StatusPill>
            ) : watch("status") === "Cancelada" ? (
              <StatusPill tone="danger">Cancelada</StatusPill>
            ) : watch("status") === "Encerrada" ? (
              <StatusPill tone="neutral">Encerrada</StatusPill>
            ) : (
              <StatusPill tone="warning">Pendente</StatusPill>
            )}
            {id && currentApr?.versao ? (
              <StatusPill tone="primary">Versão {currentApr.versao}</StatusPill>
            ) : null}
          </div>
        }
      />

      {isFieldMode ? (
        <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-success)]">
                APR em campo
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                Registre atividade, riscos e controles no local da operação. O
                rascunho continua salvo enquanto você avança no wizard.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center md:w-[260px]">
              <div className={aprFieldStatCardClass}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                  Rascunho
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  Automático
                </p>
              </div>
              <div className={aprFieldStatCardClass}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                  Uso
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  Obra / celular
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {id && currentApr && (
        <div className="sst-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">
                {currentApr.numero} | Versão {currentApr.versao || 1}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Status: {currentApr.status}
                {currentApr.aprovado_em
                  ? ` | Aprovada em ${safeToLocaleString(currentApr.aprovado_em, "pt-BR", undefined, "data indisponível")}`
                  : ""}
                {currentApr.status === "Pendente" && pendingApprovalStep
                  ? ` | Próxima etapa: ${pendingApprovalStep.title}`
                  : ""}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canApproveCurrentApr && (
                <button
                  type="button"
                  onClick={handleApproveApr}
                  disabled={finalizing}
                  className={aprSuccessButtonCompactClass}
                >
                  {finalizing ? "Aprovando..." : "Aprovar APR"}
                </button>
              )}
              {isApproved && !hasFinalPdf && (
                <button
                  type="button"
                  onClick={handleEmitGovernedPdf}
                  disabled={emittingGovernedPdf || isOffline}
                  className={aprSuccessButtonCompactClass}
                >
                  {emittingGovernedPdf ? "Emitindo PDF..." : "Emitir PDF final"}
                </button>
              )}
              {isApproved && hasFinalPdf && (
                <button
                  type="button"
                  onClick={handleCloseApr}
                  disabled={closingApr}
                  className={aprSuccessButtonCompactClass}
                >
                  {closingApr ? "Encerrando..." : "Encerrar APR"}
                </button>
              )}
              {isApproved && (
                <button
                  type="button"
                  onClick={handleCreateVersion}
                  disabled={creatingVersion}
                  className={aprPrimaryCompactButtonClass}
                >
                  {creatingVersion ? "Criando..." : "Criar nova versão"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {id && (
        <div className="sst-card p-4">
          <h2 className={aprSectionTitleClass}>Timeline da APR</h2>
          <AprTimeline logs={aprLogs} loading={loadingTimeline} />
        </div>
      )}

      {id && approvalProgressStarted && (
        <AprApprovalPanel
          aprId={id}
          onStatusChange={() => reloadAprWorkflowContext(id)}
        />
      )}

      {id && !isReadOnly && (
        <div ref={compliancePanelRef}>
          <AprCompliancePanel
            aprId={id}
            formVersion={formVersion}
            onValidationChange={setComplianceResult}
          />
        </div>
      )}

      {id && versionHistory.length > 1 && (
        <div className="sst-card p-4">
          <h2 className={aprSectionTitleClass}>Comparação entre versões</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className={aprLabelCompactClass}>Comparar com</label>
              <select
                value={compareTargetId}
                onChange={(e) => setCompareTargetId(e.target.value)}
                className={aprFieldClass}
              >
                <option value="">Selecione uma versão</option>
                {versionHistory
                  .filter((item) => item.id !== id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.numero} | v{item.versao} | {item.status}
                    </option>
                  ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleCompareVersions}
              disabled={!compareTargetId || comparing}
              className={aprNeutralButtonClass}
            >
              {comparing ? "Comparando..." : "Comparar"}
            </button>
          </div>

          {compareResult && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
              <MiniStat label="Base" value={compareResult.summary.totalBase} />
              <MiniStat
                label="Alvo"
                value={compareResult.summary.totalTarget}
              />
              <MiniStat
                label="Adicionados"
                value={compareResult.summary.added}
              />
              <MiniStat
                label="Removidos"
                value={compareResult.summary.removed}
              />
              <MiniStat
                label="Alterados"
                value={compareResult.summary.changed}
              />
            </div>
          )}
        </div>
      )}

      {id && currentApr?.risk_items && currentApr.risk_items.length > 0 && (
        <div className="sst-card p-4">
          <h2 className={aprSectionTitleClass}>
            Evidência fotográfica da equipe
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={aprLabelCompactClass}>Item de risco</label>
              <select
                value={selectedRiskItemEvidence}
                onChange={(e) => setSelectedRiskItemEvidence(e.target.value)}
                disabled={isReadOnly}
                className={aprFieldClass}
              >
                <option value="">Selecione</option>
                {currentApr.risk_items
                  .slice()
                  .sort((a, b) => a.ordem - b.ordem)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      #{item.ordem + 1}{" "}
                      {item.atividade || item.condicao_perigosa || "Risco"}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={aprLabelCompactClass}>Foto da evidência</label>
              <input
                type="file"
                accept="image/*"
                aria-label="Selecionar foto da evidência da APR"
                onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                disabled={isReadOnly}
                className={aprFileFieldClass}
              />
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                min={-90}
                max={90}
                value={evidenceLatitude}
                onChange={(e) => setEvidenceLatitude(e.target.value)}
                placeholder="Latitude (-90 a 90)"
                aria-label="Latitude da evidência"
                disabled={isReadOnly}
                className={aprFieldClass}
              />
              <input
                type="number"
                step="any"
                min={-180}
                max={180}
                value={evidenceLongitude}
                onChange={(e) => setEvidenceLongitude(e.target.value)}
                placeholder="Longitude (-180 a 180)"
                aria-label="Longitude da evidência"
                disabled={isReadOnly}
                className={aprFieldClass}
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={evidenceAccuracy}
                onChange={(e) => setEvidenceAccuracy(e.target.value)}
                placeholder="Precisão (m)"
                aria-label="Precisão do GPS da evidência"
                disabled={isReadOnly}
                className={aprFieldClass}
              />
              <button
                type="button"
                onClick={handleCaptureLocation}
                disabled={isReadOnly}
                className={aprSoftPrimaryButtonClass}
              >
                Capturar GPS
              </button>
            </div>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={handleUploadEvidence}
              disabled={
                isReadOnly ||
                uploadingEvidence ||
                !selectedRiskItemEvidence ||
                !evidenceFile
              }
              className={aprSuccessButtonClass}
            >
              {uploadingEvidence ? "Enviando..." : "Enviar evidência"}
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {aprEvidences
              .filter((item) =>
                selectedRiskItemEvidence
                  ? item.apr_risk_item_id === selectedRiskItemEvidence
                  : true,
              )
              .slice(0, 6)
              .map((item) => (
                <div key={item.id} className={aprSubtleMetaCardClass}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--ds-color-text-primary)]">
                      {item.original_name || "Evidência"}
                    </span>
                    <span>
                      {safeToLocaleString(
                        item.uploaded_at,
                        "pt-BR",
                        undefined,
                        "data indisponível",
                      )}
                    </span>
                  </div>
                  <span>Hash SHA-256: {item.hash_sha256}</span>
                  {item.watermarked_hash_sha256 && (
                    <span>Hash watermark: {item.watermarked_hash_sha256}</span>
                  )}
                  {item.url && (
                    <div className="flex gap-3">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[var(--ds-color-text-primary)] hover:underline"
                      >
                        Abrir original
                      </a>
                      {item.watermarked_url && (
                        <a
                          href={item.watermarked_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-[var(--color-success)] hover:underline"
                        >
                          Abrir com watermark
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>

          <div className="mt-4 rounded-[var(--ds-radius-lg)] border border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/30 p-3">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Verificação criptográfica
            </h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={hashToVerify}
                onChange={(e) => setHashToVerify(e.target.value)}
                placeholder="Cole o hash SHA-256 da evidência"
                aria-label="Hash SHA-256 para verificação"
                className={aprFieldClass}
              />
              <button
                type="button"
                onClick={handleVerifyHash}
                disabled={verifyingHash}
                className={aprNeutralButtonClass}
              >
                {verifyingHash ? "Validando..." : "Validar hash"}
              </button>
            </div>
            {verificationResult && (
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                {verificationResult.verified
                  ? `Hash válido (${verificationResult.matchedIn === "watermarked" ? "imagem com watermark" : "imagem original"}).`
                  : verificationResult.message || "Hash não validado."}
              </p>
            )}
          </div>
        </div>
      )}

      {isReadOnly && readOnlyReason && (
        <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/22 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-[var(--ds-radius-lg)] bg-[color:var(--color-card-muted)]/30 p-2 text-[var(--ds-color-text-secondary)]">
              <Lock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--ds-color-text-primary)]">
                APR bloqueada para edição
              </p>
              <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                {readOnlyReason}
              </p>
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit((data) => {
          submitIntentRef.current = "save";
          return onSubmit(data);
        })}
        className="space-y-6"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.22fr)_minmax(320px,0.78fr)]">
          <div className="ds-dashboard-panel overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/12 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-secondary)]">
                  Fluxo operacional
                </p>
                <h2 className="mt-1 text-base font-bold text-[var(--ds-color-text-primary)]">
                  Emissão da APR por etapas
                </h2>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-color-text-secondary)]">
                <span className="rounded-full bg-[color:var(--ds-color-info-subtle)] px-2 py-0.5 text-[var(--color-info)]">
                  Etapa {currentStep}/3
                </span>
                <span>{APR_STEPS[currentStep - 1]?.title}</span>
              </div>
            </div>
            <nav aria-label="Etapas da APR">
              <div className="grid gap-3 px-5 py-4 lg:grid-cols-3" role="list">
                {APR_STEPS.map((step) => {
                  const Icon = step.icon;
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      role="listitem"
                      aria-current={isActive ? "step" : undefined}
                      aria-label={`Etapa ${step.id}: ${step.title}${isCompleted ? " (concluída)" : isActive ? " (em edição)" : ""}`}
                      onClick={() => {
                        if (step.id <= currentStep) {
                          setCurrentStep(step.id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }
                      }}
                      className={`w-full rounded-[var(--ds-radius-lg)] border px-3.5 py-3 text-left transition-all ${
                        isActive
                          ? "border-[var(--ds-color-action-primary)] bg-[color:var(--ds-color-info-subtle)] shadow-[var(--ds-shadow-xs)]"
                          : isCompleted
                            ? "border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)]/55 hover:border-[var(--ds-color-success)]/50"
                            : "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-md)] ${
                            isActive
                              ? "bg-[var(--color-info)] text-[var(--color-text-inverse)]"
                              : isCompleted
                                ? "bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]"
                                : "bg-[var(--ds-color-surface-muted)]/22 text-[var(--ds-color-text-secondary)]"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                              {step.title}
                            </p>
                            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                              {isCompleted
                                ? "Concluída"
                                : isActive
                                  ? "Em edição"
                                  : `Etapa ${step.id}`}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </nav>
            <div className="border-t border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-5 py-2.5">
              <p className="text-xs text-[var(--ds-color-text-secondary)]">
                <span className="font-semibold text-[var(--ds-color-text-primary)]">
                  Etapa atual:
                </span>{" "}
                {APR_STEPS[currentStep - 1]?.description}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="ds-dashboard-panel px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
                    Contexto da APR
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-[var(--ds-color-text-primary)]">
                    {tituloApr || "Título ainda não definido"}
                  </p>
                </div>
                {draftStorageKey && draftRestored ? (
                  <span className="shrink-0 rounded-full border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-warning)]">
                    Rascunho
                  </span>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <SummaryMetaCard
                  label="Empresa"
                  value={selectedCompany?.razao_social || "Não definida"}
                />
                <SummaryMetaCard
                  label="Obra"
                  value={selectedSite?.nome || "Não definida"}
                />
                <SummaryMetaCard
                  label="Elaborador"
                  value={selectedElaborador?.nome || "Não definido"}
                />
                <SummaryMetaCard
                  label="Tipo de atividade"
                  value={selectedActivityTypeLabel}
                />
                <SummaryMetaCard
                  label="Turno"
                  value={watch("turno") || "Não definido"}
                />
                <SummaryMetaCard
                  label="Status"
                  value={watch("status") || "Pendente"}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                <WizardMetric
                  label="Linhas"
                  value={String(totalRiskLines)}
                  tone="default"
                />
                <WizardMetric
                  label="Participantes"
                  value={String(selectedParticipantIds.length)}
                  tone="info"
                />
                <WizardMetric
                  label="Assinaturas"
                  value={String(completedSignatures)}
                  tone="success"
                />
                <WizardMetric
                  label="Evidências"
                  value={String(aprEvidences.length)}
                  tone="warning"
                />
              </div>

              <AprExecutiveSummary control={control} variant="badges" />

              {selectedParticipantIds.length > 0 ? (
                <div className="mt-3 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                      Participantes no fluxo
                    </p>
                    <span className="text-[11px] font-semibold text-[var(--ds-color-text-secondary)]">
                      {selectedParticipantIds.length} selecionado(s)
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {selectedParticipantIds.slice(0, 4).map((participantId) => {
                      const hasSignature = Boolean(signatures[participantId]);
                      const participant = filteredUsers.find(
                        (item) => item.id === participantId,
                      );
                      return (
                        <div
                          key={participantId}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="truncate font-medium text-[var(--ds-color-text-primary)]">
                            {participant?.nome || "Participante"}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                              hasSignature
                                ? "border border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]"
                                : "border border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)]",
                            )}
                          >
                            {hasSignature ? "Assinado" : "Pendente"}
                          </span>
                        </div>
                      );
                    })}
                    {selectedParticipantIds.length > 4 ? (
                      <p className="pt-1 text-[11px] font-medium text-[var(--ds-color-text-secondary)]">
                        +{selectedParticipantIds.length - 4} participante(s) no
                        fluxo.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div role="alert" className={`mt-3 ${aprWarningInlineClass}`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">
                        Fluxo de assinatura ainda incompleto.
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-[var(--color-warning)]/90">
                        Defina participantes e assinaturas antes de concluir a
                        APR.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {draftPendingOfflineSync && pendingOfflineSyncUi ? (
              <div
                role="alert"
                className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-4 py-4 text-sm text-[var(--color-warning)]"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[var(--ds-color-warning-border)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
                          {pendingOfflineSyncUi.badge}
                        </span>
                        <span className="text-xs uppercase tracking-[0.1em] text-[var(--color-warning)]/80">
                          Draft {draftPendingOfflineSync.draftId.slice(0, 8)}
                        </span>
                      </div>
                      <p className="font-semibold">
                        {pendingOfflineSyncUi.summary}
                      </p>
                      <p className="text-[var(--color-warning)]/90">
                        {pendingOfflineSyncUi.nextStep}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-warning-border)]/60 bg-[color:var(--ds-color-surface-overlay)]/50 p-3 text-xs text-[var(--color-warning)]/90 md:grid-cols-2">
                    <p>
                      Base da APR:{" "}
                      {draftPendingOfflineSync.status === "synced_base"
                        ? "sincronizada no servidor"
                        : "salva localmente neste navegador"}
                    </p>
                    <p>
                      Assinaturas finais: pendentes e obrigatoriamente online
                    </p>
                    <p>PDF final: bloqueado até a conclusão online</p>
                    <p>Emissão governada: bloqueada até a conclusão online</p>
                  </div>

                  {draftPendingOfflineSync.lastError ? (
                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-3 py-2 text-xs text-[var(--color-danger)]">
                      Última ocorrência: {draftPendingOfflineSync.lastError}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {canRetryPendingOfflineState ? (
                      <button
                        type="button"
                        onClick={() => void handleRetryPendingOfflineSync()}
                        className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-warning-border)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition-colors hover:bg-[color:var(--ds-color-warning-subtle)]"
                      >
                        Tentar sincronizar agora
                      </button>
                    ) : null}
                    {canReleasePendingOfflineState ? (
                      <button
                        type="button"
                        onClick={handleReleasePendingOfflineState}
                        className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-warning-border)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition-colors hover:bg-[color:var(--ds-color-warning-subtle)]"
                      >
                        Liberar rascunho
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleDiscardPendingOfflineSync()}
                      className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-danger-border)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-danger)] transition-colors hover:bg-[color:var(--ds-color-danger-subtle)]"
                    >
                      Descartar envio local
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {signatureChanges.hasPendingChanges ? (
              <div
                role="alert"
                className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-4 py-3 text-sm text-[var(--color-danger)]"
              >
                <p className="font-semibold">
                  Assinaturas capturadas ficam somente na memória desta sessão.
                </p>
                <p className="mt-1 text-[var(--color-danger)]/90">
                  Elas não são gravadas localmente nem entram na fila offline.
                  Reconecte-se para concluir o envio das assinaturas antes de
                  sair da tela.
                </p>
              </div>
            ) : null}

            <div className={aprDangerInlineClass}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Revisão final obrigatória</p>
                  <p className="mt-1 text-[var(--color-danger)]/90">
                    Não finalize a APR sem revisar a matriz de risco, controles
                    sugeridos e evidências associadas ao trabalho.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {currentStep === 2 && isReadOnly && (
            <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4 shadow-[var(--ds-shadow-sm)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
                    Ações seguras em somente leitura
                  </p>
                  <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                    Exportação e navegação visual continuam disponíveis sem
                    reabrir edição da APR.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadExcel(
                        "/aprs/export/excel/template",
                        "apr-template-importacao.xlsx",
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm font-semibold text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]"
                  >
                    <Download className="h-4 w-4" />
                    Template
                  </button>
                  {id ? (
                    <button
                      type="button"
                      onClick={() =>
                        downloadExcel(
                          `/aprs/${id}/export/excel`,
                          `apr-${id}.xlsx`,
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm font-semibold text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]"
                    >
                      <Download className="h-4 w-4" />
                      Exportar Excel
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setCompactMode((v) => !v);
                      setExpandedRows(new Set());
                    }}
                    className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm font-semibold text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]"
                  >
                    {compactMode ? (
                      <Maximize2 className="h-4 w-4" />
                    ) : (
                      <Minimize2 className="h-4 w-4" />
                    )}
                    {compactMode ? "Expandir linhas" : "Modo compacto"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <fieldset
            disabled={isReadOnly}
            className="border-none p-0 m-0 min-w-0"
          >
            {currentStep === 1 && (
              <div className={aprInteractivePanelClass}>
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
                    Informações Básicas
                    <span className="h-2 w-2 rounded-full bg-[var(--ds-color-action-primary)]"></span>
                  </h2>
                  {aiEnabled && (
                    <button
                      type="button"
                      onClick={handleAiAnalysis}
                      disabled={analyzing}
                      className="group flex items-center justify-center space-x-2 rounded-[var(--ds-radius-md)] bg-[var(--component-button-primary-bg)] px-4 py-2.5 text-sm font-bold text-[var(--color-text-inverse)] shadow-[var(--ds-shadow-md)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-lg)] active:scale-95 disabled:opacity-50"
                    >
                      {analyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                      )}
                      <span>Analisar com SGS</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <label htmlFor="apr-numero" className={aprLabelClass}>
                      Número da APR
                    </label>
                    <input
                      id="apr-numero"
                      type="text"
                      {...register("numero")}
                      className={cn(
                        aprFieldClass,
                        errors.numero && aprFieldErrorClass,
                      )}
                      placeholder="Ex: 2024/001"
                    />
                    {errors.numero && (
                      <p className={aprErrorTextClass}>
                        {errors.numero.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="apr-titulo" className={aprLabelClass}>
                      Título da APR
                    </label>
                    <input
                      id="apr-titulo"
                      type="text"
                      {...register("titulo")}
                      className={cn(
                        aprFieldClass,
                        errors.titulo && aprFieldErrorClass,
                      )}
                      placeholder="Ex: Instalação de Painéis Solares"
                    />
                    {errors.titulo && (
                      <p className={aprErrorTextClass}>
                        {errors.titulo.message}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="apr-descricao" className={aprLabelClass}>
                      Descrição/Escopo
                    </label>
                    <textarea
                      id="apr-descricao"
                      {...register("descricao")}
                      rows={3}
                      maxLength={2000}
                      className={aprFieldClass}
                      placeholder="Descreva o escopo do trabalho..."
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="apr-tipo-atividade"
                      className={aprLabelClass}
                    >
                      Tipo de atividade
                    </label>
                    <select
                      id="apr-tipo-atividade"
                      {...register("tipo_atividade")}
                      className={cn(
                        aprFieldClass,
                        errors.tipo_atividade && aprFieldErrorClass,
                      )}
                    >
                      <option value="">Selecione um tipo de atividade</option>
                      {activityTemplates.map((template) => (
                        <option
                          key={template.tipo_atividade}
                          value={template.tipo_atividade}
                        >
                          {template.label}
                        </option>
                      ))}
                    </select>
                    {errors.tipo_atividade && (
                      <p className={aprErrorTextClass}>
                        {errors.tipo_atividade.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="apr-turno" className={aprLabelClass}>
                      Turno
                    </label>
                    <select
                      id="apr-turno"
                      {...register("turno")}
                      className={cn(
                        aprFieldClass,
                        errors.turno && aprFieldErrorClass,
                      )}
                    >
                      <option value="">Selecione o turno</option>
                      <option value="Diurno">Diurno</option>
                      <option value="Noturno">Noturno</option>
                      <option value="Integral">Integral</option>
                      <option value="Revezamento">Revezamento</option>
                    </select>
                    {errors.turno && (
                      <p className={aprErrorTextClass}>{errors.turno.message}</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="apr-frente-trabalho"
                      className={aprLabelClass}
                    >
                      Frente de trabalho
                    </label>
                    <input
                      id="apr-frente-trabalho"
                      {...register("frente_trabalho")}
                      className={cn(
                        aprFieldClass,
                        errors.frente_trabalho && aprFieldErrorClass,
                      )}
                      placeholder="Ex: Linha 02, setor de manutenção, área quente"
                    />
                    {errors.frente_trabalho && (
                      <p className={aprErrorTextClass}>
                        {errors.frente_trabalho.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="apr-area-risco" className={aprLabelClass}>
                      Área / setor de risco
                    </label>
                    <input
                      id="apr-area-risco"
                      {...register("area_risco")}
                      className={aprFieldClass}
                      placeholder="Ex: Subestação, cobertura, galpão A"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-primary-border)] bg-[color:var(--ds-color-primary-subtle)]/45 px-4 py-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
                            Template técnico
                          </p>
                          <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                            {selectedActivityTemplate?.label ||
                              selectedActivityTemplateSummary?.label ||
                              "Selecione um tipo de atividade para carregar riscos base"}
                          </p>
                          <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                            {loadingActivityTemplate
                              ? "Carregando referência técnica do tipo de atividade..."
                              : selectedActivityTemplate?.descricao ||
                                "Use templates reutilizáveis para pré-carregar riscos, etapas e controles recorrentes da operação."}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={applySelectedActivityTemplate}
                          disabled={
                            loadingActivityTemplate || !selectedActivityTemplate
                          }
                          className={aprSoftPrimaryButtonClass}
                        >
                          {loadingActivityTemplate
                            ? "Carregando..."
                            : "Aplicar template à grade"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label
                      htmlFor="apr-local-detalhado"
                      className={aprLabelClass}
                    >
                      Local detalhado de execução
                    </label>
                    <textarea
                      id="apr-local-detalhado"
                      {...register("local_execucao_detalhado")}
                      rows={2}
                      className={cn(
                        aprFieldClass,
                        errors.local_execucao_detalhado && aprFieldErrorClass,
                      )}
                      placeholder="Ex: Cobertura do bloco administrativo, face leste, acesso por plataforma elevatória"
                    />
                    {errors.local_execucao_detalhado && (
                      <p className={aprErrorTextClass}>
                        {errors.local_execucao_detalhado.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="apr-responsavel-tecnico"
                      className={aprLabelClass}
                    >
                      Responsável técnico
                    </label>
                    <input
                      id="apr-responsavel-tecnico"
                      {...register("responsavel_tecnico_nome")}
                      className={cn(
                        aprFieldClass,
                        errors.responsavel_tecnico_nome && aprFieldErrorClass,
                      )}
                      placeholder="Nome do responsável técnico"
                    />
                    {errors.responsavel_tecnico_nome && (
                      <p className={aprErrorTextClass}>
                        {errors.responsavel_tecnico_nome.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="apr-responsavel-registro"
                      className={aprLabelClass}
                    >
                      Registro profissional
                    </label>
                    <input
                      id="apr-responsavel-registro"
                      {...register("responsavel_tecnico_registro")}
                      className={cn(
                        aprFieldClass,
                        errors.responsavel_tecnico_registro &&
                          aprFieldErrorClass,
                      )}
                      placeholder="Ex: CREA 000000 / TST 00000"
                    />
                    {errors.responsavel_tecnico_registro && (
                      <p className={aprErrorTextClass}>
                        {errors.responsavel_tecnico_registro.message}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-primary-border)] bg-[color:var(--ds-color-primary-subtle)]/45 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
                        Governança documental
                      </p>
                      <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                        O PDF final não faz parte do preenchimento básico desta
                        etapa. Depois da aprovação, use o fluxo oficial da APR
                        para emitir, abrir ou compartilhar o documento
                        governado.
                      </p>
                      {hasFinalPdf ? (
                        <p className="mt-2 text-sm font-semibold text-[var(--color-success)]">
                          Esta APR já possui PDF final emitido e está bloqueada
                          para edição.
                        </p>
                      ) : isApproved ? (
                        <p className="mt-2 text-sm font-semibold text-[var(--color-warning)]">
                          APR aprovada. O próximo passo é emitir o PDF final
                          governado antes do encerramento.
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {isApproved && !hasFinalPdf ? (
                          <button
                            type="button"
                            onClick={handleEmitGovernedPdf}
                            disabled={emittingGovernedPdf || isOffline}
                            className={aprPrimaryCompactButtonClass}
                          >
                            {emittingGovernedPdf
                              ? "Emitindo PDF..."
                              : "Emitir PDF final"}
                          </button>
                        ) : null}
                        {hasFinalPdf ? (
                          <button
                            type="button"
                            onClick={handleOpenGovernedPdf}
                            disabled={isOffline}
                            className={aprGhostActionClass}
                          >
                            Abrir PDF governado
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="apr-company" className={aprLabelClass}>
                      Empresa
                    </label>
                    <select
                      id="apr-company"
                      {...register("company_id")}
                      className={cn(
                        aprFieldClass,
                        errors.company_id && aprFieldErrorClass,
                      )}
                      onChange={(e) => {
                        const companyId = e.target.value;
                        setValue("company_id", companyId);
                        setValue("site_id", "");
                        setValue("elaborador_id", "");
                        setValue("activities", []);
                        setValue("risks", []);
                        setValue("epis", []);
                        setValue("tools", []);
                        setValue("machines", []);
                        setValue("participants", []);
                      }}
                    >
                      <option value="">Selecione uma empresa</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.razao_social}
                        </option>
                      ))}
                    </select>
                    {errors.company_id && (
                      <p className={aprErrorTextClass}>
                        {errors.company_id.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="apr-site" className={aprLabelClass}>
                      Site/Obra
                    </label>
                    <select
                      id="apr-site"
                      {...register("site_id")}
                      disabled={!selectedCompanyId}
                      className={cn(
                        aprFieldClass,
                        errors.site_id && aprFieldErrorClass,
                        !selectedCompanyId && aprFieldDisabledClass,
                      )}
                    >
                      <option value="">
                        {selectedCompanyId
                          ? "Selecione um site"
                          : "Selecione uma empresa primeiro"}
                      </option>
                      {filteredSites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.nome}
                        </option>
                      ))}
                    </select>
                    {errors.site_id && (
                      <p className={aprErrorTextClass}>
                        {errors.site_id.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="apr-elaborador" className={aprLabelClass}>
                      Elaborador
                    </label>
                    <select
                      id="apr-elaborador"
                      {...register("elaborador_id")}
                      disabled={!selectedCompanyId}
                      className={cn(
                        aprFieldClass,
                        errors.elaborador_id && aprFieldErrorClass,
                        !selectedCompanyId && aprFieldDisabledClass,
                      )}
                    >
                      <option value="">
                        {selectedCompanyId
                          ? "Selecione um elaborador"
                          : "Selecione uma empresa primeiro"}
                      </option>
                      {filteredUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.nome}
                        </option>
                      ))}
                    </select>
                    {errors.elaborador_id && (
                      <p className={aprErrorTextClass}>
                        {errors.elaborador_id.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className={aprLabelClass}>Status</p>
                    <div className="flex min-h-[2.875rem] items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)] px-4 py-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          watch("status") === "Aprovada" &&
                            "bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success-fg)] border border-[var(--ds-color-success-border)]",
                          watch("status") === "Pendente" &&
                            "bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning-fg)] border border-[var(--ds-color-warning-border)]",
                          watch("status") === "Cancelada" &&
                            "bg-[color:var(--ds-color-danger-subtle)] text-[var(--ds-color-danger-fg)] border border-[var(--ds-color-danger-border)]",
                          watch("status") === "Encerrada" &&
                            "bg-[color:var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] border border-[var(--ds-color-border-subtle)]",
                        )}
                      >
                        {watch("status") || "Pendente"}
                      </span>
                      <span className="text-xs text-[var(--ds-color-text-muted)]">
                        Controlado pelo fluxo formal
                      </span>
                    </div>
                    <input type="hidden" {...register("status")} />
                  </div>

                  <div>
                    <label htmlFor="apr-data-inicio" className={aprLabelClass}>
                      Data Início
                    </label>
                    <input
                      id="apr-data-inicio"
                      type="date"
                      {...register("data_inicio")}
                      className={cn(aprFieldClass, errors.data_inicio && aprFieldErrorClass)}
                    />
                    {errors.data_inicio && (
                      <p className={aprErrorTextClass}>{errors.data_inicio.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="apr-data-fim" className={aprLabelClass}>
                      Data Fim
                    </label>
                    <input
                      id="apr-data-fim"
                      type="date"
                      {...register("data_fim")}
                      min={dataInicioApr || undefined}
                      className={cn(aprFieldClass, errors.data_fim && aprFieldErrorClass)}
                    />
                    {errors.data_fim && (
                      <p className={aprErrorTextClass}>{errors.data_fim.message}</p>
                    )}
                  </div>

                  <div className="flex flex-col space-y-3 md:flex-row md:space-x-6 md:space-y-0 md:col-span-2 pt-2">
                    <label
                      htmlFor="apr-is-modelo"
                      className="flex items-center space-x-3 cursor-pointer group"
                    >
                      <input
                        id="apr-is-modelo"
                        type="checkbox"
                        {...register("is_modelo")}
                        className={aprCheckboxClass}
                      />
                      <span className="text-sm font-semibold text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-text)]">
                        Salvar como Modelo
                      </span>
                    </label>

                    {isModelo && (
                      <label
                        htmlFor="apr-is-modelo-padrao"
                        className="flex items-center space-x-3 cursor-pointer group animate-in slide-in-from-left-2 duration-300"
                      >
                        <input
                          id="apr-is-modelo-padrao"
                          type="checkbox"
                          {...register("is_modelo_padrao")}
                          className={aprCheckboxClass}
                        />
                        <span className="text-sm font-semibold text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-text)]">
                          Definir como Modelo Padrão
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <>
                <div className="space-y-6">
                  {(sophieSuggestedRisks.length > 0 ||
                    sophieMandatoryChecklists.length > 0) && (
                    <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-primary-border)] bg-[color:var(--ds-color-primary-subtle)]/45 p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                            Sugestões da SOPHIE
                          </p>
                          <h3 className="mt-2 text-lg font-bold text-[var(--color-text)]">
                            Aplicações rápidas para esta APR
                          </h3>
                          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                            Use um clique para refletir os riscos sugeridos na
                            seleção e na planilha, ou abrir os checklists
                            operacionais recomendados.
                          </p>
                        </div>
                        {sophieSuggestedRisks.length > 0 ? (
                          <button
                            type="button"
                            onClick={applyAllSuggestedAprRisks}
                            className={aprSoftPrimaryButtonClass}
                          >
                            Aplicar todos os riscos
                          </button>
                        ) : null}
                      </div>

                      {sophieSuggestedRisks.length > 0 ? (
                        <div className="mt-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
                            Riscos sugeridos
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {sophieSuggestedRisks.map((suggestion, index) => {
                              const alreadySelected =
                                (suggestion.id &&
                                  selectedRiskIds.includes(suggestion.id)) ||
                                hasSuggestedRiskInMatrix(suggestion);
                              return (
                                <button
                                  key={`${suggestion.label}-${index}`}
                                  type="button"
                                  onClick={() =>
                                    applySuggestedAprRisk(suggestion)
                                  }
                                  className={cn(
                                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                                    alreadySelected
                                      ? "border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]"
                                      : "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--color-danger)] hover:bg-[color:var(--ds-color-danger-subtle)]/70",
                                  )}
                                >
                                  {suggestion.label}
                                  {suggestion.category
                                    ? ` • ${suggestion.category}`
                                    : ""}
                                  {alreadySelected
                                    ? " • Aplicado"
                                    : " • Aplicar"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {sophieMandatoryChecklists.length > 0 ? (
                        <div className="mt-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
                            Checklists de apoio recomendados
                          </p>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            {sophieMandatoryChecklists.map((suggestion) => (
                              <div
                                key={suggestion.id}
                                className="rounded-[var(--ds-radius-lg)] border border-[var(--color-border-subtle)] bg-[color:var(--color-card)] p-3"
                              >
                                <p className="text-sm font-semibold text-[var(--color-text)]">
                                  {suggestion.label}
                                </p>
                                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                                  {suggestion.reason}
                                </p>
                                <Link
                                  href={buildChecklistSuggestionHref(
                                    suggestion,
                                  )}
                                  className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                                >
                                  Abrir checklist recomendado
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {isOffline ? (
                    <div
                      role="alert"
                      className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-4 py-3 text-sm text-[var(--color-warning)]"
                    >
                      As assinaturas da APR ficam bloqueadas offline. Continue a
                      APR base e volte online para capturar ou reenviar as
                      assinaturas.
                    </div>
                  ) : null}
                  <SectionGrid
                    title="Participantes e Assinaturas"
                    items={filteredUsers}
                    selectedIds={selectedParticipantIds}
                    onToggle={(id) => toggleSelection("participants", id)}
                    signatures={signatures}
                    helperText="Selecione os participantes da APR e acompanhe quem ainda precisa concluir a assinatura obrigatória."
                  />
                  {errors.participants && (
                    <div className={aprDangerInlineClass}>
                      {errors.participants.message}
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="overflow-hidden rounded-[calc(var(--ds-radius-xl)+4px)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-sm)]">
                    <input
                      ref={excelInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={handleExcelFileSelection}
                    />
                    <div className="sticky top-24 z-20 border-b border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/96 px-4 py-3 backdrop-blur">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="max-w-3xl">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-secondary)]">
                            Grade operacional da APR
                          </p>
                          <h2 className="mt-1 text-xl font-black leading-tight text-[var(--ds-color-text-primary)]">
                            Matriz operacional de riscos e governança
                          </h2>
                          <p className="mt-1 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
                            Lance riscos, revise pendências e mantenha a
                            rastreabilidade sem sair da grade principal.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                          <button
                            type="button"
                            onClick={() => excelInputRef.current?.click()}
                            disabled={importingExcel || isReadOnly}
                            className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-xs font-semibold text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)] disabled:opacity-60"
                          >
                            {importingExcel ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                            Importar Excel
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadExcel(
                                "/aprs/export/excel/template",
                                "apr-template-importacao.xlsx",
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-xs font-semibold text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]"
                          >
                            <Download className="h-4 w-4" />
                            Template
                          </button>
                          {id ? (
                            <button
                              type="button"
                              onClick={() =>
                                downloadExcel(
                                  `/aprs/${id}/export/excel`,
                                  `apr-${id}.xlsx`,
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-xs font-semibold text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]"
                            >
                              <Download className="h-4 w-4" />
                              Exportar Excel
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setCompactMode((v) => !v);
                              setExpandedRows(new Set());
                            }}
                            className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-xs font-semibold text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]"
                            title={
                              compactMode
                                ? "Expandir todas as linhas"
                                : "Modo compacto"
                            }
                          >
                            {compactMode ? (
                              <Maximize2 className="h-4 w-4" />
                            ) : (
                              <Minimize2 className="h-4 w-4" />
                            )}
                            {compactMode ? "Expandir linhas" : "Modo compacto"}
                          </button>
                          <button
                            type="button"
                            onClick={handleSuggestControls}
                            disabled={suggestingControls || isReadOnly}
                            className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-primary-border)] bg-[color:var(--ds-color-primary-subtle)] px-3 py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors hover:bg-[color:var(--ds-color-primary-subtle)]/78 disabled:opacity-60"
                          >
                            {suggestingControls ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                            Sugerir Controles
                          </button>
                          {!isReadOnly ? (
                            <button
                              type="button"
                              onClick={() => appendRisk(createEmptyRiskRow())}
                              className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--component-button-primary-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text-inverse)] shadow-[var(--ds-shadow-sm)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)]"
                            >
                              <Plus className="h-4 w-4" />
                              Adicionar linha
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {excelPreview ? (
                      <div className="mx-5 mt-5 rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 p-4 shadow-[var(--ds-shadow-xs)]">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                              Preview da planilha
                            </p>
                            <h3 className="mt-1 text-sm font-bold text-[var(--ds-color-text-primary)]">
                              {excelPreview.fileName}
                            </h3>
                            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                              {excelPreview.importedRows} linha(s) pronta(s) ·{" "}
                              {excelPreview.ignoredRows} ignorada(s)
                            </p>
                          </div>
                          {excelPreview.errors.length === 0 && !isReadOnly ? (
                            <button
                              type="button"
                              onClick={() =>
                                applyExcelPreviewToForm(excelPreview)
                              }
                              className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--component-button-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] shadow-[var(--ds-shadow-sm)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)]"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Aplicar ao formulário
                            </button>
                          ) : null}
                        </div>

                        {excelPreview.warnings.length > 0 ? (
                          <div className="mt-3 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-3 py-2 text-sm text-[var(--color-warning)]">
                            {excelPreview.warnings[0]}
                          </div>
                        ) : null}

                        {excelPreview.errors.length > 0 ? (
                          <div className="mt-3 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]">
                            {excelPreview.errors[0]}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mx-5 mt-3 overflow-hidden rounded-[calc(var(--ds-radius-xl)+2px)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/68">
                      <div className="flex flex-col gap-2 border-b border-[var(--ds-color-border-subtle)] px-4 py-2.5 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-secondary)]">
                            Contexto da APR
                          </p>
                          <p className="mt-1 truncate text-sm font-bold text-[var(--ds-color-text-primary)]">
                            {tituloApr || "APR sem descrição operacional"}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-5 text-[var(--ds-color-text-secondary)]">
                            Contexto mínimo para orientar a grade e a revisão.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-color-text-secondary)]">
                            <ClipboardList className="h-3.5 w-3.5" />
                            {totalRiskLines} linha(s) em edição
                          </div>
                          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-color-text-secondary)]">
                            Revisão {currentApr?.versao || 1}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2 px-4 py-2.5 md:grid-cols-2 xl:grid-cols-6">
                        <SummaryMetaCard
                          label="Descrição"
                          value={tituloApr || "-"}
                        />
                        <SummaryMetaCard
                          label="Empresa"
                          value={selectedCompany?.razao_social || "-"}
                        />
                        <SummaryMetaCard
                          label="Site / obra"
                          value={selectedSite?.nome || "-"}
                        />
                        <SummaryMetaCard
                          label="Data"
                          value={dataInicioApr || "-"}
                        />
                        <SummaryMetaCard
                          label="Revisão / versão"
                          value={`${new Date().toLocaleDateString("pt-BR")} / v${currentApr?.versao || 1}`}
                        />
                        <SummaryMetaCard
                          label="Responsável"
                          value={selectedElaborador?.nome || "-"}
                        />
                      </div>
                    </div>

                    {/* Executive Summary Panel */}
                    <div className="mx-5 mt-3">
                      <AprExecutiveSummary
                        control={control}
                        variant="panel"
                        compactMode={compactMode}
                        showCompactToggle={false}
                        onToggleCompactMode={() => {
                          setCompactMode((v) => !v);
                          setExpandedRows(new Set());
                        }}
                      />
                    </div>

                    <div className="mx-5 mt-3">
                      {errors.itens_risco && (
                        <div className="mb-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]">
                          {errors.itens_risco.message}
                        </div>
                      )}

                      <div className="overflow-hidden rounded-[calc(var(--ds-radius-xl)+2px)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]">
                        {riskFields.length === 0 ? (
                          <div className="px-6 py-10 text-center">
                            <p className="text-base font-semibold text-[var(--ds-color-text-primary)]">
                              Nenhuma linha adicionada ainda.
                            </p>
                            <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                              Comece pela primeira atividade crítica ou traga
                              uma planilha existente para acelerar a matriz.
                            </p>
                            <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
                              {!isReadOnly ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    appendRisk(createEmptyRiskRow())
                                  }
                                  className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--component-button-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] shadow-[var(--ds-shadow-sm)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)]"
                                >
                                  <Plus className="h-4 w-4" />
                                  Adicionar primeira linha
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => excelInputRef.current?.click()}
                                disabled={importingExcel || isReadOnly}
                                className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 py-2 text-sm font-semibold text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)] disabled:opacity-60"
                              >
                                {importingExcel ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Upload className="h-4 w-4" />
                                )}
                                Importar Excel
                              </button>
                            </div>
                            <div className="mt-4 inline-flex max-w-2xl items-start gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] px-3 py-2 text-left text-xs text-[var(--color-info)]">
                              <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>
                                Use importação quando a APR já existir em
                                planilha. Use adição manual quando a análise
                                estiver sendo construída direto no sistema.
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <AprRiskGridHeader
                              hiddenCompactDetailsCount={hiddenCompactDetailsCount}
                            />
                            <div className="space-y-3 p-3">
                              {riskFields.map((field, index) => {
                                return (
                                  <AprRiskRow
                                    key={field.id}
                                    fieldId={field.id}
                                    index={index}
                                    totalRows={riskFields.length}
                                    readOnly={isReadOnly}
                                    compactMode={compactMode}
                                    expanded={expandedRows.has(index)}
                                    onToggleExpanded={toggleExpandedRow}
                                    onMove={moveRiskRow}
                                    onDuplicate={duplicateRiskRow}
                                    onRemove={handleRemoveRiskRow}
                                    control={control}
                                    register={register}
                                    setValue={setValue}
                                    aprFieldClass={aprFieldClass}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1.16fr)_minmax(320px,0.84fr)]">
                    <AprRiskReferencePanel
                      getActionCriteriaText={getActionCriteriaText}
                    />
                    <div className="rounded-[calc(var(--ds-radius-xl)+2px)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4 shadow-[var(--ds-shadow-xs)]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
                        Feedback visual
                      </p>
                      <h3 className="mt-1.5 text-sm font-black text-[var(--ds-color-text-primary)]">
                        Leitura rápida da grade
                      </h3>
                      <div className="mt-3 space-y-1.5 text-sm text-[var(--ds-color-text-secondary)]">
                        <LegendItem
                          tone="critical"
                          label="Crítico"
                          description="Exige ação imediata e aparece com destaque máximo."
                        />
                        <LegendItem
                          tone="incomplete"
                          label="Incompleta / sem medida"
                          description="Linha com matriz parcial ou controle ainda indefinido."
                        />
                        <LegendItem
                          tone="ready"
                          label="Pronta"
                          description="Identificação, avaliação e medidas já estão coerentes."
                        />
                        <LegendItem
                          tone="priority"
                          label="Alta prioridade"
                          description="Risco substancial ou máximo antes do fechamento."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {currentStep === 3 && (
              <>
                <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-5 shadow-[var(--ds-shadow-sm)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-secondary)]">
                    Revisão operacional
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-[var(--ds-color-text-primary)]">
                    Validação final da APR
                  </h3>
                  <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                    Revise a coerência da matriz de risco, os participantes
                    assinantes e os anexos antes de persistir a análise.
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                        Matriz de risco
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                        {totalRiskLines > 0
                          ? `${materiallyCompleteRiskCount}/${totalRiskLines} linha(s) materialmente completas`
                          : "Nenhuma linha cadastrada"}
                      </p>
                    </div>
                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                        Participantes
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                        {selectedParticipantIds.length} selecionado(s) ·{" "}
                        {completedSignatures} assinatura(s)
                      </p>
                    </div>
                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                        Evidência documental
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                        {currentApr?.pdf_file_key
                          ? "PDF final governado emitido"
                          : isApproved
                            ? "Aguardando emissão final governada"
                            : "Ainda não elegível para emissão final"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                        Contexto SST
                      </p>
                      <div className="mt-3 space-y-1.5 text-sm text-[var(--ds-color-text-secondary)]">
                        <p>
                          <span className="font-semibold text-[var(--ds-color-text-primary)]">
                            Tipo:
                          </span>{" "}
                          {selectedActivityTypeLabel}
                        </p>
                        <p>
                          <span className="font-semibold text-[var(--ds-color-text-primary)]">
                            Frente:
                          </span>{" "}
                          {watch("frente_trabalho") || "-"}
                        </p>
                        <p>
                          <span className="font-semibold text-[var(--ds-color-text-primary)]">
                            Turno:
                          </span>{" "}
                          {watch("turno") || "-"}
                        </p>
                        <p>
                          <span className="font-semibold text-[var(--ds-color-text-primary)]">
                            Local:
                          </span>{" "}
                          {watch("local_execucao_detalhado") || "-"}
                        </p>
                        <p>
                          <span className="font-semibold text-[var(--ds-color-text-primary)]">
                            Resp. técnico:
                          </span>{" "}
                          {watch("responsavel_tecnico_nome") || "-"}
                          {watch("responsavel_tecnico_registro")
                            ? ` · ${watch("responsavel_tecnico_registro")}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                        Fluxo de aprovação
                      </p>
                      <div className="mt-3 space-y-2">
                        {approvalSteps.length > 0 ? (
                          approvalSteps.map((step) => (
                            <div
                              key={step.id}
                              className="flex items-center justify-between gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[var(--ds-color-text-primary)]">
                                  {step.title}
                                </p>
                                <p className="text-xs text-[var(--ds-color-text-secondary)]">
                                  {step.approver_role}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                                  step.status === "approved" &&
                                    "border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]",
                                  step.status === "pending" &&
                                    "border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--color-warning)]",
                                  step.status === "rejected" &&
                                    "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--color-danger)]",
                                  step.status === "skipped" &&
                                    "border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]",
                                )}
                              >
                                {step.status === "approved"
                                  ? "Aprovado"
                                  : step.status === "pending"
                                    ? "Pendente"
                                    : step.status === "rejected"
                                      ? "Reprovado"
                                      : "Ignorado"}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-[var(--ds-color-text-secondary)]">
                            O fluxo de aprovação será exibido após o primeiro carregamento da APR.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                        Autenticidade
                      </p>
                      <div className="mt-3 space-y-1.5 text-sm text-[var(--ds-color-text-secondary)]">
                        <p>
                          <span className="font-semibold text-[var(--ds-color-text-primary)]">
                            Código:
                          </span>{" "}
                          {currentApr?.verification_code || "Gerado na emissão final"}
                        </p>
                        <p>
                          <span className="font-semibold text-[var(--ds-color-text-primary)]">
                            Hash:
                          </span>{" "}
                          {currentApr?.final_pdf_hash_sha256 || "Gerado na emissão final"}
                        </p>
                        <p>
                          <span className="font-semibold text-[var(--ds-color-text-primary)]">
                            PDF emitido em:
                          </span>{" "}
                          {currentApr?.pdf_generated_at
                            ? safeToLocaleString(
                                currentApr.pdf_generated_at,
                                "pt-BR",
                                undefined,
                                "data indisponível",
                              )
                            : "Ainda não emitido"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <AprExecutiveSummary control={control} variant="breakdown" />
                </div>

                <details className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--ds-color-text-primary)]">
                    Auditoria avançada (opcional)
                  </summary>
                  <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                    Utilize este bloco apenas quando o processo exigir registro
                    formal de auditoria interna.
                  </p>
                  <div className="mt-4">
                    <AuditSection
                      register={register}
                      auditors={filteredUsers}
                    />
                  </div>
                </details>
              </>
            )}
          </fieldset>

          <div
            className={cn(
              "sticky bottom-4 z-10 flex flex-col gap-4 rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-strong)] bg-[color:var(--ds-color-surface-overlay)]/95 p-4 shadow-[var(--ds-shadow-lg)] backdrop-blur sm:flex-row sm:items-center sm:justify-between",
            )}
          >
            <div className="flex items-center gap-2">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={prevStep}
                  className={aprGhostActionClass}
                >
                  Voltar
                </button>
              ) : (
                <Link href="/dashboard/aprs" className={aprGhostActionClass}>
                  Cancelar
                </Link>
              )}
              {(isApproved || hasFinalPdf) && (
                <span className="hidden rounded-full border border-[var(--ds-color-border-subtle)] bg-[color:var(--color-card-muted)]/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)] sm:inline-flex sm:items-center sm:gap-1">
                  <Lock className="h-3 w-3" />
                  {hasFinalPdf ? "PDF emitido" : "Aprovada"}
                </span>
              )}
            </div>

            <div
              className={cn(
                "flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0 sm:space-x-4",
                isFieldMode &&
                  "grid grid-cols-2 gap-3 sm:flex-none sm:space-x-0",
              )}
            >
              {currentStep >= 3 ? (
                hasFinalPdf ? (
                  <div
                    className={cn(
                      "flex flex-col gap-3 sm:flex-row sm:items-center",
                      isFieldMode && "col-span-2",
                    )}
                  >
                    {isApproved ? (
                      <button
                        type="button"
                        onClick={handleCloseApr}
                        disabled={closingApr}
                        className={cn(
                          aprPrimarySubmitActionClass,
                          isFieldMode && "min-h-12",
                        )}
                      >
                        {closingApr ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        <span>
                          {closingApr ? "Encerrando APR..." : "Encerrar APR"}
                        </span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleOpenGovernedPdf}
                      disabled={isOffline}
                      className={cn(
                        aprGhostActionClass,
                        "inline-flex items-center justify-center gap-2",
                        isOffline && "cursor-not-allowed opacity-60",
                        isFieldMode && "min-h-12",
                      )}
                    >
                      <FileText className="h-4 w-4" />
                      <span>Abrir PDF final</span>
                    </button>
                  </div>
                ) : isApproved ? (
                  <button
                    type="button"
                    onClick={handleEmitGovernedPdf}
                    disabled={emittingGovernedPdf || isOffline}
                    className={cn(
                      aprPrimarySubmitActionClass,
                      isOffline && "cursor-not-allowed opacity-60",
                      isFieldMode && "min-h-12",
                    )}
                  >
                    {emittingGovernedPdf ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    <span>Emitir PDF final governado</span>
                  </button>
                ) : isReadOnly ? (
                  <div
                    className={cn(
                      "flex flex-col gap-2 sm:items-end",
                      isFieldMode && "col-span-2",
                    )}
                  >
                    {canApproveCurrentApr ? (
                      <button
                        type="button"
                        onClick={handleApproveApr}
                        disabled={finalizing}
                        className={cn(
                          aprPrimarySubmitActionClass,
                          isFieldMode && "min-h-12",
                        )}
                      >
                        {finalizing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        <span>
                          {pendingApprovalStep
                            ? `Aprovar etapa: ${pendingApprovalStep.title}`
                            : "Aprovar APR"}
                        </span>
                      </button>
                    ) : null}
                    {readOnlyReason ? (
                      <p className="text-sm text-[var(--ds-color-text-secondary)] sm:max-w-md sm:text-right">
                        {readOnlyReason}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        submitIntentRef.current = "save_and_print";
                        void handleSubmit(onSubmit)();
                      }}
                      disabled={
                        !canCreate ||
                        loading ||
                        isOffline ||
                        Boolean(draftPendingOfflineSync)
                      }
                      title={saveAndPrintBlockReason || undefined}
                      className={cn(
                        aprGhostActionClass,
                        "inline-flex items-center justify-center gap-2",
                        (isOffline || draftPendingOfflineSync) &&
                          "cursor-not-allowed opacity-60",
                        isFieldMode && "min-h-12",
                      )}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Printer className="h-4 w-4" />
                      )}
                      <span>Salvar e imprimir</span>
                    </button>
                    {saveAndPrintBlockReason ? (
                      <p className="text-sm text-[var(--ds-color-text-secondary)] sm:ml-2">
                        {saveAndPrintBlockReason}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      onClick={() => {
                        submitIntentRef.current = "save";
                        if (complianceResult && complianceResult.blockers.length > 0) {
                          compliancePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                      }}
                      disabled={
                        !canCreate ||
                        loading ||
                        Boolean(draftPendingOfflineSync) ||
                        Boolean(id && complianceResult && complianceResult.blockers.length > 0)
                      }
                      title={
                        id && complianceResult && complianceResult.blockers.length > 0
                          ? "APR possui pendências críticas. Corrija antes de salvar."
                          : saveBlockReason || undefined
                      }
                      className={cn(
                        aprPrimarySubmitActionClass,
                        draftPendingOfflineSync &&
                          "cursor-not-allowed opacity-60",
                        isFieldMode && "min-h-12",
                      )}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      <span>{id ? "Atualizar APR" : "Salvar APR"}</span>
                    </button>
                    {saveBlockReason ? (
                      <p className="text-sm text-[var(--ds-color-text-secondary)] sm:ml-2">
                        {saveBlockReason}
                      </p>
                    ) : null}
                  </>
                )
              ) : (
                <button
                  type="button"
                  onClick={nextStep}
                  className={cn(
                    aprPrimaryActionClass,
                    isFieldMode && "min-h-12",
                  )}
                >
                  <span>Próximo</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      {!id && draftStorageKey && !isReadOnly ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-overlay)]/95 px-4 py-2 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[min(96vw,1880px)] items-center justify-between gap-3 text-sm">
            <div className="font-semibold text-[var(--ds-color-text-primary)]">
              {draftSaving
                ? "Salvando…"
                : draftSaveError
                  ? "Falha ao salvar"
                  : draftLastSavedAt
                    ? `Salvo às ${draftLastSavedAt.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "Salvo"}
            </div>
            {draftSaveError ? (
              <button
                type="button"
                onClick={retryDraftPersist}
                className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--color-danger)] transition-colors hover:bg-[color:var(--ds-color-danger-subtle)]/80"
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {formActionModal ? (
        <AprActionModal
          isOpen
          onClose={() => setFormActionModal(null)}
          onConfirm={confirmFormAction}
          loading={formActionModalLoading}
          title={
            formActionModal === "approve"
              ? pendingApprovalStep
                ? `Aprovar etapa: ${pendingApprovalStep.title}`
                : "Aprovar APR"
              : "Encerrar APR"
          }
          description={
            formActionModal === "approve"
              ? pendingApprovalStep
                ? `Esta ação registra a aprovação da etapa ${pendingApprovalStep.title} no fluxo oficial da APR.`
                : "A APR seguirá para o fluxo oficial de emissão do PDF final."
              : "A APR será concluída e removida da etapa de edição operacional."
          }
          impact={
            formActionModal === "approve"
              ? pendingApprovalStep
                ? "Após aprovar esta etapa, o formulário permanece bloqueado e a APR avança para o próximo nível de aprovação."
                : "Após aprovação, a edição direta fica bloqueada e o próximo passo é emitir o PDF governado."
              : "Após encerrada, a APR não poderá voltar para edição."
          }
          confirmLabel={
            formActionModal === "approve"
              ? pendingApprovalStep
                ? "Aprovar etapa"
                : "Aprovar"
              : "Encerrar APR"
          }
          aprSummary={{
            numero: currentApr?.numero || watch("numero"),
            titulo: currentApr?.titulo || watch("titulo"),
            status: currentApr?.status || watch("status"),
          }}
        />
      ) : null}

      <SignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        onSave={handleSaveSignature}
        userName={currentSigningUser?.nome || ""}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/26 p-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {label}
      </p>
      <p className="text-lg font-bold text-[var(--color-text)]">{value}</p>
    </div>
  );
}

function SummaryMetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-5 text-[var(--ds-color-text-primary)]">
        {value}
      </p>
    </div>
  );
}

function WizardMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "info" | "warning" | "success";
}) {
  const tones = {
    default: {
      container:
        "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/16 text-[var(--ds-color-text-primary)]",
      label: "text-[var(--ds-color-text-secondary)]",
    },
    info: {
      container:
        "border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)]",
      label: "text-[var(--color-info)] opacity-80",
    },
    warning: {
      container:
        "border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--color-warning)]",
      label: "text-[var(--color-warning)] opacity-80",
    },
    success: {
      container:
        "border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]",
      label: "text-[var(--color-success)] opacity-80",
    },
  };

  return (
    <div
      className={`rounded-[var(--ds-radius-md)] border px-2.5 py-2 ${tones[tone].container}`}
    >
      <p
        className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${tones[tone].label}`}
      >
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function AprRiskGridHeader({
  hiddenCompactDetailsCount,
}: {
  hiddenCompactDetailsCount: number;
}) {
  return (
    <div className="sticky top-0 z-10 hidden border-b border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/96 px-3 py-3 backdrop-blur xl:block">
      <div className="grid gap-3 xl:grid-cols-[124px_minmax(0,1fr)]">
        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
            Linha
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
            Identificação e ações rápidas
          </p>
          <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
            Arraste para reordenar
          </p>
          {hiddenCompactDetailsCount > 0 ? (
            <span className="mt-2 inline-flex rounded-full border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning)]">
              {hiddenCompactDetailsCount} linha(s) com detalhes ocultos
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.32fr)_minmax(360px,0.88fr)]">
          <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
              Estrutura do risco
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
              Identificação, exposição e matriz de classificação
            </p>
          </div>

          <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
              Governança
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
              Medidas preventivas, responsável, prazo e status da ação
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AprRiskReferencePanel({
  getActionCriteriaText,
}: {
  getActionCriteriaText: (
    categoria?: string,
    variant?: "short" | "long",
  ) => string | undefined;
}) {
  return (
    <div className="overflow-hidden rounded-[calc(var(--ds-radius-xl)+2px)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]">
      <div className="border-b border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
          Referência operacional
        </p>
        <h3 className="mt-1.5 text-sm font-black text-[var(--ds-color-text-primary)]">
          Matriz P x S e critério de ação
        </h3>
        <p className="mt-1 text-[11px] leading-5 text-[var(--ds-color-text-secondary)]">
          Consulta rápida para conferência, sem competir com a grade.
        </p>
      </div>

      <div className="space-y-3 p-4">
        <details
          open
          className="overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/14"
        >
          <summary className="cursor-pointer list-none px-3.5 py-2.5 text-sm font-semibold text-[var(--ds-color-text-primary)]">
            Matriz de risco P x S
          </summary>
          <div className="border-t border-[var(--ds-color-border-subtle)] p-3">
            <div className="overflow-x-auto rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)]">
              <table className="apr-tech-table w-full min-w-[420px] table-auto text-sm">
                <thead>
                  <tr>
                    <th>Prob. \\ Sev.</th>
                    <th>1</th>
                    <th>2</th>
                    <th>3</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-bold">1</td>
                    <td className="risk-badge-acceptable text-center font-bold">
                      Aceitável
                    </td>
                    <td className="risk-badge-acceptable text-center font-bold">
                      Aceitável
                    </td>
                    <td className="risk-badge-attention text-center font-bold">
                      Atenção
                    </td>
                  </tr>
                  <tr>
                    <td className="font-bold">2</td>
                    <td className="risk-badge-acceptable text-center font-bold">
                      Aceitável
                    </td>
                    <td className="risk-badge-attention text-center font-bold">
                      Atenção
                    </td>
                    <td className="risk-badge-substantial text-center font-bold">
                      Substancial
                    </td>
                  </tr>
                  <tr>
                    <td className="font-bold">3</td>
                    <td className="risk-badge-attention text-center font-bold">
                      Atenção
                    </td>
                    <td className="risk-badge-substantial text-center font-bold">
                      Substancial
                    </td>
                    <td className="risk-badge-critical text-center font-bold">
                      Crítico
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </details>

        <details className="overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/14">
          <summary className="cursor-pointer list-none px-3.5 py-2.5 text-sm font-semibold text-[var(--ds-color-text-primary)]">
            Critério de ação por categoria
          </summary>
          <div className="space-y-2 border-t border-[var(--ds-color-border-subtle)] p-3 text-sm">
            <ActionCriteriaCard
              categoria="Aceitável"
              prioridade="Não prioritário"
              criterio={getActionCriteriaText("Aceitável", "long") || "-"}
            />
            <ActionCriteriaCard
              categoria="Atenção"
              prioridade="Prioridade básica"
              criterio={getActionCriteriaText("Atenção", "long") || "-"}
            />
            <ActionCriteriaCard
              categoria="Substancial"
              prioridade="Prioridade preferencial"
              criterio={getActionCriteriaText("Substancial", "long") || "-"}
            />
            <ActionCriteriaCard
              categoria="Crítico"
              prioridade="Prioridade máxima"
              criterio={getActionCriteriaText("Crítico", "long") || "-"}
            />
          </div>
        </details>
      </div>
    </div>
  );
}

function ActionCriteriaCard({
  categoria,
  prioridade,
  criterio,
}: {
  categoria: string;
  prioridade: string;
  criterio: string;
}) {
  return (
    <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
            categoria === "Aceitável"
              ? "risk-badge-acceptable"
              : categoria === "Atenção"
                ? "risk-badge-attention"
                : categoria === "Substancial"
                  ? "risk-badge-substantial"
                  : "risk-badge-critical",
          )}
        >
          {categoria}
        </span>
        <span className="text-[11px] font-semibold text-[var(--ds-color-text-secondary)]">
          {prioridade}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
        {criterio}
      </p>
    </div>
  );
}

function LegendItem({
  tone,
  label,
  description,
}: {
  tone: "critical" | "incomplete" | "ready" | "priority";
  label: string;
  description: string;
}) {
  const toneClasses = {
    critical: {
      container:
        "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--color-danger)]",
      dot: "border-[var(--ds-color-danger-border)] bg-[var(--risk-critical)]",
    },
    incomplete: {
      container:
        "border-[var(--apr-incomplete-border)] bg-[var(--apr-incomplete-subtle)] text-[var(--apr-incomplete-fg)]",
      dot: "border-[var(--apr-incomplete-border)] bg-[var(--apr-incomplete)]",
    },
    ready: {
      container:
        "border-[var(--apr-ready-border)] bg-[var(--apr-ready-subtle)] text-[var(--apr-ready-fg)]",
      dot: "border-[var(--apr-ready-border)] bg-[var(--apr-ready)]",
    },
    priority: {
      container:
        "border-[var(--apr-priority-border)] bg-[var(--apr-priority-subtle)] text-[var(--apr-priority-fg)]",
      dot: "border-[var(--apr-priority-border)] bg-[var(--apr-priority)]",
    },
  };

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--ds-radius-md)] border px-3 py-2.5",
        toneClasses[tone].container,
      )}
    >
      <span
        className={cn("mt-1 h-2.5 w-2.5 rounded-full border", toneClasses[tone].dot)}
      />
      <div>
        <p className="text-xs font-semibold text-[var(--ds-color-text-primary)]">
          {label}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
          {description}
        </p>
      </div>
    </div>
  );
}

interface SectionItem {
  id: string;
  nome?: string;
  razao_social?: string;
  titulo?: string;
}

interface SectionGridProps {
  title: string;
  items: SectionItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  error?: string;
  signatures?: Record<string, { data: string; type: string }>;
  helperText?: string;
}

function SectionGrid({
  title,
  items,
  selectedIds,
  onToggle,
  error,
  signatures,
  helperText,
}: SectionGridProps) {
  const selectedCount = selectedIds.length;
  const signedCount = selectedIds.filter((id) =>
    Boolean(signatures?.[id]),
  ).length;

  return (
    <div className="overflow-hidden rounded-[calc(var(--ds-radius-xl)+2px)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-sm)]">
      <div className="flex flex-col gap-3 border-b border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/12 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
            Governança de participação
          </p>
          <h2 className="mt-1 text-base font-semibold text-[var(--ds-color-text-primary)]">
            {title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
            {helperText ||
              "Selecione quem participa da APR e acompanhe quem já concluiu a assinatura."}
          </p>
          <p className="mt-2 text-xs text-[var(--ds-color-text-muted)]">
            Ao selecionar um participante novo, o fluxo abre a captura de
            assinatura imediatamente quando a APR estiver online.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-1 font-semibold text-[var(--ds-color-text-secondary)]">
            {selectedCount} no fluxo
          </span>
          <span className="rounded-full border border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] px-3 py-1 font-semibold text-[var(--color-success)]">
            {signedCount} assinados
          </span>
        </div>
      </div>
      {error && (
        <div className="border-b border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-4 py-2.5 text-xs text-[var(--color-danger)]">
          <p className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" /> {error}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          const hasSignature = Boolean(signatures?.[item.id]);
          const displayName = item.nome || item.razao_social || item.titulo;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              aria-label={
                hasSignature
                  ? `${displayName}: participante assinado. Clique para remover do fluxo.`
                  : isSelected
                    ? `${displayName}: participante selecionado. Clique para remover do fluxo.`
                    : `${displayName}: selecionar participante e abrir captura de assinatura.`
              }
              className={cn(
                "flex min-h-[76px] items-start gap-3 rounded-[var(--ds-radius-lg)] border px-3.5 py-3 text-left transition-colors",
                isSelected
                  ? "border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)]"
                  : "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] hover:bg-[var(--ds-color-surface-muted)]/16",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-colors",
                  isSelected
                    ? "border-[var(--color-info)] bg-[var(--color-info)] text-[var(--color-text-inverse)]"
                    : "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)]",
                )}
              >
                {isSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : "+"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      {displayName}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                      {hasSignature
                        ? "Assinatura capturada e participante mantido no fluxo."
                        : isSelected
                          ? "Selecionado no fluxo. Clique para remover se necessário."
                          : "Clique para selecionar e abrir a captura de assinatura."}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                        hasSignature
                          ? "border border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]"
                          : isSelected
                            ? "border border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)]"
                            : "border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]",
                      )}
                    >
                      {hasSignature
                        ? "Assinado"
                        : isSelected
                          ? "Selecionado"
                          : "Disponível"}
                    </span>
                    <span className="text-[10px] font-medium text-[var(--ds-color-text-muted)]">
                      {hasSignature
                        ? "Remover"
                        : isSelected
                          ? "Retirar"
                          : "Assinar"}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {items.length === 0 && (
          <div className="col-span-full rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 py-6 text-center text-sm italic text-[var(--color-text-secondary)]">
            Nenhum item disponível para a empresa selecionada.
          </div>
        )}
      </div>
    </div>
  );
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function isUuidLike(value?: string | null) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}
