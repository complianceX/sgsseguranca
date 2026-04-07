'use client';

import { useCallback, useMemo } from 'react';
import { recordClientMetric } from '@/lib/perf/clientMetrics';
import { selectedTenantStore } from '@/lib/selectedTenantStore';

type CacheEntry<TResult> = {
  value?: TResult;
  expiresAt: number;
  inflight?: Promise<TResult>;
  lastAccessedAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const CACHE_CLEANUP_INTERVAL_MS = 60_000;
const MAX_MEMORY_CACHE_ENTRIES = 500;
let lastCacheCleanupAt = 0;

function maybePruneCache(force = false) {
  const now = Date.now();
  if (
    !force &&
    now - lastCacheCleanupAt < CACHE_CLEANUP_INTERVAL_MS &&
    memoryCache.size <= MAX_MEMORY_CACHE_ENTRIES
  ) {
    return;
  }

  lastCacheCleanupAt = now;

  for (const [key, entry] of memoryCache.entries()) {
    if (!entry.inflight && entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }

  if (memoryCache.size <= MAX_MEMORY_CACHE_ENTRIES) {
    return;
  }

  const evictableEntries = Array.from(memoryCache.entries())
    .filter(([, entry]) => !entry.inflight)
    .sort(
      (left, right) =>
        (left[1].lastAccessedAt ?? 0) - (right[1].lastAccessedAt ?? 0),
    );

  const overflow = memoryCache.size - MAX_MEMORY_CACHE_ENTRIES;
  for (
    let index = 0;
    index < overflow && index < evictableEntries.length;
    index += 1
  ) {
    memoryCache.delete(evictableEntries[index][0]);
  }
}

function buildCacheKey(
  baseKey: string,
  args: readonly unknown[],
  scope?: string,
) {
  const scopedBaseKey = scope ? `${baseKey}@${scope}` : baseKey;
  if (args.length === 0) {
    return scopedBaseKey;
  }

  return `${scopedBaseKey}:${JSON.stringify(args)}`;
}

function resolveTenantScopeKey() {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const tenant = selectedTenantStore.get();
  return tenant?.companyId ? `tenant:${tenant.companyId}` : 'tenant:none';
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
      maybePruneCache();
      const resolvedKey = buildCacheKey(
        cacheKey,
        args,
        resolveTenantScopeKey(),
      );
      const now = Date.now();
      const existingEntry = memoryCache.get(resolvedKey) as
        | CacheEntry<TResult>
        | undefined;

      if (
        existingEntry &&
        existingEntry.value !== undefined &&
        existingEntry.expiresAt > now
      ) {
        existingEntry.lastAccessedAt = now;
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
            lastAccessedAt: Date.now(),
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
              lastAccessedAt: existingEntry.lastAccessedAt ?? Date.now(),
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
        lastAccessedAt: now,
      });

      return inflight;
    },
    [cacheKey, fetcher, ttlMs],
  );

  const invalidate = useCallback(
    (...args: TArgs) => {
      const resolvedKey = buildCacheKey(
        cacheKey,
        args,
        resolveTenantScopeKey(),
      );
      memoryCache.delete(resolvedKey);
      maybePruneCache(true);
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
    const scopedPrefix = `${cacheKey}@`;
    let deletedCount = 0;

    for (const key of memoryCache.keys()) {
      if (
        key === cacheKey ||
        key.startsWith(keyPrefix) ||
        key.startsWith(scopedPrefix)
      ) {
        memoryCache.delete(key);
        deletedCount += 1;
      }
    }
      maybePruneCache(true);
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
