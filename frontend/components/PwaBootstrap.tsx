'use client';

import { useEffect } from 'react';
import { registerOfflineSync } from '@/lib/offline-sync';

export function PwaBootstrap() {
  useEffect(() => {
    const cleanup = registerOfflineSync();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js?v=3')
        .then((registration) => {
          registration.update().catch(() => undefined);
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        })
        .catch(() => undefined);
    }

    return cleanup;
  }, []);

  return null;
}
