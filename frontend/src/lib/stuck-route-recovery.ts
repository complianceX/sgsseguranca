const RECOVERY_STORAGE_KEY = 'sgs_stuck_route_recovery_at';
const RECOVERY_REASON_KEY = 'sgs_stuck_route_recovery_reason';
const RECOVERY_COOLDOWN_MS = 3 * 60 * 1000;
const CACHE_PREFIXES_TO_CLEAR = ['sgs-shell', 'gst-shell'];

function isBrowser() {
  return typeof window !== 'undefined';
}

function now() {
  return Date.now();
}

function getLastRecoveryTimestamp(): number | null {
  if (!isBrowser()) return null;
  const rawValue = window.sessionStorage.getItem(RECOVERY_STORAGE_KEY);
  if (!rawValue) return null;

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

export function canAttemptStuckRouteRecovery(): boolean {
  if (!isBrowser()) return false;
  const lastAttempt = getLastRecoveryTimestamp();
  if (!lastAttempt) return true;
  return now() - lastAttempt > RECOVERY_COOLDOWN_MS;
}

async function unregisterServiceWorkers() {
  if (!isBrowser() || !('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations.map((registration) => registration.unregister()),
  );
}

async function clearSgsCaches() {
  if (!isBrowser() || !('caches' in window)) return;

  const cacheKeys = await window.caches.keys();
  const staleKeys = cacheKeys.filter((cacheKey) =>
    CACHE_PREFIXES_TO_CLEAR.some((prefix) => cacheKey.startsWith(prefix)),
  );

  await Promise.allSettled(
    staleKeys.map((cacheKey) => window.caches.delete(cacheKey)),
  );
}

function buildCacheBustedUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('_cacheBust', String(now()));
  return url.toString();
}

export async function triggerStuckRouteRecovery(
  reason: string,
): Promise<boolean> {
  if (!canAttemptStuckRouteRecovery()) {
    return false;
  }

  const timestamp = String(now());
  window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, timestamp);
  window.sessionStorage.setItem(
    RECOVERY_REASON_KEY,
    reason.slice(0, 120) || 'unknown',
  );

  await Promise.allSettled([unregisterServiceWorkers(), clearSgsCaches()]);
  window.location.replace(buildCacheBustedUrl());
  return true;
}
