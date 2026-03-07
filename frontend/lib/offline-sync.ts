import api from '@/lib/api';

type OfflineQueueItem = {
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

const STORAGE_KEY = 'compliancex.offline.queue';
const MAX_RETRY_ATTEMPTS = 7;
const BASE_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

type OfflineSyncSummary = {
  total: number;
  sent: number;
  failed: number;
  pending: number;
};

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
    return raw ? (JSON.parse(raw) as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
};

const writeQueue = (items: OfflineQueueItem[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(
    new CustomEvent('app:offline-queue-updated', {
      detail: { count: items.length },
    }),
  );
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

  window.dispatchEvent(
    new CustomEvent('app:offline-sync-started', {
      detail: summary,
    }),
  );

  for (const item of queue) {
    if (item.nextRetryAt && Date.now() < new Date(item.nextRetryAt).getTime()) {
      pending.push(item);
      continue;
    }

    try {
      await api.request({
        url: item.url,
        method: item.method,
        data: item.data,
        headers: item.headers,
      });
      summary.sent += 1;
    } catch (error) {
      const attempts = (item.attempts || 0) + 1;
      const retryable = shouldRetry(error);
      const allowRetry = retryable && attempts < MAX_RETRY_ATTEMPTS;

      if (allowRetry) {
        const nextRetryAt = new Date(Date.now() + computeRetryDelay(attempts)).toISOString();
        pending.push({
          ...item,
          attempts,
          lastAttemptAt: new Date().toISOString(),
          lastError: (error as { message?: string })?.message || 'Falha de sincronização',
          nextRetryAt,
        });
      } else {
        summary.failed += 1;
      }
    }
  }

  summary.pending = pending.length;
  writeQueue(pending);

  window.dispatchEvent(
    new CustomEvent('app:offline-sync-completed', {
      detail: summary,
    }),
  );
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
