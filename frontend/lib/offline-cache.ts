// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CacheEnvelope<T> = {
  value: T;
  createdAt: string;
  maxAgeMs?: number;
};

/** Returned by getOfflineCache when the entry exists but is past its TTL
 *  and the device is currently offline. The data is still usable as a
 *  fallback — callers should surface a "stale data" warning to the user. */
export type StaleResult<T> = { stale: true; data: T };

export function isStaleResult<T>(
  result: T | StaleResult<T>,
): result is StaleResult<T> {
  return (
    typeof result === 'object' &&
    result !== null &&
    'stale' in (result as object) &&
    (result as Record<string, unknown>).stale === true
  );
}

// ---------------------------------------------------------------------------
// TTL presets
// ---------------------------------------------------------------------------

/** Pre-defined TTL values to be passed to setOfflineCache(). */
export const CACHE_TTL = {
  /** 2 min — dados críticos de segurança (APRs ativas). */
  CRITICAL: 120_000,
  /** 5 min — listas paginadas (findAll / findPaginated). */
  LIST: 300_000,
  /** 30 min — registros individuais (findOne). */
  RECORD: 1_800_000,
  /** 60 min — dados de referência (sites, users). */
  REFERENCE: 3_600_000,
} as const;

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const PREFIX = 'gst.cache';
const LEGACY_PREFIX = 'compliancex.cache';
const CACHE_PREFIXES = [`${PREFIX}.`, `${LEGACY_PREFIX}.`];

const buildKey = (key: string, prefix = PREFIX) => `${prefix}.${key}`;

const isBrowser = () => typeof window !== 'undefined';

const isOnline = () => (typeof navigator !== 'undefined' ? navigator.onLine : true);

const isQuotaExceededError = (error: unknown) => {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return (
      error.name === 'QuotaExceededError' ||
      error.code === 22 ||
      error.code === 1014
    );
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'QuotaExceededError'
  );
};

const isManagedCacheKey = (key: string) =>
  CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));

const removeCacheKey = (key: string) => {
  if (!isBrowser()) return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Best effort cleanup only.
  }
};

const getCacheEntryTimestamp = (key: string): number => {
  if (!isBrowser()) return 0;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return 0;

    const parsed = JSON.parse(raw) as Partial<CacheEnvelope<unknown>>;
    if (!parsed?.createdAt) return 0;

    const timestamp = new Date(parsed.createdAt).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  } catch {
    return 0;
  }
};

const getEvictionCandidates = (excludeKeys: string[]) => {
  if (!isBrowser()) return [];

  return Object.keys(window.localStorage)
    .filter((key) => isManagedCacheKey(key) && !excludeKeys.includes(key))
    .sort((left, right) => getCacheEntryTimestamp(left) - getCacheEntryTimestamp(right));
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persists a value in the offline cache with an optional TTL.
 *
 * @param key      Cache key (without prefix).
 * @param value    Serialisable value to cache.
 * @param maxAgeMs Maximum age in milliseconds. Use CACHE_TTL constants.
 *                 Omit to cache indefinitely (legacy behaviour).
 */
export const setOfflineCache = <T>(key: string, value: T, maxAgeMs?: number) => {
  if (!isBrowser()) return;

  const payload: CacheEnvelope<T> = {
    value,
    createdAt: new Date().toISOString(),
    ...(maxAgeMs !== undefined ? { maxAgeMs } : {}),
  };
  const primaryKey = buildKey(key);
  const legacyKey = buildKey(key, LEGACY_PREFIX);

  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch (error) {
    console.warn(`Nao foi possivel serializar o cache offline (${primaryKey}).`, error);
    return;
  }

  const persist = () => {
    window.localStorage.setItem(primaryKey, serialized);
    window.localStorage.removeItem(legacyKey);
  };

  try {
    persist();
    return;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      console.warn(`Nao foi possivel gravar o cache offline (${primaryKey}).`, error);
      return;
    }
  }

  for (const cacheKey of getEvictionCandidates([primaryKey, legacyKey])) {
    removeCacheKey(cacheKey);

    try {
      persist();
      return;
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.warn(`Nao foi possivel gravar o cache offline (${primaryKey}).`, error);
        return;
      }
    }
  }

  console.warn(
    `Cache offline ignorado para ${primaryKey}: quota do storage atingida mesmo apos limpeza.`,
  );
};

/**
 * Reads a cached value and enforces TTL rules:
 *
 * - **Online + expired** → removes the entry and returns `null`
 *   (caller must fetch fresh data).
 * - **Offline + expired** → returns `{ stale: true; data: T }` so the UI
 *   can display a "dados podem estar desatualizados" warning.
 * - **Valid (not expired)** → returns the cached value directly.
 * - **No TTL stored** → returns the value (legacy behaviour, never expires).
 *
 * Use `isStaleResult()` to distinguish fresh from stale returns.
 */
export const getOfflineCache = <T>(key: string): T | StaleResult<T> | null => {
  if (!isBrowser()) return null;
  const primaryKey = buildKey(key);
  const legacyKey = buildKey(key, LEGACY_PREFIX);

  const raw =
    window.localStorage.getItem(primaryKey) || window.localStorage.getItem(legacyKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed?.createdAt) {
      removeCacheKey(primaryKey);
      removeCacheKey(legacyKey);
      return null;
    }

    if (parsed.maxAgeMs !== undefined) {
      const ageMs = Date.now() - new Date(parsed.createdAt).getTime();
      if (ageMs > parsed.maxAgeMs) {
        if (isOnline()) {
          // Online: remover entrada expirada e forçar fetch
          removeCacheKey(primaryKey);
          removeCacheKey(legacyKey);
          return null;
        }
        // Offline: dado expirado é melhor que nenhum dado — retorna com flag stale
        return { stale: true, data: parsed.value };
      }
    }

    return parsed.value;
  } catch {
    removeCacheKey(primaryKey);
    removeCacheKey(legacyKey);
    return null;
  }
};

/**
 * Convenience wrapper around getOfflineCache for use in service catch blocks.
 *
 * - Returns the cached `T` (fresh or stale) or `null` if nothing is cached.
 * - When serving stale data, dispatches a `app:stale-cache` custom event so
 *   the UI layer (e.g. useApiStatus) can surface a warning banner.
 */
export const consumeOfflineCache = <T>(key: string): T | null => {
  const result = getOfflineCache<T>(key);
  if (result === null) return null;
  if (isStaleResult(result)) {
    if (isBrowser()) {
      window.dispatchEvent(new CustomEvent('app:stale-cache', { detail: { key } }));
    }
    return result.data;
  }
  return result;
};

/**
 * Removes all managed cache entries whose TTL has expired.
 * Call this on reconnection to ensure the next fetch gets fresh data.
 * Entries without a stored maxAgeMs are never evicted by this function.
 */
export const clearExpiredCache = (): void => {
  if (!isBrowser()) return;

  for (const rawKey of Object.keys(window.localStorage)) {
    if (!isManagedCacheKey(rawKey)) continue;

    try {
      const raw = window.localStorage.getItem(rawKey);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as Partial<CacheEnvelope<unknown>>;
      if (!parsed?.createdAt || !parsed?.maxAgeMs) continue;

      const ageMs = Date.now() - new Date(parsed.createdAt).getTime();
      if (ageMs > parsed.maxAgeMs) {
        window.localStorage.removeItem(rawKey);
      }
    } catch {
      // Entrada corrompida — remover defensivamente
      try { window.localStorage.removeItem(rawKey); } catch { /* ignore */ }
    }
  }
};

export const isOfflineRequestError = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  return (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT'
  );
};
