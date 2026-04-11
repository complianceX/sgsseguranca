import { Repository } from 'typeorm';
import { PROFILE_PERMISSION_FALLBACK, RbacService } from './rbac.service';
import { User } from '../users/entities/user.entity';
import { PermissionEntity } from './entities/permission.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { RedisService } from '../common/redis/redis.service';

type RedisClientMock = {
  get: jest.Mock;
  setex: jest.Mock;
  del: jest.Mock;
};

describe('RbacService cache curto', () => {
  let service: RbacService;
  let userRolesRepository: jest.Mocked<Repository<UserRoleEntity>>;
  let rolePermissionsRepository: jest.Mocked<Repository<RolePermissionEntity>>;
  let permissionsRepository: jest.Mocked<Repository<PermissionEntity>>;
  let usersRepository: jest.Mocked<Repository<User>>;
  let redisService: Pick<RedisService, 'getClient'>;
  let redisClient: RedisClientMock;
  let userRolesFindMock: jest.Mock<Promise<UserRoleEntity[]>, []>;
  let rolePermissionsFindMock: jest.Mock<Promise<RolePermissionEntity[]>, []>;
  let usersFindMock: jest.Mock<Promise<User[]>, []>;
  let redisGetMock: jest.Mock;
  let redisSetexMock: jest.Mock;
  let redisDelMock: jest.Mock;
  let rolePermissionsQueryBuilder: {
    leftJoinAndSelect: jest.Mock;
    where: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    delete process.env.RBAC_ACCESS_CACHE_TTL_SECONDS;

    userRolesFindMock = jest.fn<Promise<UserRoleEntity[]>, []>();
    rolePermissionsFindMock = jest.fn<Promise<RolePermissionEntity[]>, []>();
    usersFindMock = jest.fn<Promise<User[]>, []>();
    userRolesRepository = {
      find: userRolesFindMock,
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockImplementation(() => userRolesFindMock()),
      }),
    } as unknown as jest.Mocked<Repository<UserRoleEntity>>;
    rolePermissionsQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(() => rolePermissionsFindMock()),
    };
    rolePermissionsRepository = {
      find: rolePermissionsFindMock,
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(rolePermissionsQueryBuilder),
    } as unknown as jest.Mocked<Repository<RolePermissionEntity>>;
    permissionsRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<PermissionEntity>>;
    usersRepository = {
      find: usersFindMock,
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    redisGetMock = jest.fn<Promise<string | null>, [string]>();
    redisSetexMock = jest.fn<Promise<string>, [string, number, string]>();
    redisDelMock = jest.fn<Promise<number>, [string, ...string[]]>();
    redisClient = {
      get: redisGetMock,
      setex: redisSetexMock,
      del: redisDelMock,
    };

    redisService = {
      getClient: jest.fn(() => redisClient as never),
    };

    service = new RbacService(
      userRolesRepository,
      rolePermissionsRepository,
      permissionsRepository,
      usersRepository,
      redisService as RedisService,
    );
  });

  it('reusa bundle de acesso do Redis quando disponível', async () => {
    redisGetMock.mockResolvedValue(
      JSON.stringify({
        roles: ['Administrador da Empresa'],
        permissions: ['can_view_dashboard'],
      }),
    );

    const result = await service.getUserAccess('user-1');

    expect(result).toEqual({
      roles: ['Administrador da Empresa'],
      permissions: ['can_view_dashboard'],
    });
    expect(userRolesFindMock.mock.calls).toHaveLength(0);
  });

  it('calcula e persiste bundle quando cache está vazio', async () => {
    redisGetMock.mockResolvedValue(null);
    redisSetexMock.mockResolvedValue('OK');
    userRolesFindMock.mockResolvedValue([
      {
        user_id: 'user-1',
        role_id: 'role-1',
        role: { id: 'role-1', name: 'Administrador Geral' },
      } as UserRoleEntity,
    ]);
    rolePermissionsFindMock.mockResolvedValue([
      {
        role_id: 'role-1',
        permission_id: 'perm-1',
        permission: { id: 'perm-1', name: 'can_view_dashboard' },
      } as RolePermissionEntity,
    ]);

    const result = await service.getUserAccess('user-1');

    expect(result.roles).toEqual(['Administrador Geral']);
    expect(result.permissions).toEqual(
      expect.arrayContaining([
        'can_view_dashboard',
        'can_view_dids',
        'can_manage_dids',
      ]),
    );
    expect(redisSetexMock.mock.calls[0]).toEqual([
      'rbac:access:user-1',
      120,
      JSON.stringify(result),
    ]);
  });

  it('mescla permissões fallback do papel quando role_permissions não contém permissões novas', async () => {
    redisGetMock.mockResolvedValue(null);
    redisSetexMock.mockResolvedValue('OK');
    userRolesFindMock.mockResolvedValue([
      {
        user_id: 'user-2',
        role_id: 'role-2',
        role: { id: 'role-2', name: 'Supervisor / Encarregado' },
      } as UserRoleEntity,
    ]);
    rolePermissionsFindMock.mockResolvedValue([
      {
        role_id: 'role-2',
        permission_id: 'perm-2',
        permission: { id: 'perm-2', name: 'can_view_dashboard' },
      } as RolePermissionEntity,
    ]);

    const result = await service.getUserAccess('user-2');

    expect(result.roles).toEqual(['Supervisor / Encarregado']);
    expect(result.permissions).toEqual(
      expect.arrayContaining([
        'can_view_dashboard',
        'can_view_dids',
        'can_manage_dids',
      ]),
    );
  });

  it('invalida cache de um usuário específico', async () => {
    redisDelMock.mockResolvedValue(1);

    await service.invalidateUserAccess('user-123');

    expect(redisDelMock.mock.calls[0]).toEqual(['rbac:access:user-123']);
  });

  it('invalida cache dos usuários de um profile', async () => {
    usersFindMock.mockResolvedValue([
      { id: 'user-a' } as User,
      { id: 'user-b' } as User,
    ]);
    redisDelMock.mockResolvedValue(2);

    const count = await service.invalidateUsersByProfileId('profile-1');

    expect(count).toBe(2);
    expect(usersFindMock.mock.calls[0]).toEqual([
      {
        where: { profile_id: 'profile-1' },
        select: { id: true },
      },
    ]);
    expect(redisDelMock.mock.calls[0]).toEqual([
      'rbac:access:user-a',
      'rbac:access:user-b',
    ]);
  });
});

describe('PROFILE_PERMISSION_FALLBACK', () => {
  it('mantém TST com o mesmo acesso do Administrador da Empresa', () => {
    const adminEmpresaPermissions = new Set(
      PROFILE_PERMISSION_FALLBACK['Administrador da Empresa'] || [],
    );
    const tstPermissions = new Set(
      PROFILE_PERMISSION_FALLBACK['Técnico de Segurança do Trabalho (TST)'] ||
        [],
    );

    expect(tstPermissions).toEqual(adminEmpresaPermissions);
    expect(tstPermissions.has('can_view_companies')).toBe(true);
    expect(tstPermissions.has('can_manage_users')).toBe(true);
  });
});
