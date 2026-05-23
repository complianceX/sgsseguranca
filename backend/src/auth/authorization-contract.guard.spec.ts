import { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AuthorizationContractGuard } from './authorization-contract.guard';
import { AUTHZ_OPTIONAL_KEY } from './authz-optional.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

describe('AuthorizationContractGuard', () => {
  const makeContext = (): ExecutionContext =>
    ({
      getHandler: jest.fn(() => function handler() {}),
      getClass: jest.fn(() => class TestController {}),
    }) as unknown as ExecutionContext;

  it('permite rotas publicas', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => key === IS_PUBLIC_KEY),
      getAllAndMerge: jest.fn(() => []),
    } as unknown as Reflector;
    const guard = new AuthorizationContractGuard(reflector);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('permite rotas com opt-out explicito', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => key === AUTHZ_OPTIONAL_KEY),
      getAllAndMerge: jest.fn(() => []),
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
      getAllAndMerge: jest.fn((key: string) => {
        if (key === GUARDS_METADATA) {
          return [RolesGuard, PermissionsGuard];
        }
        return [];
      }),
    } as unknown as Reflector;
    const guard = new AuthorizationContractGuard(reflector);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('bloqueia rota com @Roles sem RolesGuard', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === ROLES_KEY) return ['ADMIN_EMPRESA'];
        return undefined;
      }),
      getAllAndMerge: jest.fn((key: string) => {
        if (key === GUARDS_METADATA) {
          return [];
        }
        return [];
      }),
    } as unknown as Reflector;
    const guard = new AuthorizationContractGuard(reflector);

    expect(() => guard.canActivate(makeContext())).toThrow(
      'Rota com @Roles sem RolesGuard explícito.',
    );
  });

  it('bloqueia rota com @Permissions sem PermissionsGuard', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === PERMISSIONS_KEY) return ['can_manage_users'];
        return undefined;
      }),
      getAllAndMerge: jest.fn((key: string) => {
        if (key === GUARDS_METADATA) {
          return [RolesGuard];
        }
        return [];
      }),
    } as unknown as Reflector;
    const guard = new AuthorizationContractGuard(reflector);

    expect(() => guard.canActivate(makeContext())).toThrow(
      'Rota com @Permissions sem PermissionsGuard explícito.',
    );
  });

  it('bloqueia rota protegida sem contrato explicito', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => undefined),
      getAllAndMerge: jest.fn(() => []),
    } as unknown as Reflector;
    const guard = new AuthorizationContractGuard(reflector);

    expect(() => guard.canActivate(makeContext())).toThrow(
      'Rota protegida sem contrato explícito de autorização.',
    );
  });
});
