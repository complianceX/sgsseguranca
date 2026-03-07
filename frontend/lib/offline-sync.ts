import api from '@/lib/api';

type OfflineQueueItem = {
  id: string;
  url: string;
  method: 'post' | 'patch';
  data: unknown;
  headers?: Record<string, string>;
  createdAt: string;
  label: string;
};

const STORAGE_KEY = 'compliancex.offline.queue';

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

export const flushOfflineQueue = async () => {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return;
  }

  const queue = readQueue();
  if (queue.length === 0) {
    return;
  }

  const pending: OfflineQueueItem[] = [];

  for (const item of queue) {
    try {
      await api.request({
        url: item.url,
        method: item.method,
        data: item.data,
        headers: item.headers,
      });
    } catch {
      pending.push(item);
    }
  }

  writeQueue(pending);
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
