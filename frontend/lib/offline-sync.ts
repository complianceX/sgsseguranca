import api from '@/lib/api';

export type OfflineQueueItem = {
  id: string;
  url: string;
  method: 'post' | 'patch';
  data: unknown;
  headers?: Record<string, string>;
  createdAt: string;
  label: string;
  attempts?: number;
  lastAttemptAt?: string;
  lastError?: string;
  nextRetryAt?: string;
};

const STORAGE_KEY = 'gst.offline.queue';
const LEGACY_STORAGE_KEY = 'compliancex.offline.queue';
const MAX_RETRY_ATTEMPTS = 7;
const BASE_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Offline queue encryption (AES-GCM via Web Crypto API)
// Protects sensitive payloads at rest in localStorage against XSS exfiltration.
// The key is derived per-session and stored in sessionStorage (not localStorage),
// so it is not persisted across browser sessions — acceptable trade-off since
// offline queue is short-lived.
// ---------------------------------------------------------------------------
const CRYPTO_KEY_STORAGE = 'gst.offline.key';

async function getOrCreateCryptoKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  try {
    const stored = sessionStorage.getItem(CRYPTO_KEY_STORAGE);
    if (stored) {
      const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
      return window.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ]);
    }
    const key = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const exported = await window.crypto.subtle.exportKey('raw', key);
    sessionStorage.setItem(
      CRYPTO_KEY_STORAGE,
      btoa(String.fromCharCode(...new Uint8Array(exported))),
    );
    return key;
  } catch {
    return null;
  }
}

async function encryptPayload(plaintext: string): Promise<string> {
  const key = await getOrCreateCryptoKey();
  if (!key) return plaintext; // Graceful fallback
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return 'enc:' + btoa(String.fromCharCode(...combined));
}

async function decryptPayload(data: string): Promise<string> {
  if (!data.startsWith('enc:')) return data; // Not encrypted (legacy)
  const key = await getOrCreateCryptoKey();
  if (!key) return '[]'; // Key lost (new session) — return empty queue
  try {
    const combined = Uint8Array.from(atob(data.slice(4)), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return '[]'; // Decryption failed — discard corrupted data
  }
}

type OfflineSyncSummary = {
  total: number;
  sent: number;
  failed: number;
  pending: number;
};

type OfflineQueueItemResult =
  | { status: 'sent'; itemId: string }
  | { status: 'pending'; itemId: string; item: OfflineQueueItem }
  | { status: 'offline'; itemId: string }
  | { status: 'missing'; itemId: string };

const isOnline = () =>
  typeof window !== 'undefined' ? navigator.onLine : false;

const computeRetryDelay = (attempt: number) =>
  Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1)), MAX_RETRY_DELAY_MS);

const isLikelyNetworkError = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  return (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT'
  );
};

const shouldRetry = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (isLikelyNetworkError(error)) return true;
  if (!status) return true;
  return status >= 500 && status <= 599;
};

const readQueue = async (): Promise<OfflineQueueItem[]> => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const decrypted = await decryptPayload(raw);
      return JSON.parse(decrypted) as OfflineQueueItem[];
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const migrated = JSON.parse(legacyRaw) as OfflineQueueItem[];
      // Re-encrypt on migration
      const encrypted = await encryptPayload(JSON.stringify(migrated));
      window.localStorage.setItem(STORAGE_KEY, encrypted);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    }

    return [];
  } catch {
    return [];
  }
};

const writeQueue = async (items: OfflineQueueItem[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  const encrypted = await encryptPayload(JSON.stringify(items));
  window.localStorage.setItem(STORAGE_KEY, encrypted);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  window.dispatchEvent(
    new CustomEvent('app:offline-queue-updated', {
      detail: { count: items.length },
    }),
  );
};

const dispatchSyncStarted = (detail: OfflineSyncSummary | { total: number; itemId?: string }) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('app:offline-sync-started', {
      detail,
    }),
  );
};

const dispatchSyncCompleted = (detail: OfflineSyncSummary | { itemId?: string; status: string }) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('app:offline-sync-completed', {
      detail,
    }),
  );
};

const processQueueItem = async (
  item: OfflineQueueItem,
  forceRetry = false,
): Promise<OfflineQueueItemResult> => {
  if (typeof window === 'undefined' || !isOnline()) {
    return { status: 'offline', itemId: item.id };
  }

  if (!forceRetry && item.nextRetryAt && Date.now() < new Date(item.nextRetryAt).getTime()) {
    return { status: 'pending', itemId: item.id, item };
  }

  try {
    await api.request({
      url: item.url,
      method: item.method,
      data: item.data,
      headers: item.headers,
    });
    return { status: 'sent', itemId: item.id };
  } catch (error) {
    const attempts = (item.attempts || 0) + 1;
    const retryable = shouldRetry(error);
    const allowRetry = retryable && attempts < MAX_RETRY_ATTEMPTS;

    const nextItem: OfflineQueueItem = {
      ...item,
      attempts,
      lastAttemptAt: new Date().toISOString(),
      lastError: (error as { message?: string })?.message || 'Falha de sincronização',
      nextRetryAt: allowRetry
        ? new Date(Date.now() + computeRetryDelay(attempts)).toISOString()
        : undefined,
    };

    return {
      status: 'pending',
      itemId: item.id,
      item: nextItem,
    };
  }
};

export const enqueueOfflineMutation = async (item: Omit<OfflineQueueItem, 'id' | 'createdAt'>) => {
  const queue = await readQueue();
  const queuedItem: OfflineQueueItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  queue.push(queuedItem);
  await writeQueue(queue);
  return queuedItem;
};

export const getOfflineQueueCount = async () => (await readQueue()).length;

export const getOfflineQueueSnapshot = () => readQueue();

export const removeOfflineQueueItem = async (itemId: string) => {
  const nextQueue = (await readQueue()).filter((item) => item.id !== itemId);
  await writeQueue(nextQueue);
};

export const retryOfflineQueueItem = async (itemId: string) => {
  const queue = await readQueue();
  const target = queue.find((item) => item.id === itemId);

  if (!target) {
    return { status: 'missing', itemId } as const;
  }

  dispatchSyncStarted({ total: 1, itemId });
  const result = await processQueueItem(target, true);

  if (result.status === 'sent') {
    await writeQueue(queue.filter((item) => item.id !== itemId));
    dispatchSyncCompleted({ itemId, status: 'sent' });
    return result;
  }

  if (result.status === 'pending') {
    await writeQueue(
      queue.map((item) => (item.id === itemId ? result.item : item)),
    );
    dispatchSyncCompleted({ itemId, status: 'pending' });
    return result;
  }

  dispatchSyncCompleted({ itemId, status: result.status });
  return result;
};

export const flushOfflineQueue = async () => {
  if (typeof window === 'undefined' || !isOnline()) {
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
    if (result.status === 'sent') {
      summary.sent += 1;
      continue;
    }

    if (result.status === 'pending') {
      pending.push(result.item);
      continue;
    }

    if (result.status === 'offline') {
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
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const onOnline = () => {
    void flushOfflineQueue();
  };

  window.addEventListener('online', onOnline);
  void flushOfflineQueue();

  return () => {
    window.removeEventListener('online', onOnline);
  };
};
