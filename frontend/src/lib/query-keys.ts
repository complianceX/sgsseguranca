import { resolveBrowserCacheScope } from '@/lib/cache-scope';

export type QueryFilters = Record<string, unknown>;

function normalizeSegment(value: unknown): string {
  if (value === null || value === undefined) return 'none';
  if (typeof value === 'string') return value.trim() || 'none';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function normalizeQueryFilters(filters?: QueryFilters): string {
  if (!filters || Object.keys(filters).length === 0) return 'all';

  function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      const value = obj[key];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = sortObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  const sorted = sortObject(filters);
  return JSON.stringify(sorted);
}

function buildScopeSegments(companyId?: string, siteId?: string) {
  return [normalizeSegment(companyId), normalizeSegment(siteId)] as const;
}

function buildAprListPayload(params?: QueryFilters) {
  return normalizeQueryFilters(params);
}

type AprListKeyInput = {
  companyId?: string;
  siteId?: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  responsibleId?: string;
  dueFilter?: string;
  sort?: string;
  contextFilter?: string;
  periodStart?: string;
  periodEnd?: string;
  filters?: QueryFilters;
};

type AprCountKeyInput = AprListKeyInput;

type AprDetailKeyInput = {
  companyId?: string;
  siteId?: string;
  aprId?: string;
};

type AprScopedResourceKeyInput = AprDetailKeyInput & {
  resource?: string;
  suffix?: string;
  filters?: QueryFilters;
};

type AprQueryKeyBuilder = {
  (companyId?: string, siteId?: string, filters?: QueryFilters): readonly unknown[];
  list: (input?: AprListKeyInput) => readonly unknown[];
  detail: (input?: AprDetailKeyInput) => readonly unknown[];
  history: (input?: AprDetailKeyInput) => readonly unknown[];
  pdf: (input?: AprScopedResourceKeyInput) => readonly unknown[];
  export: (input?: AprScopedResourceKeyInput) => readonly unknown[];
  approvals: (input?: AprScopedResourceKeyInput) => readonly unknown[];
  attachments: (input?: AprScopedResourceKeyInput) => readonly unknown[];
  counts: (input?: AprListKeyInput) => readonly unknown[];
};

function aprListKey(input?: AprListKeyInput) {
  const { companyId, siteId, page, limit, ...rest } = input ?? {};
  return [
    'aprs',
    'list',
    ...buildScopeSegments(companyId, siteId),
    normalizeSegment(page),
    normalizeSegment(limit),
    buildAprListPayload(rest),
  ] as const;
}

function aprDetailKey(input?: AprDetailKeyInput) {
  return [
    'aprs',
    'detail',
    ...buildScopeSegments(input?.companyId, input?.siteId),
    normalizeSegment(input?.aprId),
  ] as const;
}

function aprScopedResourceKey(scope: 'history' | 'pdf' | 'export' | 'approvals' | 'attachments', input?: AprScopedResourceKeyInput) {
  return [
    'aprs',
    scope,
    ...buildScopeSegments(input?.companyId, input?.siteId),
    normalizeSegment(input?.aprId),
    normalizeSegment(input?.resource),
    normalizeSegment(input?.suffix),
    normalizeQueryFilters(input?.filters),
  ] as const;
}

export const queryKeys = {
  scope: {
    browser: () => ['scope', resolveBrowserCacheScope()] as const,
    company: (companyId?: string) => ['company', normalizeSegment(companyId)] as const,
    site: (companyId?: string, siteId?: string) =>
      ['site', normalizeSegment(companyId), normalizeSegment(siteId)] as const,
  },
  employees: (companyId?: string, siteId?: string, filters?: QueryFilters) =>
    ['employees', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(filters)] as const,
  users: (companyId?: string, siteId?: string, filters?: QueryFilters) =>
    ['users', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(filters)] as const,
  sectors: (companyId?: string, siteId?: string, filters?: QueryFilters) =>
    ['sectors', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(filters)] as const,
  roles: (companyId?: string, siteId?: string, filters?: QueryFilters) =>
    ['roles', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(filters)] as const,
  aprs: Object.assign(
    (companyId?: string, siteId?: string, filters?: QueryFilters) =>
      aprListKey({ companyId, siteId, filters }),
    {
      list: aprListKey,
      detail: aprDetailKey,
      history: (input?: AprDetailKeyInput) => aprScopedResourceKey('history', input),
      pdf: (input?: AprScopedResourceKeyInput) => aprScopedResourceKey('pdf', input),
      export: (input?: AprScopedResourceKeyInput) => aprScopedResourceKey('export', input),
      approvals: (input?: AprScopedResourceKeyInput) => aprScopedResourceKey('approvals', input),
      attachments: (input?: AprScopedResourceKeyInput) => aprScopedResourceKey('attachments', input),
      counts: (input?: AprCountKeyInput) => [
        'aprs',
        'counts',
        ...buildScopeSegments(input?.companyId, input?.siteId),
        normalizeSegment(input?.page),
        normalizeSegment(input?.limit),
        normalizeQueryFilters({
          search: input?.search,
          status: input?.status,
          responsibleId: input?.responsibleId,
          dueFilter: input?.dueFilter,
          sort: input?.sort,
          contextFilter: input?.contextFilter,
          periodStart: input?.periodStart,
          periodEnd: input?.periodEnd,
          filters: input?.filters,
        }),
      ] as const,
    },
  ) as AprQueryKeyBuilder,
  pts: (companyId?: string, siteId?: string, paginationOrFilters?: QueryFilters) =>
    ['pts', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(paginationOrFilters)] as const,
  dds: (companyId?: string, siteId?: string, paginationOrFilters?: QueryFilters) =>
    ['dds', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(paginationOrFilters)] as const,
  trainings: (companyId?: string, siteId?: string, filters?: QueryFilters) =>
    ['trainings', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(filters)] as const,
  inspections: (companyId?: string, siteId?: string, filters?: QueryFilters) =>
    ['inspections', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(filters)] as const,
  documents: (companyId?: string, siteId?: string, filters?: QueryFilters) =>
    ['documents', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(filters)] as const,
  notifications: (companyId?: string, siteId?: string, filters?: QueryFilters) =>
    ['notifications', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(filters)] as const,
  dashboard: (companyId?: string, siteId?: string, filters?: QueryFilters) =>
    ['dashboard', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(filters)] as const,
  reports: (companyId?: string, siteId?: string, filters?: QueryFilters) =>
    ['reports', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(filters)] as const,
  signatures: (companyId?: string, siteId?: string, filters?: QueryFilters) =>
    ['signatures', normalizeSegment(companyId), normalizeSegment(siteId), normalizeQueryFilters(filters)] as const,
};

export type QueryKeyFactory = typeof queryKeys;
