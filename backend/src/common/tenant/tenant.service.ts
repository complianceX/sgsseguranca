import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  companyId: string | undefined;
  isSuperAdmin: boolean;
}

@Injectable()
export class TenantService {
  private static readonly storage = new AsyncLocalStorage<TenantContext>();

  /** Executa callback dentro de um contexto de tenant isolado (anti-bleeding). */
  run<T>(ctx: TenantContext, callback: () => T): T {
    return TenantService.storage.run(ctx, callback);
  }

  /** Retorna o contexto completo do tenant atual. */
  getContext(): TenantContext | undefined {
    return TenantService.storage.getStore();
  }

  /** Retorna apenas o company_id do tenant atual. */
  getTenantId(): string | undefined {
    return TenantService.storage.getStore()?.companyId;
  }

  /** Retorna se o usuário atual é super-admin. */
  isSuperAdmin(): boolean {
    return TenantService.storage.getStore()?.isSuperAdmin ?? false;
  }

  /**
   * Retorna o tenantId atual sem necessidade de injeção de dependência.
   * Útil para serviços transversais (logger, metrics) que não podem usar DI.
   */
  static currentTenantId(): string | undefined {
    return TenantService.storage.getStore()?.companyId;
  }

  /**
   * @deprecated Use run({ companyId, isSuperAdmin }, callback) em vez disso.
   * Mantido para compatibilidade com código legado.
   */
  setTenantId<T>(tenantId: string, callback: () => T): T {
    return TenantService.storage.run(
      { companyId: tenantId, isSuperAdmin: false },
      callback,
    );
  }
}
