import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { RbacService } from '../rbac/rbac.service';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let rbacService: jest.Mocked<Pick<RbacService, 'getUserAccess'>>;

  const createContext = (request: Record<string, unknown> = {}) => {
    const handler = jest.fn();
    const controller = jest.fn();

    return {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };

    rbacService = {
      getUserAccess: jest.fn(),
    };

    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      rbacService as unknown as RbacService,
    );
  });

  it('deve liberar acesso quando a rota não exige permissões', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await guard.canActivate(createContext({}));

    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PERMISSIONS_KEY, [
      expect.any(Function),
      expect.any(Function),
    ]);
    expect(rbacService.getUserAccess).not.toHaveBeenCalled();
  });

  it('deve liberar acesso quando a lista de permissões exigidas está vazia', async () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    const result = await guard.canActivate(createContext({}));

    expect(result).toBe(true);
    expect(rbacService.getUserAccess).not.toHaveBeenCalled();
  });

  it('deve negar acesso quando a rota exige permissão e não existe usuário no request', async () => {
    reflector.getAllAndOverride.mockReturnValue(['apr:read']);

    await expect(guard.canActivate(createContext({}))).rejects.toThrow(
      ForbiddenException,
    );

    expect(rbacService.getUserAccess).not.toHaveBeenCalled();
  });

  it('deve negar acesso quando o usuário não possui userId nem id', async () => {
    reflector.getAllAndOverride.mockReturnValue(['apr:read']);

    const request = {
      user: {
        roles: ['TRABALHADOR'],
        permissions: ['apr:read'],
      },
    };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      ForbiddenException,
    );

    expect(rbacService.getUserAccess).not.toHaveBeenCalled();
  });

  it('deve liberar acesso quando o usuário possui a permissão exigida via RBAC', async () => {
    reflector.getAllAndOverride.mockReturnValue(['apr:read']);

    rbacService.getUserAccess.mockResolvedValue({
      roles: ['ADMIN_EMPRESA'],
      permissions: ['apr:read', 'apr:create'],
    });

    const request = {
      user: {
        userId: 'user-123',
        profile: {
          nome: 'Administrador',
        },
      },
    };

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(rbacService.getUserAccess).toHaveBeenCalledWith('user-123', {
      profileName: 'Administrador',
    });
    expect(request.user).toEqual({
      userId: 'user-123',
      id: 'user-123',
      profile: {
        nome: 'Administrador',
      },
      roles: ['ADMIN_EMPRESA'],
      permissions: ['apr:read', 'apr:create'],
    });
  });

  it('deve usar id como fallback quando userId não existir', async () => {
    reflector.getAllAndOverride.mockReturnValue(['dds:read']);

    rbacService.getUserAccess.mockResolvedValue({
      roles: ['COLABORADOR'],
      permissions: ['dds:read'],
    });

    const request = {
      user: {
        id: 'user-456',
      },
    };

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(rbacService.getUserAccess).toHaveBeenCalledWith('user-456', {
      profileName: undefined,
    });
    expect(request.user).toMatchObject({
      id: 'user-456',
      userId: 'user-456',
      roles: ['COLABORADOR'],
      permissions: ['dds:read'],
    });
  });

  it('deve liberar acesso quando o usuário possui todas as permissões exigidas', async () => {
    reflector.getAllAndOverride.mockReturnValue(['apr:read', 'apr:approve']);

    rbacService.getUserAccess.mockResolvedValue({
      roles: ['ADMIN_EMPRESA'],
      permissions: ['apr:read', 'apr:approve', 'apr:create'],
    });

    const request = {
      user: {
        userId: 'user-789',
      },
    };

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(rbacService.getUserAccess).toHaveBeenCalledWith('user-789', {
      profileName: undefined,
    });
  });

  it('deve negar acesso quando faltar uma das permissões exigidas', async () => {
    reflector.getAllAndOverride.mockReturnValue(['apr:read', 'apr:approve']);

    rbacService.getUserAccess.mockResolvedValue({
      roles: ['TRABALHADOR'],
      permissions: ['apr:read'],
    });

    const request = {
      user: {
        userId: 'user-999',
      },
    };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      ForbiddenException,
    );

    expect(rbacService.getUserAccess).toHaveBeenCalledWith('user-999', {
      profileName: undefined,
    });
  });

  it('deve negar acesso mesmo se o request.user tiver permissão local, mas o RBAC não retornar essa permissão', async () => {
    reflector.getAllAndOverride.mockReturnValue(['apr:approve']);

    rbacService.getUserAccess.mockResolvedValue({
      roles: ['TRABALHADOR'],
      permissions: ['apr:read'],
    });

    const request = {
      user: {
        userId: 'user-local-permission',
        permissions: ['apr:approve'],
      },
    };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      ForbiddenException,
    );

    expect(rbacService.getUserAccess).toHaveBeenCalledWith(
      'user-local-permission',
      {
        profileName: undefined,
      },
    );
  });
});
