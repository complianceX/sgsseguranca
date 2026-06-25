import { sanitizeSensitiveDraftValue } from "./sensitive-draft-sanitizer";
import { secureOfflineDB } from "./offline-db-secure";

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
    typeof result === "object" &&
    result !== null &&
    "stale" in (result as object) &&
    (result as Record<string, unknown>).stale === true
  );
}

// ---------------------------------------------------------------------------
// TTL presets
// ---------------------------------------------------------------------------

/** Pre-defined TTL values to be passed to setOfflineCache(). */
export const CACHE_TTL = {
  /** 2 min — dados críticos de segurança (APRs ativas). */
  CACHE_TTL_CRITICAL: 120_000, // keep generic name mapping
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

const PREFIX = "gst.cache";
const LEGACY_PREFIX = "compliancex.cache";
const CACHE_PREFIXES = [`${PREFIX}.`, `${LEGACY_PREFIX}.`];

const buildKey = (key: string, prefix = PREFIX) => `${prefix}.${key}`;

const isBrowser = () => typeof window !== "undefined";

const isOnline = () =>
  typeof navigator !== "undefined" ? navigator.onLine : true;

const isManagedCacheKey = (key: string) =>
  CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));

// Espelho em memória para suportar chamadas síncronas rápidas (getOfflineCache)
const _memoryCache = new Map<string, CacheEnvelope<unknown>>();

// Inicialização assíncrona: carrega chaves do IndexedDB para a memória no boot
if (isBrowser()) {
  secureOfflineDB.keys("sgs-cache")
    .then(async (keys) => {
      for (const dbKey of keys) {
        const envelope = await secureOfflineDB.get<CacheEnvelope<unknown>>("sgs-cache", dbKey);
        if (envelope) {
          _memoryCache.set(dbKey, envelope);
        }
      }
      // Limpeza de cache legado no localStorage para liberar espaço
      try {
        for (const rawKey of Object.keys(window.localStorage)) {
          if (isManagedCacheKey(rawKey)) {
            window.localStorage.removeItem(rawKey);
          }
        }
      } catch {
        /* ignore */
      }
    })
    .catch((err) => {
      console.warn("Falha ao inicializar cache do IndexedDB em memoria:", err);
    });
}

const removeCacheKey = (key: string) => {
  _memoryCache.delete(key);
  if (isBrowser()) {
    void secureOfflineDB.del("sgs-cache", key);
  }
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
export const setOfflineCache = <T>(
  key: string,
  value: T,
  maxAgeMs?: number,
) => {
  if (!isBrowser()) return;

  const payload: CacheEnvelope<unknown> = {
    value: sanitizeSensitiveDraftValue(value),
    createdAt: new Date().toISOString(),
    ...(maxAgeMs !== undefined ? { maxAgeMs } : {}),
  };
  const primaryKey = buildKey(key);

  // Atualiza síncronamente na memória
  _memoryCache.set(primaryKey, payload);

  // Persiste assíncronamente no IndexedDB criptografado
  void secureOfflineDB.set("sgs-cache", primaryKey, payload);
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

  // Leitura síncrona super rápida da memória
  const parsed = _memoryCache.get(primaryKey) as CacheEnvelope<T> | undefined;
  if (!parsed) return null;

  if (!parsed.createdAt) {
    removeCacheKey(primaryKey);
    return null;
  }

  if (parsed.maxAgeMs !== undefined) {
    const ageMs = Date.now() - new Date(parsed.createdAt).getTime();
    if (ageMs > parsed.maxAgeMs) {
      if (isOnline()) {
        // Online: remover entrada expirada e forçar fetch
        removeCacheKey(primaryKey);
        return null;
      }
      // Offline: dado expirado é melhor que nenhum dado — retorna com flag stale
      return { stale: true, data: parsed.value };
    }
  }

  return parsed.value as T;
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
      window.dispatchEvent(
        new CustomEvent("app:stale-cache", { detail: { key } }),
      );
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

  for (const [rawKey, parsed] of _memoryCache.entries()) {
    if (!isManagedCacheKey(rawKey) || !parsed?.createdAt || !parsed?.maxAgeMs) continue;

    const ageMs = Date.now() - new Date(parsed.createdAt).getTime();
    if (ageMs > parsed.maxAgeMs) {
      removeCacheKey(rawKey);
    }
  }
};

export const isOfflineRequestError = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  return (
    code === "ERR_NETWORK" ||
    code === "ECONNABORTED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT"
  );
};

