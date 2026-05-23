import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';
import { TenantService } from '../common/tenant/tenant.service';

describe('NotificationsService', () => {
  let repo: jest.Mocked<Partial<Repository<Notification>>>;
  let gateway: { sendToUser: jest.Mock };
  let tenantService: Pick<TenantService, 'run'>;
  let service: NotificationsService;

  beforeEach(() => {
    repo = {
      save: jest.fn().mockImplementation((data) =>
        Promise.resolve({
          id: 'notification-1',
          ...(data as Record<string, unknown>),
        }),
      ),
      findOne: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findAndCount: jest.fn(),
    };
    gateway = {
      sendToUser: jest.fn(),
    };
    tenantService = {
      run: jest.fn((_, callback) => callback()),
    };

    service = new NotificationsService(
      repo as Repository<Notification>,
      gateway as never,
      tenantService as TenantService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('persiste a notificação mesmo quando o envio em tempo real falha', async () => {
    gateway.sendToUser.mockImplementation(() => {
      throw new Error('socket unavailable');
    });

    await expect(
      service.create({
        companyId: 'company-1',
        userId: 'user-1',
        type: 'warning',
        title: 'Fila degradada',
        message: 'A fila operacional foi carregada com falhas.',
      }),
    ).resolves.toMatchObject({
      id: 'notification-1',
      userId: 'user-1',
    });

    expect(repo.save).toHaveBeenCalled();
    expect(gateway.sendToUser).toHaveBeenCalled();
  });

  it('normaliza paginação inválida para valores seguros', async () => {
    repo.findAndCount = jest.fn().mockResolvedValue([[], 0]);

    await service.findAll('user-1', 'company-1', Number.NaN, Number.NaN);

    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
        where: { userId: 'user-1', company_id: 'company-1' },
      }),
    );
  });
});
