import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AuthorizationContractGuard } from './authorization-contract.guard';
import { AUTHZ_OPTIONAL_KEY } from './authz-optional.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { ROLES_KEY } from './roles.decorator';

describe('AuthorizationContractGuard', () => {
  const makeContext = (): ExecutionContext =>
    ({
      getHandler: jest.fn(() => function handler() {}),
      getClass: jest.fn(() => class TestController {}),
    }) as unknown as ExecutionContext;

  it('permite rotas publicas', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => key === IS_PUBLIC_KEY),
    } as unknown as Reflector;
    const guard = new AuthorizationContractGuard(reflector);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('permite rotas com opt-out explicito', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => key === AUTHZ_OPTIONAL_KEY),
    } as unknown as Reflector;
    const guard = new AuthorizationContractGuard(reflector);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('permite rotas com roles ou permissions', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === ROLES_KEY) return ['ADMIN_EMPRESA'];
        if (key === PERMISSIONS_KEY) return ['can_view_dashboard'];
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new AuthorizationContractGuard(reflector);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('bloqueia rota protegida sem contrato explicito', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => undefined),
    } as unknown as Reflector;
    const guard = new AuthorizationContractGuard(reflector);

    expect(() => guard.canActivate(makeContext())).toThrow(
      'Rota protegida sem contrato explícito de autorização.',
    );
  });
});
