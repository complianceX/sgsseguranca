'use client';

import { useCallback, useMemo } from 'react';
import { recordClientMetric } from '@/lib/perf/clientMetrics';

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
        recordClientMetric({
          name: 'cache_hit',
          key: resolvedKey,
          ttlMs,
        });
        return existingEntry.value;
      }

      if (existingEntry?.inflight) {
        recordClientMetric({
          name: 'cache_inflight_reuse',
          key: resolvedKey,
          ttlMs,
        });
        return existingEntry.inflight;
      }

      const startedAt = performance.now();
      recordClientMetric({
        name: 'cache_miss',
        key: resolvedKey,
        ttlMs,
      });

      const inflight = fetcher(...args)
        .then((result) => {
          const durationMs = performance.now() - startedAt;
          memoryCache.set(resolvedKey, {
            value: result,
            expiresAt: Date.now() + ttlMs,
          });
          recordClientMetric({
            name: 'fetch_success',
            key: resolvedKey,
            ttlMs,
            durationMs,
          });
          return result;
        })
        .catch((error: unknown) => {
          const durationMs = performance.now() - startedAt;
          if (existingEntry?.value !== undefined) {
            memoryCache.set(resolvedKey, {
              value: existingEntry.value,
              expiresAt: existingEntry.expiresAt,
            });
          } else {
            memoryCache.delete(resolvedKey);
          }

          recordClientMetric({
            name: 'fetch_error',
            key: resolvedKey,
            ttlMs,
            durationMs,
            detail: {
              message: error instanceof Error ? error.message : String(error),
            },
          });

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
      const resolvedKey = buildCacheKey(cacheKey, args);
      memoryCache.delete(resolvedKey);
      recordClientMetric({
        name: 'cache_invalidate',
        key: resolvedKey,
        ttlMs,
      });
    },
    [cacheKey, ttlMs],
  );

  const invalidateAll = useCallback(() => {
    const keyPrefix = `${cacheKey}:`;
    let deletedCount = 0;

    for (const key of memoryCache.keys()) {
      if (key === cacheKey || key.startsWith(keyPrefix)) {
        memoryCache.delete(key);
        deletedCount += 1;
      }
    }
    recordClientMetric({
      name: 'cache_invalidate_all',
      key: cacheKey,
      ttlMs,
      detail: { deletedCount },
    });
  }, [cacheKey, ttlMs]);

  return useMemo(
    () => ({
      fetch: fetchWithCache,
      invalidate,
      invalidateAll,
    }),
    [fetchWithCache, invalidate, invalidateAll],
  );
}
