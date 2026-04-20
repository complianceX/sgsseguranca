'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsService, type AppNotification } from '@/services/notificationsService';

const ACTIVE_INTERVAL_MS   = 15_000; // 15s quando aba ativa
const INACTIVE_INTERVAL_MS = 60_000; // 60s quando aba inativa
const DEBOUNCE_MS          = 500;    // evita múltiplos fetches em rajada

export interface UseRealtimeNotificationsResult {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useRealtimeNotifications(): UseRealtimeNotificationsResult {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(true);
  const inflightRef = useRef<Promise<void> | null>(null);
  const notificationsRef = useRef<AppNotification[]>(notifications);
  const unreadCountRef = useRef(unreadCount);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  const fetchAll = useCallback(async () => {
    // Reutiliza inflight se já há uma requisição em curso
    if (inflightRef.current) return inflightRef.current;

    const req = (async () => {
      try {
        const [listRes, countRes] = await Promise.all([
          notificationsService.findAll(1, 20),
          notificationsService.getUnreadCount(),
        ]);
        notificationsRef.current = listRes.items;
        unreadCountRef.current = countRes.count;
        setNotifications(listRes.items);
        setUnreadCount(countRes.count);
      } catch {
        // silencia erros de rede — polling retentará no próximo ciclo
      } finally {
        inflightRef.current = null;
      }
    })();

    inflightRef.current = req;
    return req;
  }, []);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = isActiveRef.current ? ACTIVE_INTERVAL_MS : INACTIVE_INTERVAL_MS;
    timerRef.current = setTimeout(() => {
      void fetchAll().then(schedule);
    }, delay);
  }, [fetchAll]);

  // Dispara fetchAll com debounce para absorver chamadas em rajada (foco + refresh manual)
  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void fetchAll().then(schedule);
    }, DEBOUNCE_MS);
  }, [fetchAll, schedule]);

  useEffect(() => {
    const handleVisibility = () => {
      isActiveRef.current = document.visibilityState === 'visible';
      if (isActiveRef.current) {
        debouncedFetch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    void fetchAll().then(schedule);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchAll, schedule, debouncedFetch]);

  const markAllRead = useCallback(async () => {
    console.log("[useRealtimeNotifications] markAllRead chamado");

    const prevNotifications = notificationsRef.current;
    const prevCount = unreadCountRef.current;
    const ids = prevNotifications.map((n) => n.id);

    if (ids.length === 0 || prevCount === 0) {
      return;
    }

    const nextNotifications = prevNotifications.map((n) => ({ ...n, read: true }));
    notificationsRef.current = nextNotifications;
    unreadCountRef.current = 0;

    setUnreadCount(0);
    setNotifications(nextNotifications);

    try {
      await notificationsService.markAllAsRead();
    } catch {
      // Reverte estado otimista se o backend rejeitar
      notificationsRef.current = prevNotifications;
      unreadCountRef.current = prevCount;
      setUnreadCount(prevCount);
      setNotifications(prevNotifications);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    const prevNotifications = notificationsRef.current;
    const prevCount = unreadCountRef.current;

    let changed = false;
    const nextNotifications = prevNotifications.map((n) => {
      if (n.id === id && !n.read) {
        changed = true;
        return { ...n, read: true };
      }
      return n;
    });

    if (!changed) {
      return;
    }

    const nextUnreadCount = Math.max(0, prevCount - 1);
    notificationsRef.current = nextNotifications;
    unreadCountRef.current = nextUnreadCount;

    setNotifications(nextNotifications);
    setUnreadCount(nextUnreadCount);

    try {
      await notificationsService.markAsRead(id);
    } catch {
      notificationsRef.current = prevNotifications;
      unreadCountRef.current = prevCount;
      setNotifications(prevNotifications);
      setUnreadCount(prevCount);
    }
  }, []);

  const refresh = useCallback(() => {
    debouncedFetch();
  }, [debouncedFetch]);

  return { notifications, unreadCount, markAllRead, markRead, refresh };
}
