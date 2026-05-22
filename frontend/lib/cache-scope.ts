import { selectedTenantStore } from '@/lib/selectedTenantStore';
import { sessionStore } from '@/lib/sessionStore';

export function resolveBrowserCacheScope(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const selectedTenant = selectedTenantStore.get();
  if (selectedTenant?.companyId) {
    return `tenant:${selectedTenant.companyId}`;
  }

  const session = sessionStore.get();
  const userId = session?.userId || session?.user?.id || 'anonymous';
  const companyId = session?.companyId || session?.user?.companyId || 'none';

  return `session:${userId}:${companyId}`;
}

export function scopeBrowserCacheKey(baseKey: string): string {
  return `${baseKey}@${resolveBrowserCacheScope()}`;
}
