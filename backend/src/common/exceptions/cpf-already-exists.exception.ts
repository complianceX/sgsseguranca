import { BusinessException } from './business.exception';

export class CpfAlreadyExistsException extends BusinessException {
  constructor() {
    super('CPF já cadastrado no sistema', 'CPF_ALREADY_EXISTS');
  }
}
