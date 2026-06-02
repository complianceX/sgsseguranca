// DEV ONLY — este componente não renderiza em produção (process.env.NODE_ENV guard)
'use client';

import { useEffect } from 'react';

const DEV_CACHE_RESET_BUILD_ID =
  process.env.NEXT_PUBLIC_BUILD_ID?.trim() || 'local-dev';

const DEV_CACHE_PREFIXES = ['sgs-shell', 'gst-shell'];

function shouldResetDevCaches() {
  if (typeof window === 'undefined') {
    return false;
  }

  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local')
  );
}

export function DevCacheReset() {
  if (process.env.NODE_ENV === 'production') return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!shouldResetDevCaches()) {
      return;
    }

    let cancelled = false;
    const sessionKey = `sgs.dev-cache-reset.${DEV_CACHE_RESET_BUILD_ID}`;

    const reset = async () => {
      const hadResetForThisBuild =
        window.sessionStorage.getItem(sessionKey) === 'done';

      let hadRegistrations = false;

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker
          .getRegistrations()
          .catch(() => []);

        hadRegistrations = registrations.length > 0;

        await Promise.all(
          registrations.map((registration) =>
            registration.unregister().catch(() => false),
          ),
        );
      }

      if ('caches' in window) {
        const cacheKeys = await window.caches.keys().catch(() => []);
        const devKeys = cacheKeys.filter((key) =>
          DEV_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)),
        );

        await Promise.all(devKeys.map((key) => window.caches.delete(key)));
      }

      if (!cancelled && hadRegistrations && !hadResetForThisBuild) {
        window.sessionStorage.setItem(sessionKey, 'done');
        window.location.reload();
        return;
      }

      window.sessionStorage.setItem(sessionKey, 'done');
    };

    void reset();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
