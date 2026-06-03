import { BusinessException } from './business.exception';

export class InsufficientPermissionsException extends BusinessException {
  constructor() {
    super('Você não tem permissão para esta ação', 'INSUFFICIENT_PERMISSIONS');
  }
}
