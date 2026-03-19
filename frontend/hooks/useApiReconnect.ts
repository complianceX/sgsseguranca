'use client';

import { useCallback, useState } from 'react';
import { getApiBaseUrl } from '@/lib/api';

export function useApiReconnect(apiBaseUrl?: string) {
  const [isReconnecting, setIsReconnecting] = useState(false);

  const checkHealthOnce = useCallback(async () => {
    const targetBaseUrl = apiBaseUrl || getApiBaseUrl();

    if (!targetBaseUrl) {
      window.dispatchEvent(
        new CustomEvent('app:api-offline', { detail: { baseURL: null } }),
      );
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(`${targetBaseUrl}/health`, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Health check falhou: ${response.status}`);
      }
      window.dispatchEvent(
        new CustomEvent('app:api-online', { detail: { baseURL: targetBaseUrl } }),
      );
      return true;
    } catch {
      window.dispatchEvent(
        new CustomEvent('app:api-offline', { detail: { baseURL: targetBaseUrl } }),
      );
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }, [apiBaseUrl]);

  const reconnect = useCallback(async () => {
    setIsReconnecting(true);
    try {
      await checkHealthOnce();
    } finally {
      setIsReconnecting(false);
    }
  }, [checkHealthOnce]);

  const reconnectWithBackoff = useCallback(async () => {
    setIsReconnecting(true);
    const delays = [1000, 2000, 4000];
    try {
      for (let attempt = 0; attempt <= delays.length; attempt += 1) {
        const ok = await checkHealthOnce();
        if (ok) return true;
        if (attempt < delays.length) {
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        }
      }
      return false;
    } finally {
      setIsReconnecting(false);
    }
  }, [checkHealthOnce]);

  return {
    isReconnecting,
    reconnect,
    reconnectWithBackoff,
  };
}
