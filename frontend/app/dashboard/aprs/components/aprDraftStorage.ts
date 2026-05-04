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
  tenantId?: string;
  createdAt: string;
  expiresAt: string;
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
  expired: boolean;
};

const APR_DRAFT_VERSION = 3;
const APR_DRAFT_TTL_MS = 6 * 60 * 60 * 1000;
const APR_DRAFT_KEY_PREFIXES = [
  "gst.apr.wizard.draft.",
  "compliancex.apr.wizard.draft.",
] as const;
const SENSITIVE_DRAFT_KEY_PATTERN =
  /(signature|assinatura|token|password|senha|pdf|url|file|private|presigned)/i;

const DRAFT_VALUE_FIELDS: Array<keyof AprFormData> = [
  "numero",
  "titulo",
  "descricao",
  "data_inicio",
  "data_fim",
  "status",
  "is_modelo",
  "is_modelo_padrao",
  "site_id",
  "elaborador_id",
  "activities",
  "risks",
  "epis",
  "tools",
  "machines",
  "itens_risco",
];

function sanitizeJsonForDraft(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonForDraft(item));
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (SENSITIVE_DRAFT_KEY_PATTERN.test(key)) {
        return;
      }
      sanitized[key] = sanitizeJsonForDraft(item);
    });
    return sanitized;
  }

  return value;
}

function normalizeStep(step: unknown): number {
  return typeof step === "number" && step >= 1 && step <= 3 ? step : 1;
}

function generateUuidLike() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `apr-draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDraftId(value?: string | null) {
  return value && value.trim() ? value : generateUuidLike();
}

function sanitizePendingOfflineSync(
  pending:
    | AprDraftPendingOfflineSync
    | Partial<AprDraftPendingOfflineSync>
    | null
    | undefined,
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
  const createdAt = metadata?.createdAt || new Date().toISOString();
  const createdAtMs = new Date(createdAt).getTime();
  const expiresAt =
    metadata?.expiresAt ||
    new Date(
      (Number.isFinite(createdAtMs) ? createdAtMs : Date.now()) +
        APR_DRAFT_TTL_MS,
    ).toISOString();
  const next: AprDraftMetadata = {
    draftId,
    createdAt,
    expiresAt,
  };

  if (metadata?.tenantId) {
    next.tenantId = metadata.tenantId;
  }

  if (Array.isArray(metadata?.suggestedRisks)) {
    next.suggestedRisks = metadata.suggestedRisks.map((risk) => ({
      id: risk.id,
      label: risk.label,
      category: risk.category,
    }));
  }

  if (Array.isArray(metadata?.mandatoryChecklists)) {
    next.mandatoryChecklists = metadata.mandatoryChecklists.map(
      (checklist) => ({
        id: checklist.id,
        label: checklist.label,
        reason: checklist.reason,
        source: checklist.source,
      }),
    );
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
      value && typeof value === "object" ? sanitizeJsonForDraft(value) : value;
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

export function clearAprDraftsForOtherTenants(currentTenantId?: string | null) {
  if (typeof window === "undefined" || !currentTenantId) {
    return;
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (
      key &&
      APR_DRAFT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
      !key.endsWith(currentTenantId)
    ) {
      window.localStorage.removeItem(key);
    }
  }
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
      expired: false,
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
      expired: false,
    };
  }

  try {
    const parsed = JSON.parse(raw) as LegacyAprDraftRecord;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid draft format");
    }

    const draft = normalizeDraftRecord(parsed);
    const expiresAtMs = new Date(draft.metadata.expiresAt).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs < Date.now()) {
      clearAprDraft(primaryKey, legacyKey);
      return {
        draft: null,
        corrupted: false,
        migratedFromLegacy: false,
        removedSensitiveState: false,
        expired: true,
      };
    }

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
      expired: false,
    };
  } catch {
    clearAprDraft(primaryKey, legacyKey);
    return {
      draft: null,
      corrupted: true,
      migratedFromLegacy: false,
      removedSensitiveState: false,
      expired: false,
    };
  }
}
