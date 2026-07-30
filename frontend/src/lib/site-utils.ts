import { siteStore } from './siteStore';

/**
 * Obtém o site_id ativo para ser usado em queries de API.
 * Retorna undefined se não houver site ativo (para APIs que aceitam isso).
 */
export function getActiveSiteId(): string | undefined {
  const site = siteStore.get();
  return site?.siteId;
}

/**
 * Obtém o company_id ativo para ser usado em queries de API.
 * Retorna undefined se não houver empresa ativa.
 */
export function getActiveCompanyId(): string | undefined {
  // Imported dynamically to avoid circular dependencies
  const { selectedTenantStore } = require('./selectedTenantStore');
  const tenant = selectedTenantStore.get();
  return tenant?.companyId;
}

/**
 * Verifica se há um site ativo.
 */
export function hasActiveSite(): boolean {
  return !!siteStore.get();
}

/**
 * Verifica se há uma empresa ativa.
 */
export function hasActiveCompany(): boolean {
  const { selectedTenantStore } = require('./selectedTenantStore');
  return !!selectedTenantStore.get();
}

/**
 * Obtém o contexto completo de tenant para APIs.
 */
export function getApiTenantContext(): {
  companyId: string | undefined;
  siteId: string | undefined;
} {
  return {
    companyId: getActiveCompanyId(),
    siteId: getActiveSiteId(),
  };
}
