'use client';

import { useEffect, useMemo, useState } from 'react';
import { clearExpiredCache } from '@/lib/offline-cache';

type ApiOfflineDetail = {
  baseURL?: string;
};

export function useApiStatus() {
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [hasStaleCache, setHasStaleCache] = useState<boolean>(false);

  useEffect(() => {
    const handleBrowserOnline = () => {
      setIsOffline(false);
      setApiBaseUrl('');
      setIsSyncing(true);
      Promise.resolve().then(() => {
        clearExpiredCache();
        setIsSyncing(false);
      });
    };
    const handleBrowserOffline = () => {
      setIsOffline(true);
      setApiBaseUrl('');
    };
    const handleApiOffline = (event: Event) => {
      const customEvent = event as CustomEvent<ApiOfflineDetail>;
      setIsOffline(true);
      setApiBaseUrl(customEvent.detail?.baseURL || '');
    };
    const handleApiOnline = () => {
      setIsOffline(false);
      setApiBaseUrl('');
      setIsSyncing(true);
      Promise.resolve().then(() => {
        clearExpiredCache();
        setIsSyncing(false);
      });
    };
    const handleStaleCache = () => {
      setHasStaleCache(true);
    };

    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);
    window.addEventListener('app:api-offline', handleApiOffline);
    window.addEventListener('app:api-online', handleApiOnline);
    window.addEventListener('app:stale-cache', handleStaleCache);

    return () => {
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
      window.removeEventListener('app:api-offline', handleApiOffline);
      window.removeEventListener('app:api-online', handleApiOnline);
      window.removeEventListener('app:stale-cache', handleStaleCache);
    };
  }, []);

  const offlineMessage = useMemo(() => {
    if (!apiBaseUrl) {
      return 'Sem conexão com o servidor. Verifique backend, rede e tente novamente.';
    }
    return `Sem conexão com o servidor (${apiBaseUrl}). Verifique backend, rede e tente novamente.`;
  }, [apiBaseUrl]);

  return {
    isOffline,
    apiBaseUrl,
    offlineMessage,
    /** True enquanto o cache expirado está sendo invalidado após reconexão. */
    isSyncing,
    /** True se dados desatualizados (stale) foram servidos do cache nesta sessão. */
    hasStaleCache,
    /** Limpa o estado de stale manualmente (ex: após o usuário confirmar aviso). */
    clearStaleFlag: () => setHasStaleCache(false),
  };
}
