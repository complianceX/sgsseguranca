'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  dashboardService,
  type DashboardPendingQueueResponse,
  type DashboardSummaryResponse,
} from '@/services/dashboardService';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { CACHE_KEYS, DASHBOARD_CACHE_TTL_MS } from '@/lib/cache/cacheKeys';
import { selectedTenantStore } from '@/lib/selectedTenantStore';

// ─── Tipos auxiliares ──────────────────────────────────────────────────────────

export interface PendingQueueFilters {
  dateFrom?: string;
  dateTo?: string;
  siteId?: string;
}

export interface AsyncSlice<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface UseDashboardDataOptions {
  queueFilters?: PendingQueueFilters;
}

export interface UseDashboardDataResult {
  summary: AsyncSlice<DashboardSummaryResponse | null>;
  pendingQueue: AsyncSlice<DashboardPendingQueueResponse>;
  lastUpdatedAt: Date | null;
  refreshAll: () => void;
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const EMPTY_PENDING_QUEUE: DashboardPendingQueueResponse = {
  degraded: false,
  failedSources: [],
  summary: {
    total: 0,
    totalFound: 0,
    hasMore: false,
    critical: 0,
    high: 0,
    medium: 0,
    documents: 0,
    health: 0,
    actions: 0,
    slaBreached: 0,
    slaDueToday: 0,
    slaDueSoon: 0,
  },
  items: [],
};

function toError(value: unknown, fallback: string): Error {
  if (value instanceof Error) return value;
  return new Error(fallback);
}

function buildQueueCacheKey(filters: PendingQueueFilters | undefined): string {
  const siteId = filters?.siteId ?? 'all';
  const dateFrom = filters?.dateFrom ?? '';
  const dateTo = filters?.dateTo ?? '';
  return `${CACHE_KEYS.dashboardPendingQueue}:${dateFrom}:${dateTo}:${siteId}`;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useDashboardData(
  options: UseDashboardDataOptions = {},
): UseDashboardDataResult {
  const { queueFilters } = options;
  const queueDateFrom = queueFilters?.dateFrom;
  const queueDateTo = queueFilters?.dateTo;
  const queueSiteId = queueFilters?.siteId;
  const resolvedQueueFilters = useMemo<PendingQueueFilters>(
    () => ({
      dateFrom: queueDateFrom,
      dateTo: queueDateTo,
      siteId: queueSiteId,
    }),
    [queueDateFrom, queueDateTo, queueSiteId],
  );

  // Observa o tenant selecionado — quando muda, forçamos re-fetch porque o
  // useCachedFetch já scopa a chave por tenant, mas a UI precisa voltar ao
  // estado de loading para evitar exibir dados do tenant anterior.
  const [tenantScope, setTenantScope] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return selectedTenantStore.get()?.companyId ?? null;
  });

  useEffect(() => {
    const unsub = selectedTenantStore.subscribe((tenant) => {
      setTenantScope(tenant?.companyId ?? null);
    });
    return () => {
      unsub();
    };
  }, []);

  // Estado do summary
  const [summaryData, setSummaryData] = useState<DashboardSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<Error | null>(null);

  // Estado da fila
  const [queueData, setQueueData] = useState<DashboardPendingQueueResponse>(EMPTY_PENDING_QUEUE);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<Error | null>(null);

  // Timestamp da última atualização bem-sucedida (qualquer fonte)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  // ── Caches ──────────────────────────────────────────────────────────────────

  const summaryCache = useCachedFetch(
    CACHE_KEYS.dashboardSummary,
    dashboardService.getSummary,
    DASHBOARD_CACHE_TTL_MS,
    { revalidateOnFocus: true, revalidateArgs: [] },
  );

  const getQueueWithFilters = useCallback(
    () => dashboardService.getPendingQueue(resolvedQueueFilters),
    [resolvedQueueFilters],
  );

  const queueCache = useCachedFetch(
    buildQueueCacheKey(resolvedQueueFilters),
    getQueueWithFilters,
    DASHBOARD_CACHE_TTL_MS,
    { revalidateOnFocus: true, revalidateArgs: [] },
  );

  // ── Tokens de refetch ───────────────────────────────────────────────────────
  // Incrementar força o effect correspondente a re-executar sem depender
  // de trocar referência do cache ou dos filtros.
  const [summaryRefetchToken, setSummaryRefetchToken] = useState(0);
  const [queueRefetchToken, setQueueRefetchToken] = useState(0);

  // ── Effect: fetch do summary ────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    setSummaryLoading(true);

    (async () => {
      try {
        const result = await summaryCache.fetch();
        if (!active) return;
        setSummaryData(result);
        setSummaryError(null);
        setLastUpdatedAt(new Date());
      } catch (err) {
        if (!active) return;
        setSummaryError(toError(err, 'Dados de resumo indisponíveis.'));
      } finally {
        if (active) setSummaryLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [summaryCache, tenantScope, summaryRefetchToken]);

  // ── Effect: fetch da fila ───────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    setQueueLoading(true);

    (async () => {
      try {
        const result = await queueCache.fetch();
        if (!active) return;
        setQueueData(result);
        setQueueError(null);
        setLastUpdatedAt(new Date());
      } catch (err) {
        if (!active) return;
        setQueueError(toError(err, 'Fila de pendências indisponível.'));
      } finally {
        if (active) setQueueLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [queueCache, tenantScope, queueRefetchToken]);

  // ── Ações ───────────────────────────────────────────────────────────────────

  const refetchSummary = useCallback(() => {
    summaryCache.invalidateAll();
    setSummaryRefetchToken((n) => n + 1);
  }, [summaryCache]);

  const refetchQueue = useCallback(() => {
    queueCache.invalidateAll();
    setQueueRefetchToken((n) => n + 1);
  }, [queueCache]);

  const refreshAll = useCallback(() => {
    summaryCache.invalidateAll();
    queueCache.invalidateAll();
    setSummaryRefetchToken((n) => n + 1);
    setQueueRefetchToken((n) => n + 1);
  }, [summaryCache, queueCache]);

  // ── Slices memoizadas (evita recriar ref em cada render) ────────────────────

  const summary = useMemo<AsyncSlice<DashboardSummaryResponse | null>>(
    () => ({ data: summaryData, loading: summaryLoading, error: summaryError, refetch: refetchSummary }),
    [summaryData, summaryLoading, summaryError, refetchSummary],
  );

  const pendingQueue = useMemo<AsyncSlice<DashboardPendingQueueResponse>>(
    () => ({ data: queueData, loading: queueLoading, error: queueError, refetch: refetchQueue }),
    [queueData, queueLoading, queueError, refetchQueue],
  );

  return { summary, pendingQueue, lastUpdatedAt, refreshAll };
}
