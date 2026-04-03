'use client';

import { useCallback, useMemo } from 'react';

type CacheEntry<TResult> = {
  value?: TResult;
  expiresAt: number;
  inflight?: Promise<TResult>;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

function buildCacheKey(baseKey: string, args: readonly unknown[]) {
  if (args.length === 0) {
    return baseKey;
  }

  return `${baseKey}:${JSON.stringify(args)}`;
}

export interface CachedFetchController<TArgs extends unknown[], TResult> {
  fetch: (...args: TArgs) => Promise<TResult>;
  invalidate: (...args: TArgs) => void;
  invalidateAll: () => void;
}

export function useCachedFetch<TArgs extends unknown[], TResult>(
  cacheKey: string,
  fetcher: (...args: TArgs) => Promise<TResult>,
  ttlMs: number,
): CachedFetchController<TArgs, TResult> {
  const fetchWithCache = useCallback(
    async (...args: TArgs): Promise<TResult> => {
      const resolvedKey = buildCacheKey(cacheKey, args);
      const now = Date.now();
      const existingEntry = memoryCache.get(resolvedKey) as
        | CacheEntry<TResult>
        | undefined;

      if (
        existingEntry &&
        existingEntry.value !== undefined &&
        existingEntry.expiresAt > now
      ) {
        return existingEntry.value;
      }

      if (existingEntry?.inflight) {
        return existingEntry.inflight;
      }

      const inflight = fetcher(...args)
        .then((result) => {
          memoryCache.set(resolvedKey, {
            value: result,
            expiresAt: Date.now() + ttlMs,
          });
          return result;
        })
        .catch((error: unknown) => {
          if (existingEntry?.value !== undefined) {
            memoryCache.set(resolvedKey, {
              value: existingEntry.value,
              expiresAt: existingEntry.expiresAt,
            });
          } else {
            memoryCache.delete(resolvedKey);
          }

          throw error;
        });

      memoryCache.set(resolvedKey, {
        value: existingEntry?.value,
        expiresAt: existingEntry?.expiresAt ?? 0,
        inflight,
      });

      return inflight;
    },
    [cacheKey, fetcher, ttlMs],
  );

  const invalidate = useCallback(
    (...args: TArgs) => {
      memoryCache.delete(buildCacheKey(cacheKey, args));
    },
    [cacheKey],
  );

  const invalidateAll = useCallback(() => {
    const keyPrefix = `${cacheKey}:`;

    for (const key of memoryCache.keys()) {
      if (key === cacheKey || key.startsWith(keyPrefix)) {
        memoryCache.delete(key);
      }
    }
  }, [cacheKey]);

  return useMemo(
    () => ({
      fetch: fetchWithCache,
      invalidate,
      invalidateAll,
    }),
    [fetchWithCache, invalidate, invalidateAll],
  );
}
