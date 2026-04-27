import api from "@/lib/api";

export type OfflineQueueState = "queued" | "retry_waiting";

export type OfflineQueueMetadata = {
  module?: string;
  entityType?: string;
  draftId?: string;
  source?: string;
};

export type OfflineQueueItem = {
  id: string;
  correlationId: string;
  dedupeKey?: string;
  url: string;
  method: "post" | "patch";
  data: unknown;
  headers?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  label: string;
  state: OfflineQueueState;
  meta?: OfflineQueueMetadata;
  attempts?: number;
  lastAttemptAt?: string;
  lastError?: string;
  nextRetryAt?: string;
};

type OfflineQueueSummaryItem = {
  id: string;
  correlationId: string;
  dedupeKey?: string;
  label: string;
  state: OfflineQueueState;
  attempts?: number;
  nextRetryAt?: string;
  meta?: OfflineQueueMetadata;
};

type OfflineSyncSummary = {
  total: number;
  sent: number;
  failed: number;
  pending: number;
};

type OfflineQueueItemResult =
  | { status: "sent"; itemId: string }
  | { status: "pending"; itemId: string; item: OfflineQueueItem }
  | { status: "offline"; itemId: string }
  | { status: "missing"; itemId: string };

type OfflineQueueInput = Omit<
  OfflineQueueItem,
  "id" | "correlationId" | "createdAt" | "updatedAt" | "state"
> & {
  correlationId?: string;
  dedupeKey?: string;
  meta?: OfflineQueueMetadata;
};

type OfflineItemEventStatus =
  | "enqueued"
  | "deduplicated"
  | "syncing"
  | "sent"
  | "retry_scheduled"
  | "conflict"
  | "removed";

const STORAGE_KEY = "gst.offline.queue";
const LEGACY_STORAGE_KEY = "compliancex.offline.queue";
const MAX_RETRY_ATTEMPTS = 7;
const BASE_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

// Chave AES-GCM mantida apenas em memória — não persiste entre recargas.
// Dados offline cifrados em sessões anteriores são descartados graciosamente
// pelo decryptPayload (retorna "[]"), evitando expor a chave bruta em storage.
let _sessionCryptoKey: CryptoKey | null = null;

function createStableId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeMeta(meta?: OfflineQueueMetadata): OfflineQueueMetadata | undefined {
  if (!meta) {
    return undefined;
  }

  const next: OfflineQueueMetadata = {};

  if (meta.module) next.module = meta.module;
  if (meta.entityType) next.entityType = meta.entityType;
  if (meta.draftId) next.draftId = meta.draftId;
  if (meta.source) next.source = meta.source;

  return Object.keys(next).length > 0 ? next : undefined;
}

function summarizeItem(item: OfflineQueueItem): OfflineQueueSummaryItem {
  return {
    id: item.id,
    correlationId: item.correlationId,
    dedupeKey: item.dedupeKey,
    label: item.label,
    state: item.state,
    attempts: item.attempts,
    nextRetryAt: item.nextRetryAt,
    meta: item.meta,
  };
}

function normalizeQueueItem(raw: Partial<OfflineQueueItem>): OfflineQueueItem {
  const now = new Date().toISOString();
  const correlationId = raw.correlationId || raw.id || createStableId();
  const id = raw.id || correlationId;
  const createdAt = raw.createdAt || now;

  return {
    id,
    correlationId,
    dedupeKey: raw.dedupeKey,
    url: raw.url || "/",
    method: raw.method === "patch" ? "patch" : "post",
    data: raw.data,
    headers: raw.headers,
    createdAt,
    updatedAt: raw.updatedAt || raw.lastAttemptAt || createdAt,
    label: raw.label || "Offline item",
    state: raw.state === "retry_waiting" ? "retry_waiting" : "queued",
    meta: sanitizeMeta(raw.meta),
    attempts: raw.attempts,
    lastAttemptAt: raw.lastAttemptAt,
    lastError: raw.lastError,
    nextRetryAt: raw.nextRetryAt,
  };
}

function normalizeQueue(items: unknown): OfflineQueueItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const normalized = items
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeQueueItem(item as Partial<OfflineQueueItem>));
  const byIdentity = new Map<string, OfflineQueueItem>();

  normalized.forEach((item) => {
    const key = item.dedupeKey || item.id;
    byIdentity.set(key, item);
  });

  return Array.from(byIdentity.values());
}

async function getOrCreateCryptoKey(): Promise<CryptoKey | null> {
  if (typeof window === "undefined" || !window.crypto?.subtle) return null;
  if (_sessionCryptoKey) return _sessionCryptoKey;
  try {
    _sessionCryptoKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    return _sessionCryptoKey;
  } catch {
    return null;
  }
}

async function encryptPayload(plaintext: string): Promise<string> {
  const key = await getOrCreateCryptoKey();
  if (!key) return plaintext;
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  const combined = new Uint8Array(
    iv.length + new Uint8Array(ciphertext).length,
  );
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return "enc:" + btoa(String.fromCharCode(...combined));
}

async function decryptPayload(data: string): Promise<string> {
  if (!data.startsWith("enc:")) return data;
  const key = await getOrCreateCryptoKey();
  if (!key) return "[]";
  try {
    const combined = Uint8Array.from(atob(data.slice(4)), (c) =>
      c.charCodeAt(0),
    );
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return "[]";
  }
}

const isOnline = () =>
  typeof window !== "undefined" ? navigator.onLine : false;

const computeRetryDelay = (attempt: number) =>
  Math.min(
    BASE_RETRY_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1)),
    MAX_RETRY_DELAY_MS,
  );

const isLikelyNetworkError = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  return (
    code === "ERR_NETWORK" ||
    code === "ECONNABORTED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT"
  );
};

const isConflictError = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 409;
};

const shouldRetry = (error: unknown) => {
  if (isConflictError(error)) return false; // conflito otimista — não retenta
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (isLikelyNetworkError(error)) return true;
  if (!status) return true;
  return status >= 500 && status <= 599;
};

async function readQueue(): Promise<OfflineQueueItem[]> {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const decrypted = await decryptPayload(raw);
      return normalizeQueue(JSON.parse(decrypted));
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const migrated = normalizeQueue(JSON.parse(legacyRaw));
      await writeQueue(migrated);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    }

    return [];
  } catch {
    return [];
  }
}

async function writeQueue(items: OfflineQueueItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeQueue(items);
  const encrypted = await encryptPayload(JSON.stringify(normalized));
  window.localStorage.setItem(STORAGE_KEY, encrypted);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  window.dispatchEvent(
    new CustomEvent("app:offline-queue-updated", {
      detail: {
        count: normalized.length,
        items: normalized.map(summarizeItem),
      },
    }),
  );
}

function dispatchSyncStarted(
  detail: OfflineSyncSummary | { total: number; itemId?: string },
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("app:offline-sync-started", {
      detail,
    }),
  );
}

function dispatchSyncCompleted(
  detail: OfflineSyncSummary | { itemId?: string; status: string },
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("app:offline-sync-completed", {
      detail,
    }),
  );
}

function dispatchItemEvent(
  status: OfflineItemEventStatus,
  item: OfflineQueueItem,
  detail?: { error?: string },
) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("app:offline-sync-item", {
      detail: {
        status,
        item: summarizeItem(item),
        error: detail?.error,
      },
    }),
  );
}

async function processQueueItem(
  item: OfflineQueueItem,
  forceRetry = false,
): Promise<OfflineQueueItemResult> {
  if (typeof window === "undefined" || !isOnline()) {
    return { status: "offline", itemId: item.id };
  }

  if (
    !forceRetry &&
    item.nextRetryAt &&
    Date.now() < new Date(item.nextRetryAt).getTime()
  ) {
    return { status: "pending", itemId: item.id, item };
  }

  dispatchItemEvent("syncing", item);

  try {
    await api.request({
      url: item.url,
      method: item.method,
      data: item.data,
      headers: item.headers,
    });
    dispatchItemEvent("sent", item);
    return { status: "sent", itemId: item.id };
  } catch (error) {
    // Conflito otimista (409): outro usuário modificou o registro enquanto este
    // estava offline. Não há como mesclar automaticamente — remove da fila e
    // notifica o usuário para recarregar e reaplicar manualmente.
    if (isConflictError(error)) {
      dispatchItemEvent("conflict", item, {
        error:
          "Conflito detectado: a APR foi modificada por outro usuário enquanto você estava offline. Recarregue e aplique suas alterações novamente.",
      });
      return { status: "sent", itemId: item.id }; // "sent" para remover da fila
    }

    const attempts = (item.attempts || 0) + 1;
    const retryable = shouldRetry(error);
    const allowRetry = retryable && attempts < MAX_RETRY_ATTEMPTS;

    const nextItem: OfflineQueueItem = {
      ...item,
      attempts,
      state: "retry_waiting",
      updatedAt: new Date().toISOString(),
      lastAttemptAt: new Date().toISOString(),
      lastError:
        (error as { message?: string })?.message || "Falha de sincronização",
      nextRetryAt: allowRetry
        ? new Date(Date.now() + computeRetryDelay(attempts)).toISOString()
        : undefined,
    };

    dispatchItemEvent("retry_scheduled", nextItem, {
      error: nextItem.lastError,
    });

    return {
      status: "pending",
      itemId: item.id,
      item: nextItem,
    };
  }
}

export const enqueueOfflineMutation = async (item: OfflineQueueInput) => {
  const queue = await readQueue();
  const now = new Date().toISOString();

  if (item.dedupeKey) {
    const existingIndex = queue.findIndex(
      (queuedItem) => queuedItem.dedupeKey === item.dedupeKey,
    );

    if (existingIndex >= 0) {
      const existing = queue[existingIndex];
      const updatedItem = normalizeQueueItem({
        ...existing,
        ...item,
        id: existing.id,
        correlationId: existing.correlationId,
        dedupeKey: item.dedupeKey,
        state: "queued",
        updatedAt: now,
        lastError: undefined,
        nextRetryAt: undefined,
      });
      queue.splice(existingIndex, 1, updatedItem);
      await writeQueue(queue);
      dispatchItemEvent("deduplicated", updatedItem);
      return { ...updatedItem, deduplicated: true as const };
    }
  }

  const correlationId = item.correlationId || createStableId();
  const queuedItem = normalizeQueueItem({
    ...item,
    id: correlationId,
    correlationId,
    createdAt: now,
    updatedAt: now,
    state: "queued",
  });
  queue.push(queuedItem);
  await writeQueue(queue);
  dispatchItemEvent("enqueued", queuedItem);
  return queuedItem;
};

export const getOfflineQueueCount = async () => (await readQueue()).length;

export const getOfflineQueueSnapshot = () => readQueue();

export const removeOfflineQueueItem = async (itemId: string) => {
  const queue = await readQueue();
  const removedItem = queue.find((item) => item.id === itemId);
  const nextQueue = queue.filter((item) => item.id !== itemId);
  await writeQueue(nextQueue);
  if (removedItem) {
    dispatchItemEvent("removed", removedItem);
  }
};

export const retryOfflineQueueItem = async (itemId: string) => {
  const queue = await readQueue();
  const target = queue.find((item) => item.id === itemId);

  if (!target) {
    return { status: "missing", itemId } as const;
  }

  dispatchSyncStarted({ total: 1, itemId });
  const result = await processQueueItem(target, true);

  if (result.status === "sent") {
    await writeQueue(queue.filter((item) => item.id !== itemId));
    dispatchSyncCompleted({ itemId, status: "sent" });
    return result;
  }

  if (result.status === "pending") {
    await writeQueue(
      queue.map((item) => (item.id === itemId ? result.item : item)),
    );
    dispatchSyncCompleted({ itemId, status: "pending" });
    return result;
  }

  dispatchSyncCompleted({ itemId, status: result.status });
  return result;
};

export const flushOfflineQueue = async () => {
  if (typeof window === "undefined" || !isOnline()) {
    return;
  }

  const queue = await readQueue();
  if (queue.length === 0) {
    return;
  }

  const pending: OfflineQueueItem[] = [];
  const summary: OfflineSyncSummary = {
    total: queue.length,
    sent: 0,
    failed: 0,
    pending: 0,
  };

  dispatchSyncStarted(summary);

  for (const item of queue) {
    const result = await processQueueItem(item);
    if (result.status === "sent") {
      summary.sent += 1;
      continue;
    }

    if (result.status === "pending") {
      pending.push(result.item);
      continue;
    }

    if (result.status === "offline") {
      pending.push(item);
      continue;
    }

    summary.failed += 1;
  }

  summary.pending = pending.length;
  await writeQueue(pending);

  dispatchSyncCompleted(summary);
};

export const registerOfflineSync = () => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onOnline = () => {
    void flushOfflineQueue();
  };

  window.addEventListener("online", onOnline);
  void flushOfflineQueue();

  return () => {
    window.removeEventListener("online", onOnline);
  };
};
