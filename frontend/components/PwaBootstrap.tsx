'use client';

import { useEffect } from 'react';
import { registerOfflineSync } from '@/lib/offline-sync';

export function PwaBootstrap() {
  useEffect(() => {
    const cleanup = registerOfflineSync();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    return cleanup;
  }, []);

  return null;
}
