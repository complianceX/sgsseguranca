import { BusinessException } from './business.exception';

export class TenantNotFoundException extends BusinessException {
  constructor() {
    super('Empresa não encontrada', 'TENANT_NOT_FOUND');
  }
}
