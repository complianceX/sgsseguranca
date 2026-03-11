type CacheEnvelope<T> = {
  value: T;
  createdAt: string;
};

const PREFIX = 'gst.cache';
const LEGACY_PREFIX = 'compliancex.cache';

const buildKey = (key: string, prefix = PREFIX) => `${prefix}.${key}`;

const isBrowser = () => typeof window !== 'undefined';

export const setOfflineCache = <T>(key: string, value: T) => {
  if (!isBrowser()) return;
  const payload: CacheEnvelope<T> = {
    value,
    createdAt: new Date().toISOString(),
  };
  window.localStorage.setItem(buildKey(key), JSON.stringify(payload));
  window.localStorage.removeItem(buildKey(key, LEGACY_PREFIX));
};

export const getOfflineCache = <T>(key: string, maxAgeMs?: number): T | null => {
  if (!isBrowser()) return null;

  const raw =
    window.localStorage.getItem(buildKey(key)) ||
    window.localStorage.getItem(buildKey(key, LEGACY_PREFIX));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed?.createdAt) return null;

    if (maxAgeMs) {
      const ageMs = Date.now() - new Date(parsed.createdAt).getTime();
      if (ageMs > maxAgeMs) return null;
    }

    return parsed.value;
  } catch {
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
