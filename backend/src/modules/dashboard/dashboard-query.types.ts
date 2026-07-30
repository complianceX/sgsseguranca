export const DASHBOARD_QUERY_TYPES = [
  'summary',
  'kpis',
  'pending-queue',
  'heatmap',
  'tst-day',
] as const;

export type DashboardQueryType = (typeof DASHBOARD_QUERY_TYPES)[number];

export type DashboardMetaSource = 'redis' | 'snapshot' | 'live';

export type DashboardResponseMeta = {
  generatedAt: string;
  stale: boolean;
  source: DashboardMetaSource;
};

export type DashboardCachedPayload<T> = {
  value: T;
  generatedAt: number;
};

export const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
export const DASHBOARD_CACHE_STALE_WINDOW_MS = 30 * 1000;
export const DASHBOARD_SNAPSHOT_SCHEMA_VERSION = 1;
