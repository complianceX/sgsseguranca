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
import { useApiStatus } from "@/hooks/useApiStatus";
import {
  type AprDraftMetadata,
  type AprOfflineSyncStatus,
  type AprDraftPendingOfflineSync,
  createAprDraftMetadata,
  clearAprDraft,
  readAprDraft,
  sanitizeAprDraftValues,
  writeAprDraft,
} from "./aprDraftStorage";
import { trackAprOfflineTelemetry } from "./aprOfflineTelemetry";
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

const AprRiskRow = dynamic(
  () => import("./AprRiskRow").then((module) => module.AprRiskRow),
);

const AprExecutiveSummary = dynamic(
  () =>
    import("./AprExecutiveSummary").then(
      (module) => module.AprExecutiveSummary,
    ),
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
const aprHeadingClass =
  "text-2xl font-bold text-[var(--ds-color-text-primary)]";
const aprSubheadingClass = "text-sm text-[var(--ds-color-text-secondary)]";
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
    agente_ambiental: "",
    condicao_perigosa: "",
    fontes_circunstancias: "",
    possiveis_lesoes: "",
    probabilidade: "",
    severidade: "",
    categoria_risco: "",
    medidas_prevencao: "",
    responsavel: "",
    prazo: "",
    status_acao: "",
  };
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
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftPendingOfflineSync, setDraftPendingOfflineSync] =
    useState<AprDraftPendingOfflineSync | null>(null);
  const [draftSecurityNotice, setDraftSecurityNotice] = useState<{
    corrupted: boolean;
    sensitiveDataRemoved: boolean;
  }>({
    corrupted: false,
    sensitiveDataRemoved: false,
  });
  const [sophieSuggestedRisks, setSophieSuggestedRisks] = useState<
    SophieDraftRiskSuggestion[]
  >([]);
  const [sophieMandatoryChecklists, setSophieMandatoryChecklists] = useState<
    SophieDraftChecklistSuggestion[]
  >([]);
  const submitIntentRef = useRef<"save" | "save_and_print">("save");
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    getValues,
    trigger,
    formState: { errors, isDirty },
  } = useForm<AprFormData>({
    resolver: zodResolver(aprSchema),
    defaultValues: {
      pdf_signed: false,
      numero: "",
      titulo: prefillTitle,
      descricao: prefillDescription,
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

  const selectedCompanyId = watch("company_id");
  const selectedSiteId = watch("site_id");
  const selectedElaboradorId = watch("elaborador_id");
  const tituloApr = watch("titulo");
  const dataInicioApr = watch("data_inicio");
  const filteredSites = sites.filter(
    (site) => site.company_id === selectedCompanyId,
  );
  const filteredUsers = users.filter(
    (user) => user.company_id === selectedCompanyId,
  );
  const draftStorageKey = useMemo(
    () => (id ? null : `gst.apr.wizard.draft.${user?.company_id || "default"}`),
    [id, user?.company_id],
  );
  const legacyDraftStorageKey = useMemo(
    () =>
      id
        ? null
        : `compliancex.apr.wizard.draft.${user?.company_id || "default"}`,
    [id, user?.company_id],
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
  const draftMetadata = useMemo<AprDraftMetadata | undefined>(() => {
    if (!draftId) {
      return undefined;
    }

    return createAprDraftMetadata({
      draftId,
      suggestedRisks: sophieSuggestedRisks,
      mandatoryChecklists: sophieMandatoryChecklists,
      pendingOfflineSync: draftPendingOfflineSync,
    });
  }, [
    draftId,
    draftPendingOfflineSync,
    sophieMandatoryChecklists,
    sophieSuggestedRisks,
  ]);
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
  const watchedStatus = useWatch({
    control,
    name: "status",
    defaultValue: "Pendente",
  });
  const isModelo = watch("is_modelo");
  const isApproved = currentApr?.status === "Aprovada";
  const hasFinalPdf = Boolean(currentApr?.pdf_file_key);
  const isReadOnly = watchedStatus === "Aprovada" || hasFinalPdf;
  const readOnlyReason = useMemo(() => {
    if (!isReadOnly) return null;
    return hasFinalPdf
      ? "APR bloqueada para edição porque já possui PDF final emitido."
      : "APR bloqueada para edição porque já foi aprovada.";
  }, [hasFinalPdf, isReadOnly]);
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

      const [fullApr, aprSignatures, evidences] = await Promise.all([
        aprsService.findOne(apr.id),
        signaturesService.findByDocument(apr.id, "APR"),
        aprsService.listAprEvidences(apr.id),
      ]);
      const [{ generateAprPdf }, { base64ToPdfFile }] = await Promise.all([
        loadAprPdfGenerator(),
        loadPdfFileUtils(),
      ]);
      const generatedPdf = (await generateAprPdf(fullApr, aprSignatures, {
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
        generatedPdf.filename ||
          `APR_${String(fullApr.numero || fullApr.titulo || fullApr.id).replace(/\s+/g, "_")}.pdf`,
      );
      await aprsService.attachFile(apr.id, pdfFile);
      toast.success("PDF final da APR emitido e registrado com sucesso.");
      return aprsService.getPdfAccess(apr.id);
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
  const totalRiskLines = riskFields.length;
  const completedSignatures = Object.keys(signatures).length;
  const [compactMode, setCompactMode] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const draftPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");
  const clearDraftState = useCallback(() => {
    clearAprDraft(draftStorageKey, legacyDraftStorageKey);
    lastSavedRef.current = "";
    setDraftId(null);
    setDraftPendingOfflineSync(null);
    setDraftRestored(false);
  }, [draftStorageKey, legacyDraftStorageKey]);
  const persistDraftSnapshot = useCallback(
    (overrideMetadata?: AprDraftMetadata) => {
      if (fetching || isReadOnly || id || !draftStorageKey) {
        return;
      }
      const metadataToPersist = overrideMetadata ?? draftMetadata;
      if (!metadataToPersist) {
        return;
      }

      const nextDraft = {
        version: 3 as const,
        step: currentStep,
        values: sanitizeAprDraftValues(getValuesRef.current()),
        metadata: metadataToPersist,
      };
      const serialized = JSON.stringify(nextDraft);

      if (serialized === lastSavedRef.current) {
        return;
      }

      lastSavedRef.current = serialized;

      try {
        writeAprDraft(draftStorageKey, nextDraft);
      } catch {
        // storage unavailable — keep the draft only in memory
      }
    },
    [currentStep, draftMetadata, draftStorageKey, fetching, id, isReadOnly],
  );
  const scheduleDraftPersist = useCallback(
    (overrideMetadata?: AprDraftMetadata) => {
      if (draftPersistTimerRef.current) {
        clearTimeout(draftPersistTimerRef.current);
      }

      draftPersistTimerRef.current = setTimeout(() => {
        persistDraftSnapshot(overrideMetadata);
      }, 300);
    },
    [persistDraftSnapshot],
  );
  const buildCurrentDraftMetadata = useCallback(
    (pendingOfflineSync?: AprDraftPendingOfflineSync | null) => {
      if (!draftId) {
        return undefined;
      }

      return createAprDraftMetadata({
        draftId,
        suggestedRisks: sophieSuggestedRisks,
        mandatoryChecklists: sophieMandatoryChecklists,
        pendingOfflineSync: pendingOfflineSync ?? null,
      });
    },
    [draftId, sophieMandatoryChecklists, sophieSuggestedRisks],
  );
  const persistPendingOfflineSync = useCallback(
    (pendingOfflineSync: AprDraftPendingOfflineSync | null) => {
      setDraftPendingOfflineSync(pendingOfflineSync);
      const metadata = buildCurrentDraftMetadata(pendingOfflineSync);
      if (metadata) {
        persistDraftSnapshot(metadata);
      }
    },
    [buildCurrentDraftMetadata, persistDraftSnapshot],
  );
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

  useEffect(() => {
    return () => {
      if (draftPersistTimerRef.current) {
        clearTimeout(draftPersistTimerRef.current);
      }
    };
  }, []);

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
    (index: number) => {
      if (isReadOnly) {
        notifyReadOnly("Não é possível remover linhas em uma APR bloqueada.");
        return;
      }
      removeRisk(index);
    },
    [isReadOnly, notifyReadOnly, removeRisk],
  );

  const toggleExpandedRow = useCallback((index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
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
          ? applied.riskItems
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

  const { handleSubmit: onSubmit, loading } = useFormSubmit(
    async (data: AprFormData) => {
      if (id && isReadOnly) {
        throw new Error(
          hasFinalPdf
            ? "APR com PDF final emitido está bloqueada. Crie uma nova versão."
            : "APR aprovada está bloqueada para edição. Crie uma nova versão.",
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
          "Salvar e imprimir exige conexão ativa. Use apenas \"Salvar\" para enfileirar a APR base e finalize a impressão quando estiver online.",
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
    if (isReadOnly) {
      notifyReadOnly("Aprovação não está disponível em uma APR bloqueada.");
      return;
    }
    if (!confirm("Deseja aprovar esta APR?")) return;

    try {
      setFinalizing(true);
      await aprsService.approve(id);
      await reloadAprWorkflowContext(id);
      toast.success("APR aprovada com sucesso.");
    } catch (error) {
      console.error("Erro ao aprovar APR:", error);
      toast.error("Não foi possível aprovar a APR.");
    } finally {
      setFinalizing(false);
    }
  }, [id, isReadOnly, notifyReadOnly, reloadAprWorkflowContext]);

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
    if (!confirm("Deseja encerrar esta APR?")) return;

    try {
      setClosingApr(true);
      await aprsService.finalize(id);
      await reloadAprWorkflowContext(id);
      toast.success("APR encerrada com sucesso.");
    } catch (error) {
      console.error("Erro ao encerrar APR:", error);
      toast.error("Não foi possível encerrar a APR.");
    } finally {
      setClosingApr(false);
    }
  }, [currentApr, id, reloadAprWorkflowContext]);

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
  }, [currentApr, handleEmitGovernedPdf, id, isOffline, registerOfflineBlocked]);

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
              apr.itens_risco && apr.itens_risco.length > 0
                ? apr.itens_risco
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
                ? parsedDraft.values.itens_risco
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
                defaultApr.itens_risco && defaultApr.itens_risco.length > 0
                  ? defaultApr.itens_risco
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
  }, [draftSecurityNotice]);

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
          queuedItem.state === "retry_waiting" ? queuedItem.lastError : undefined;

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
  }, [
    draftPendingOfflineSync,
    persistPendingOfflineSync,
  ]);

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
  }, [selectedCompanyId]);

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
      if (draftPersistTimerRef.current) {
        clearTimeout(draftPersistTimerRef.current);
      }
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

    const result = await retryOfflineQueueItem(draftPendingOfflineSync.queueItemId);
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

  const nextStep = useCallback(async () => {
    let fields: (keyof AprFormData)[] = [];

    if (currentStep === 1) {
      fields = [
        "numero",
        "titulo",
        "company_id",
        "site_id",
        "elaborador_id",
        "data_inicio",
        "data_fim",
      ];
    } else if (currentStep === 2) {
      fields = ["participants"];
    }

    const isValid = await trigger(fields);
    if (!isValid) return;

    setCurrentStep((prev) => prev + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep, trigger]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => prev - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (fetching) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "ds-form-page mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500",
        currentStep === 2
          ? "w-full max-w-[min(96vw,1880px)]"
          : "max-w-4xl",
        isFieldMode && currentStep !== 2 && "max-w-5xl pb-28",
        isFieldMode && currentStep === 2 && "pb-28",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/aprs"
            className={aprBackButtonClass}
            title="Voltar para APRs"
          >
            <ArrowLeft className="h-5 w-5 group-hover:-translate-x-0.5 transition-transform" />
          </Link>
          <div>
            {isFieldMode ? (
              <span className="inline-flex items-center rounded-full border border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-success)]">
                modo campo
              </span>
            ) : null}
            <h1 className={aprHeadingClass}>
              {id
                ? "Editar APR"
                : isFieldMode
                  ? "Nova APR em campo"
                  : "Nova APR"}
            </h1>
            <p className={aprSubheadingClass}>
              {isFieldMode
                ? "Fluxo adaptado para obra e celular, com retomada automática do rascunho e ações maiores para uso em campo."
                : `Preencha os campos abaixo para ${id ? "atualizar" : "criar"} a Análise Preliminar de Risco.`}
            </p>
          </div>
        </div>
      </div>

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
              <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/20 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                  Rascunho
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  Automático
                </p>
              </div>
              <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/20 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                  Uso
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
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
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {!isReadOnly && !isApproved && (
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
                type="text"
                value={evidenceLatitude}
                onChange={(e) => setEvidenceLatitude(e.target.value)}
                placeholder="Latitude"
                aria-label="Latitude da evidência"
                disabled={isReadOnly}
                className={aprFieldClass}
              />
              <input
                type="text"
                value={evidenceLongitude}
                onChange={(e) => setEvidenceLongitude(e.target.value)}
                placeholder="Longitude"
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
                      {safeToLocaleString(item.uploaded_at, "pt-BR", undefined, "data indisponível")}
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
            <div className="grid gap-3 px-5 py-4 lg:grid-cols-3">
              {APR_STEPS.map((step) => {
                const Icon = step.icon;
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id;

                return (
                  <button
                    key={step.id}
                    type="button"
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
                <div className={`mt-3 ${aprWarningInlineClass}`}>
                  Defina participantes e assinaturas antes de concluir a APR.
                </div>
              )}
            </div>

            {draftPendingOfflineSync && pendingOfflineSyncUi ? (
              <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-4 py-4 text-sm text-[var(--color-warning)]">
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
                      <p>{pendingOfflineSyncUi.nextStep}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-warning-border)]/60 bg-white/30 p-3 text-xs text-[var(--color-warning)]/90 md:grid-cols-2">
                    <p>
                      Base da APR: {draftPendingOfflineSync.status === "synced_base" ? "sincronizada no servidor" : "salva localmente neste navegador"}
                    </p>
                    <p>Assinaturas finais: pendentes e obrigatoriamente online</p>
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
                        className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-warning-border)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition-colors hover:bg-white/40"
                      >
                        Tentar sincronizar agora
                      </button>
                    ) : null}
                    {canReleasePendingOfflineState ? (
                      <button
                        type="button"
                        onClick={handleReleasePendingOfflineState}
                        className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-warning-border)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition-colors hover:bg-white/40"
                      >
                        Liberar rascunho
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleDiscardPendingOfflineSync()}
                      className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-danger-border)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-danger)] transition-colors hover:bg-white/40"
                    >
                      Descartar envio local
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {signatureChanges.hasPendingChanges ? (
              <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-4 py-3 text-sm text-[var(--color-danger)]">
                <p className="font-semibold">
                  Assinaturas capturadas ficam somente na memória desta sessão.
                </p>
                <p className="mt-1">
                  Elas não são gravadas em `localStorage` nem entram na fila
                  offline. Reconecte-se para concluir o envio das assinaturas
                  antes de sair da tela.
                </p>
              </div>
            ) : null}

            <div className={aprDangerInlineClass}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Não finalize a APR sem revisar a matriz de risco, controles
                  sugeridos e evidências associadas ao trabalho.
                </p>
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
                    <label className={aprLabelClass}>Número da APR</label>
                    <input
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
                    <label className={aprLabelClass}>Título da APR</label>
                    <input
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
                    <label className={aprLabelClass}>Descrição/Escopo</label>
                    <textarea
                      {...register("descricao")}
                      rows={3}
                      className={aprFieldClass}
                      placeholder="Descreva o escopo do trabalho..."
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-primary-border)] bg-[color:var(--ds-color-primary-subtle)]/45 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
                        Emissão documental
                      </p>
                      <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                        O PDF final da APR não é mais anexado manualmente neste
                        formulário. Depois da aprovação, emita, abra ou
                        compartilhe o documento governado pelo fluxo oficial da
                        própria APR.
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
                    <label className={aprLabelClass}>Empresa</label>
                    <select
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
                    <label className={aprLabelClass}>Site/Obra</label>
                    <select
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
                    <label className={aprLabelClass}>Elaborador</label>
                    <select
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
                    <label className={aprLabelClass}>Status</label>
                    <select
                      {...register("status")}
                      disabled
                      className={cn(aprFieldClass, aprFieldDisabledClass)}
                    >
                      <option value="Pendente">Pendente</option>
                      <option value="Aprovada">Aprovada</option>
                      <option value="Cancelada">Cancelada</option>
                      <option value="Encerrada">Encerrada</option>
                    </select>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      O status da APR é controlado pelos fluxos formais de
                      aprovação, reprovação e encerramento.
                    </p>
                  </div>

                  <div>
                    <label className={aprLabelClass}>Data Início</label>
                    <input
                      type="date"
                      {...register("data_inicio")}
                      className={aprFieldClass}
                    />
                  </div>

                  <div>
                    <label className={aprLabelClass}>Data Fim</label>
                    <input
                      type="date"
                      {...register("data_fim")}
                      className={aprFieldClass}
                    />
                  </div>

                  <div className="flex flex-col space-y-3 md:flex-row md:space-x-6 md:space-y-0 md:col-span-2 pt-2">
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        {...register("is_modelo")}
                        className={aprCheckboxClass}
                      />
                      <span className="text-sm font-semibold text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-text)]">
                        Salvar como Modelo
                      </span>
                    </label>

                    {isModelo && (
                      <label className="flex items-center space-x-3 cursor-pointer group animate-in slide-in-from-left-2 duration-300">
                        <input
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
                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-4 py-3 text-sm text-[var(--color-warning)]">
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
                            title={compactMode ? "Expandir todas as linhas" : "Modo compacto"}
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
                                  onClick={() => appendRisk(createEmptyRiskRow())}
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
                                Use importação quando a APR já existir em planilha. Use
                                adição manual quando a análise estiver sendo construída
                                direto no sistema.
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <AprRiskGridHeader />
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
                          tone="danger"
                          label="Crítico"
                          description="Exige ação imediata e aparece com destaque máximo."
                        />
                        <LegendItem
                          tone="warning"
                          label="Incompleta / sem medida"
                          description="Linha com matriz parcial ou controle ainda indefinido."
                        />
                        <LegendItem
                          tone="success"
                          label="Pronta"
                          description="Identificação, avaliação e medidas já estão coerentes."
                        />
                        <LegendItem
                          tone="info"
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
                          ? `${totalRiskLines} linha(s) preenchidas`
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
              "sticky bottom-4 z-10 flex flex-col gap-4 rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-strong)] bg-[var(--color-card)]/95 p-4 shadow-[var(--ds-shadow-lg)] backdrop-blur sm:flex-row sm:items-center sm:justify-between",
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
              {isDirty && (
                <span className="hidden rounded-full border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-warning)] sm:inline-flex sm:items-center sm:gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Não salvo
                </span>
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
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        submitIntentRef.current = "save_and_print";
                        void handleSubmit(onSubmit)();
                      }}
                      disabled={!canCreate || loading || isOffline || Boolean(draftPendingOfflineSync)}
                      title={
                        isOffline
                          ? "Salvar e imprimir exige conexão ativa."
                          : draftPendingOfflineSync
                            ? "Existe uma sincronização pendente para este rascunho."
                          : undefined
                      }
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
                    <button
                      type="submit"
                      onClick={() => {
                        submitIntentRef.current = "save";
                      }}
                      disabled={!canCreate || loading || Boolean(draftPendingOfflineSync)}
                      title={
                        draftPendingOfflineSync
                          ? "Existe uma sincronização pendente para este rascunho."
                          : undefined
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
    default:
      "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/16 text-[var(--color-text-secondary)]",
    info: "border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)]",
    warning:
      "border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--color-warning)]",
    success:
      "border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]",
  };

  return (
    <div className={`rounded-[var(--ds-radius-md)] border px-2.5 py-2 ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-80">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function AprRiskGridHeader() {
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
  tone: "danger" | "warning" | "success" | "info";
  label: string;
  description: string;
}) {
  const toneClasses = {
    danger:
      "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--color-danger)]",
    warning:
      "border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--color-warning)]",
    success:
      "border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]",
    info: "border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)]",
  };

  return (
    <div className="flex items-start gap-2.5 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/14 px-3 py-2.5">
      <span
        className={cn(
          "mt-1 h-2 w-2 rounded-full border",
          toneClasses[tone],
        )}
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
  const signedCount = selectedIds.filter((id) => Boolean(signatures?.[id])).length;

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
                      {isSelected
                        ? "Participante incluído no fluxo de assinatura."
                        : "Disponível para participação nesta APR."}
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

