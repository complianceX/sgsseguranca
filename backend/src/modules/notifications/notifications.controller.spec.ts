import { UnauthorizedException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { TenantService } from '../../shared/tenant/tenant.service';

describe('NotificationsController', () => {
  let notificationsService: jest.Mocked<
    Pick<
      NotificationsService,
      'findAll' | 'getUnreadCount' | 'markAsRead' | 'markAllAsRead'
    >
  >;
  let tenantService: jest.Mocked<Pick<TenantService, 'getTenantId'>>;
  let controller: NotificationsController;

  beforeEach(() => {
    notificationsService = {
      findAll: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      }),
      getUnreadCount: jest.fn().mockResolvedValue(3),
      markAsRead: jest.fn().mockResolvedValue({ success: true }),
      markAllAsRead: jest.fn().mockResolvedValue({ success: true }),
    };
    tenantService = {
      getTenantId: jest.fn().mockReturnValue(undefined),
    };

    controller = new NotificationsController(
      notificationsService as unknown as NotificationsService,
      tenantService as unknown as TenantService,
    );
  });

  it('prioriza o tenant efetivo da requisição para ADMIN_GERAL', async () => {
    await controller.findAll(
      {
        user: { userId: 'user-1' },
        tenant: { companyId: '11111111-1111-4111-8111-111111111111' },
      },
      '2',
      '15',
    );

    expect(notificationsService.findAll).toHaveBeenCalledWith(
      'user-1',
      '11111111-1111-4111-8111-111111111111',
      2,
      15,
    );
  });

  it('usa o tenant do AsyncLocalStorage como fallback quando req.tenant nao foi populado', async () => {
    tenantService.getTenantId.mockReturnValue(
      '22222222-2222-4222-8222-222222222222',
    );

    await controller.getUnreadCount({
      user: { userId: 'user-1' },
    });

    expect(notificationsService.getUnreadCount).toHaveBeenCalledWith(
      'user-1',
      '22222222-2222-4222-8222-222222222222',
    );
  });

  it('falha fechado quando nenhum contexto de tenant esta disponivel', () => {
    expect(() =>
      controller.markAllAsRead({
        user: { userId: 'user-1' },
      }),
    ).toThrow(UnauthorizedException);

    expect(notificationsService.markAllAsRead).not.toHaveBeenCalled();
  });
});
