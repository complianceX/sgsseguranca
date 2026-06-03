import type { AxiosRequestConfig } from 'axios';

type TenantScopePayload = {
  company_id?: unknown;
};

export function normalizeTenantCompanyId(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

export function omitCompanyId<T extends TenantScopePayload>(
  data: T,
): Omit<T, 'company_id'> {
  const { company_id, ...body } = data;
  void company_id;
  return body;
}

export function tenantHeadersFromPayload(
  data: TenantScopePayload,
): Record<string, string> | undefined {
  const companyId = normalizeTenantCompanyId(data.company_id);
  return companyId ? { 'x-company-id': companyId } : undefined;
}

export function tenantConfigFromPayload(
  data: TenantScopePayload,
  baseConfig?: AxiosRequestConfig,
): AxiosRequestConfig | undefined {
  const tenantHeaders = tenantHeadersFromPayload(data);
  if (!tenantHeaders) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    headers: {
      ...(baseConfig?.headers || {}),
      ...tenantHeaders,
    },
  };
}
