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

const readQueue = (): OfflineQueueItem[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as OfflineQueueItem[];
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const migrated = JSON.parse(legacyRaw) as OfflineQueueItem[];
      window.localStorage.setItem(STORAGE_KEY, legacyRaw);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    }

    return [];
  } catch {
    return [];
  }
};

const writeQueue = (items: OfflineQueueItem[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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

export const enqueueOfflineMutation = (item: Omit<OfflineQueueItem, 'id' | 'createdAt'>) => {
  const queue = readQueue();
  const queuedItem: OfflineQueueItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  queue.push(queuedItem);
  writeQueue(queue);
  return queuedItem;
};

export const getOfflineQueueCount = () => readQueue().length;

export const getOfflineQueueSnapshot = () => readQueue();

export const removeOfflineQueueItem = (itemId: string) => {
  const nextQueue = readQueue().filter((item) => item.id !== itemId);
  writeQueue(nextQueue);
};

export const retryOfflineQueueItem = async (itemId: string) => {
  const queue = readQueue();
  const target = queue.find((item) => item.id === itemId);

  if (!target) {
    return { status: 'missing', itemId } as const;
  }

  dispatchSyncStarted({ total: 1, itemId });
  const result = await processQueueItem(target, true);

  if (result.status === 'sent') {
    writeQueue(queue.filter((item) => item.id !== itemId));
    dispatchSyncCompleted({ itemId, status: 'sent' });
    return result;
  }

  if (result.status === 'pending') {
    writeQueue(
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

  const queue = readQueue();
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
  writeQueue(pending);

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
