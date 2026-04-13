import { Repository } from 'typeorm';
import { UserSession } from '../auth/entities/user-session.entity';
import { User } from '../users/entities/user.entity';
import { RbacService } from './rbac.service';
import { RbacWarmupService } from './rbac-warmup.service';

describe('RbacWarmupService', () => {
  let service: RbacWarmupService;
  let userSessionRepository: jest.Mocked<Repository<UserSession>>;
  let usersRepository: jest.Mocked<Repository<User>>;
  let rbacService: Pick<RbacService, 'getUserAccess'>;

  beforeEach(() => {
    delete process.env.RBAC_WARMUP_ENABLED;
    delete process.env.RBAC_WARMUP_DELAY_MS;
    delete process.env.RBAC_WARMUP_USER_LIMIT;

    userSessionRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserSession>>;
    usersRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;
    rbacService = {
      getUserAccess: jest.fn().mockResolvedValue({
        roles: ['Administrador Geral'],
        permissions: ['can_view_dashboard'],
      }),
    };

    service = new RbacWarmupService(
      userSessionRepository,
      usersRepository,
      rbacService as RbacService,
    );
  });

  it('primeUsers deduplica usuários válidos', async () => {
    await service.primeUsers([
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440001',
      'invalid-user',
      '550e8400-e29b-41d4-a716-446655440002',
    ]);

    expect(rbacService.getUserAccess).toHaveBeenCalledTimes(2);
    expect(rbacService.getUserAccess).toHaveBeenNthCalledWith(
      1,
      '550e8400-e29b-41d4-a716-446655440001',
    );
    expect(rbacService.getUserAccess).toHaveBeenNthCalledWith(
      2,
      '550e8400-e29b-41d4-a716-446655440002',
    );
  });

  it('aquece primeiro usuários com sessão ativa e completa com usuários recentes', async () => {
    userSessionRepository.find.mockResolvedValue([
      {
        user_id: '550e8400-e29b-41d4-a716-446655440010',
        last_active: new Date(),
      } as UserSession,
    ]);
    usersRepository.find.mockResolvedValue([
      { id: '550e8400-e29b-41d4-a716-446655440010' } as User,
      { id: '550e8400-e29b-41d4-a716-446655440011' } as User,
      { id: '550e8400-e29b-41d4-a716-446655440012' } as User,
    ]);

    await (service as unknown as { warmRecentUsers: () => Promise<void> }).warmRecentUsers();

    expect(userSessionRepository.find).toHaveBeenCalledTimes(1);
    expect(usersRepository.find).toHaveBeenCalledTimes(1);
    expect(rbacService.getUserAccess).toHaveBeenCalledTimes(3);
    expect(rbacService.getUserAccess).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440010',
    );
    expect(rbacService.getUserAccess).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440011',
    );
    expect(rbacService.getUserAccess).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440012',
    );
  });
});
