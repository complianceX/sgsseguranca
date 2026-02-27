import { Injectable, Scope } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable({ scope: Scope.DEFAULT })
export class TenantService {
  // SECURITY: Armazena o contexto por requisição; impede que o tenant vaze entre requisições
  private static readonly storage = new AsyncLocalStorage<string>();

  // SECURITY: Usa run() para criar um contexto ISOLADO por callback, evitando Tenant Bleeding
  setTenantId<T>(tenantId: string, callback: () => T): T {
    return TenantService.storage.run(tenantId, callback);
  }

  // SECURITY: Recupera o tenant da AsyncLocalStorage, garantindo leitura do contexto correto
  getTenantId(): string | undefined {
    return TenantService.storage.getStore();
  }

  // SECURITY: Método explícito para uso direto; executa handler dentro do contexto isolado
  run<T>(tenantId: string, callback: () => T): T {
    return TenantService.storage.run(tenantId, callback);
  }
}
