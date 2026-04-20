'use client';

import { useEffect } from 'react';
import { registerOfflineSync } from '@/lib/offline-sync';

const SERVICE_WORKER_BUILD_ID =
  process.env.NEXT_PUBLIC_BUILD_ID?.trim() || 'local-dev';
const SERVICE_WORKER_URL = `/sw.js?build=${encodeURIComponent(SERVICE_WORKER_BUILD_ID)}`;

export function PwaBootstrap() {
  useEffect(() => {
    const cleanup = registerOfflineSync();

    if (process.env.NODE_ENV !== 'production') {
      return cleanup;
    }

    if ('serviceWorker' in navigator) {
      const hadExistingController = Boolean(navigator.serviceWorker.controller);
      let hasReloadedForUpdate = false;
      const onControllerChange = () => {
        if (!hadExistingController || hasReloadedForUpdate) {
          return;
        }

        hasReloadedForUpdate = true;
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

      navigator.serviceWorker
        .register(SERVICE_WORKER_URL)
        .then((registration) => {
          const promoteWaitingWorker = () => {
            registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
          };

          registration.update().catch(() => undefined);
          promoteWaitingWorker();

          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) {
              return;
            }

            installing.addEventListener('statechange', () => {
              if (
                installing.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                promoteWaitingWorker();
              }
            });
          });
        })
        .catch(() => undefined);

      return () => {
        navigator.serviceWorker.removeEventListener(
          'controllerchange',
          onControllerChange,
        );
        cleanup();
      };
    }

    return cleanup;
  }, []);

  return null;
}
