import type {
  SophieDraftChecklistSuggestion,
  SophieDraftRiskSuggestion,
} from "@/lib/sophie-draft-storage";
import type { AprFormData } from "./aprForm.schema";

export type AprDraftSubmitIntent = "save" | "save_and_print";

export type AprOfflineSyncStatus =
  | "queued"
  | "syncing"
  | "failed"
  | "synced_base"
  | "orphaned";

export type AprDraftPendingOfflineSync = {
  draftId: string;
  queuedAt: string;
  lastUpdatedAt: string;
  queueItemId?: string;
  dedupeKey?: string;
  aprId?: string;
  intent: AprDraftSubmitIntent;
  status: AprOfflineSyncStatus;
  lastError?: string;
};

export type AprDraftMetadata = {
  draftId: string;
  suggestedRisks?: SophieDraftRiskSuggestion[];
  mandatoryChecklists?: SophieDraftChecklistSuggestion[];
  pendingOfflineSync?: AprDraftPendingOfflineSync | null;
};

export type AprDraftRecord = {
  version: 3;
  step: number;
  values: Partial<AprFormData>;
  metadata: AprDraftMetadata;
};

type LegacyAprDraftRecord = {
  version?: number;
  step?: number;
  values?: Partial<AprFormData>;
  signatures?: Record<string, { data: string; type: string }>;
  metadata?: Partial<AprDraftMetadata> & {
    draftId?: string;
  };
};

export type ReadAprDraftResult = {
  draft: AprDraftRecord | null;
  corrupted: boolean;
  migratedFromLegacy: boolean;
  removedSensitiveState: boolean;
};

const APR_DRAFT_VERSION = 3;

const DRAFT_VALUE_FIELDS: Array<keyof AprFormData> = [
  "numero",
  "titulo",
  "descricao",
  "data_inicio",
  "data_fim",
  "status",
  "is_modelo",
  "is_modelo_padrao",
  "company_id",
  "site_id",
  "elaborador_id",
  "activities",
  "risks",
  "epis",
  "tools",
  "machines",
  "participants",
  "itens_risco",
  "auditado_por_id",
  "data_auditoria",
  "resultado_auditoria",
  "notas_auditoria",
];

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeStep(step: unknown): number {
  return typeof step === "number" && step >= 1 && step <= 3 ? step : 1;
}

function generateUuidLike() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `apr-draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDraftId(value?: string | null) {
  return value && value.trim() ? value : generateUuidLike();
}

function sanitizePendingOfflineSync(
  pending: AprDraftPendingOfflineSync | Partial<AprDraftPendingOfflineSync> | null | undefined,
  draftId: string,
): AprDraftPendingOfflineSync | null {
  if (!pending) {
    return null;
  }

  const queuedAt = pending.queuedAt || new Date().toISOString();
  const lastUpdatedAt = pending.lastUpdatedAt || queuedAt;
  const status = pending.status;

  return {
    draftId,
    queuedAt,
    lastUpdatedAt,
    queueItemId: pending.queueItemId,
    dedupeKey: pending.dedupeKey,
    aprId: pending.aprId,
    intent: pending.intent === "save_and_print" ? "save_and_print" : "save",
    status:
      status === "syncing" ||
      status === "failed" ||
      status === "synced_base" ||
      status === "orphaned"
        ? status
        : "queued",
    lastError: pending.lastError,
  };
}

function sanitizeMetadata(
  metadata?: Partial<AprDraftMetadata> | null,
): AprDraftMetadata {
  const draftId = normalizeDraftId(metadata?.draftId);
  const next: AprDraftMetadata = {
    draftId,
  };

  if (Array.isArray(metadata?.suggestedRisks)) {
    next.suggestedRisks = metadata.suggestedRisks.map((risk) => ({
      id: risk.id,
      label: risk.label,
      category: risk.category,
    }));
  }

  if (Array.isArray(metadata?.mandatoryChecklists)) {
    next.mandatoryChecklists = metadata.mandatoryChecklists.map((checklist) => ({
      id: checklist.id,
      label: checklist.label,
      reason: checklist.reason,
      source: checklist.source,
    }));
  }

  const pendingOfflineSync = sanitizePendingOfflineSync(
    metadata?.pendingOfflineSync,
    draftId,
  );
  if (pendingOfflineSync) {
    next.pendingOfflineSync = pendingOfflineSync;
  }

  return next;
}

export function createAprDraftMetadata(
  metadata?: Partial<AprDraftMetadata> | null,
): AprDraftMetadata {
  return sanitizeMetadata(metadata);
}

export function sanitizeAprDraftValues(
  values?: Partial<AprFormData> | null,
): Partial<AprFormData> {
  if (!values) {
    return {};
  }

  const sanitized: Partial<AprFormData> = {};

  DRAFT_VALUE_FIELDS.forEach((field) => {
    const value = values[field];
    if (value === undefined) {
      return;
    }

    (sanitized as Record<string, unknown>)[field] =
      value && typeof value === "object" ? cloneJsonValue(value) : value;
  });

  return sanitized;
}

function normalizeDraftRecord(raw: LegacyAprDraftRecord): AprDraftRecord {
  return {
    version: APR_DRAFT_VERSION,
    step: normalizeStep(raw.step),
    values: sanitizeAprDraftValues(raw.values),
    metadata: sanitizeMetadata(raw.metadata),
  };
}

export function writeAprDraft(key: string, draft: AprDraftRecord) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedDraft: AprDraftRecord = {
    version: APR_DRAFT_VERSION,
    step: normalizeStep(draft.step),
    values: sanitizeAprDraftValues(draft.values),
    metadata: sanitizeMetadata(draft.metadata),
  };

  window.localStorage.setItem(key, JSON.stringify(normalizedDraft));
}

export function clearAprDraft(
  primaryKey?: string | null,
  legacyKey?: string | null,
) {
  if (typeof window === "undefined") {
    return;
  }

  if (primaryKey) {
    window.localStorage.removeItem(primaryKey);
  }

  if (legacyKey) {
    window.localStorage.removeItem(legacyKey);
  }
}

export function readAprDraft(
  primaryKey: string,
  legacyKey?: string | null,
): ReadAprDraftResult {
  if (typeof window === "undefined") {
    return {
      draft: null,
      corrupted: false,
      migratedFromLegacy: false,
      removedSensitiveState: false,
    };
  }

  const primaryRaw = window.localStorage.getItem(primaryKey);
  const legacyRaw =
    !primaryRaw && legacyKey ? window.localStorage.getItem(legacyKey) : null;
  const raw = primaryRaw || legacyRaw;

  if (!raw) {
    return {
      draft: null,
      corrupted: false,
      migratedFromLegacy: false,
      removedSensitiveState: false,
    };
  }

  try {
    const parsed = JSON.parse(raw) as LegacyAprDraftRecord;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid draft format");
    }

    const draft = normalizeDraftRecord(parsed);
    const removedSensitiveState = Boolean(
      parsed.signatures && Object.keys(parsed.signatures).length > 0,
    );
    const migratedFromLegacy =
      Boolean(legacyRaw) ||
      parsed.version !== APR_DRAFT_VERSION ||
      !parsed.metadata?.draftId;
    const shouldRewrite = migratedFromLegacy || removedSensitiveState;

    if (shouldRewrite) {
      writeAprDraft(primaryKey, draft);
    }

    if (legacyRaw && legacyKey) {
      window.localStorage.removeItem(legacyKey);
    }

    return {
      draft,
      corrupted: false,
      migratedFromLegacy,
      removedSensitiveState,
    };
  } catch {
    clearAprDraft(primaryKey, legacyKey);
    return {
      draft: null,
      corrupted: true,
      migratedFromLegacy: false,
      removedSensitiveState: false,
    };
  }
}
