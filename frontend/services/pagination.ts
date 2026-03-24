export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  lastPage: number;
};

export type CursorPaginatedResponse<T> = {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
  total?: number;
};

type FetchAllPagesCacheEntry = {
  expiresAt: number;
  data: unknown[];
};

type FetchAllPagesProgressCallback = (
  loadedPages: number,
  totalPages: number,
  loadedItems: number,
) => void;

const DEFAULT_FETCH_ALL_PAGES_CACHE_TTL_MS = 30_000;
const fetchAllPagesCache = new Map<string, FetchAllPagesCacheEntry>();

function assertNotAborted(signal?: AbortSignal): void {
  if (!signal) {
    return;
  }

  if (signal.aborted) {
    throw new DOMException("Operação cancelada", "AbortError");
  }
}

function getCachedFetchAllPagesData<T>(cacheKey?: string): T[] | null {
  if (!cacheKey) {
    return null;
  }

  const now = Date.now();
  const entry = fetchAllPagesCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= now) {
    fetchAllPagesCache.delete(cacheKey);
    return null;
  }

  return [...(entry.data as T[])];
}

function setCachedFetchAllPagesData<T>(
  cacheKey: string | undefined,
  data: T[],
  ttlMs: number,
): void {
  if (!cacheKey || ttlMs <= 0) {
    return;
  }

  fetchAllPagesCache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    data: [...data],
  });
}

function resolveTotalPages<T>(first: PaginatedResponse<T>, limit: number): number {
  if (Number.isFinite(first.lastPage) && first.lastPage > 0) {
    return first.lastPage;
  }

  if (Number.isFinite(first.total) && first.total > 0) {
    return Math.max(1, Math.ceil(first.total / Math.max(1, limit)));
  }

  return 1;
}

export function clearFetchAllPagesCache(cacheKey?: string): void {
  if (!cacheKey) {
    fetchAllPagesCache.clear();
    return;
  }

  fetchAllPagesCache.delete(cacheKey);
}

export async function fetchAllPages<T>(opts: {
  fetchPage: (
    page: number,
    limit: number,
    signal?: AbortSignal,
  ) => Promise<PaginatedResponse<T>>;
  limit?: number;
  maxPages?: number;
  batchSize?: number;
  signal?: AbortSignal;
  cacheKey?: string;
  cacheTtlMs?: number;
  onProgress?: FetchAllPagesProgressCallback;
}): Promise<T[]> {
  const cached = getCachedFetchAllPagesData<T>(opts.cacheKey);
  if (cached) {
    const cachedTotalPages = Math.max(1, Math.ceil(cached.length / (opts.limit ?? 100)));
    opts.onProgress?.(cachedTotalPages, cachedTotalPages, cached.length);
    return cached;
  }

  assertNotAborted(opts.signal);

  const limit = opts.limit ?? 100;
  const maxPages = opts.maxPages ?? 50;
  const batchSize = Math.max(1, opts.batchSize ?? 3);
  const cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_FETCH_ALL_PAGES_CACHE_TTL_MS;

  const first = await opts.fetchPage(1, limit, opts.signal);
  const pages = Math.min(resolveTotalPages(first, limit), maxPages);
  const all = [...first.data];
  let loadedPages = 1;

  opts.onProgress?.(loadedPages, pages, all.length);

  if (pages <= 1) {
    setCachedFetchAllPagesData(opts.cacheKey, all, cacheTtlMs);
    return all;
  }

  for (let page = 2; page <= pages; page += batchSize) {
    assertNotAborted(opts.signal);

    const batchPages = Array.from(
      { length: Math.min(batchSize, pages - page + 1) },
      (_, index) => page + index,
    );

    const responses = await Promise.all(
      batchPages.map((currentPage) =>
        opts.fetchPage(currentPage, limit, opts.signal),
      ),
    );

    responses.forEach((res) => {
      all.push(...res.data);
    });

    loadedPages += responses.length;
    opts.onProgress?.(loadedPages, pages, all.length);
  }

  setCachedFetchAllPagesData(opts.cacheKey, all, cacheTtlMs);

  return all;
}
