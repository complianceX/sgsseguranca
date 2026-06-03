import { AsyncLocalStorage } from 'async_hooks';
import { EntityManager } from 'typeorm';

interface TenantStore {
  manager: EntityManager;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export const getTenantManager = (): EntityManager => {
  const store = tenantStorage.getStore();
  if (!store) {
    throw new Error('Tenant context not initialized');
  }
  return store.manager;
};
