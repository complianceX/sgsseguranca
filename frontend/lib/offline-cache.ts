type CacheEnvelope<T> = {
  value: T;
  createdAt: string;
};

const PREFIX = 'gst.cache';
const LEGACY_PREFIX = 'compliancex.cache';
const CACHE_PREFIXES = [`${PREFIX}.`, `${LEGACY_PREFIX}.`];

const buildKey = (key: string, prefix = PREFIX) => `${prefix}.${key}`;

const isBrowser = () => typeof window !== 'undefined';

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

export const setOfflineCache = <T>(key: string, value: T) => {
  if (!isBrowser()) return;

  const payload: CacheEnvelope<T> = {
    value,
    createdAt: new Date().toISOString(),
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

export const getOfflineCache = <T>(key: string, maxAgeMs?: number): T | null => {
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

    if (maxAgeMs) {
      const ageMs = Date.now() - new Date(parsed.createdAt).getTime();
      if (ageMs > maxAgeMs) {
        removeCacheKey(primaryKey);
        removeCacheKey(legacyKey);
        return null;
      }
    }

    return parsed.value;
  } catch {
    removeCacheKey(primaryKey);
    removeCacheKey(legacyKey);
    return null;
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
