'use client';

import { useEffect, useMemo, useState } from 'react';

type ApiOfflineDetail = {
  baseURL?: string;
};

export function useApiStatus() {
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');

  useEffect(() => {
    const handleBrowserOnline = () => {
      setIsOffline(false);
      setApiBaseUrl('');
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
    };

    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);
    window.addEventListener('app:api-offline', handleApiOffline);
    window.addEventListener('app:api-online', handleApiOnline);

    return () => {
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
      window.removeEventListener('app:api-offline', handleApiOffline);
      window.removeEventListener('app:api-online', handleApiOnline);
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
  };
}
