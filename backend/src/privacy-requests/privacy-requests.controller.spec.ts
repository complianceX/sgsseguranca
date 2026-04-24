import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { PrivacyRequestsController } from './privacy-requests.controller';

describe('PrivacyRequestsController', () => {
  it('permite que todos os perfis autenticados abram direitos do titular', () => {
    const reflector = new Reflector();
    const roles = reflector.get<Role[]>(ROLES_KEY, PrivacyRequestsController);

    expect(roles).toEqual(
      expect.arrayContaining([
        Role.ADMIN_GERAL,
        Role.ADMIN_EMPRESA,
        Role.TST,
        Role.SUPERVISOR,
        Role.COLABORADOR,
        Role.TRABALHADOR,
      ]),
    );
  });

  it('mantem listagem e atualização do tenant restritas a administradores', () => {
    const reflector = new Reflector();
    const listTenantRoles = reflector.get<Role[]>(
      ROLES_KEY,
      PrivacyRequestsController.prototype.listTenant,
    );
    const updateStatusRoles = reflector.get<Role[]>(
      ROLES_KEY,
      PrivacyRequestsController.prototype.updateStatus,
    );

    expect(listTenantRoles).toEqual([Role.ADMIN_GERAL, Role.ADMIN_EMPRESA]);
    expect(updateStatusRoles).toEqual([Role.ADMIN_GERAL, Role.ADMIN_EMPRESA]);
  });
});
