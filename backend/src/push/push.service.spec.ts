import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { NotFoundException } from '@nestjs/common';
import { PushService } from './push.service';
import { PushSubscription } from './entities/push-subscription.entity';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';

jest.mock('web-push', () => ({
  sendNotification: jest.fn(),
  setVapidDetails: jest.fn(),
}));

const sendNotificationMock = jest.mocked(webpush.sendNotification);

describe('PushService', () => {
  const originalPublicKey = process.env.VAPID_PUBLIC_KEY;
  const originalPrivateKey = process.env.VAPID_PRIVATE_KEY;

  let repo: jest.Mocked<Partial<Repository<PushSubscription>>>;
  let integration: { execute: IntegrationResilienceService['execute'] };
  let auditService: Pick<AuditService, 'log'>;

  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = 'public-key';
    process.env.VAPID_PRIVATE_KEY = 'private-key';

    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    integration = {
      execute: jest.fn(
        async <T>(
          _integrationName: string,
          fn: () => Promise<T>,
          _opts?: unknown,
        ) => fn(),
      ) as unknown as IntegrationResilienceService['execute'],
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = originalPublicKey;
    process.env.VAPID_PRIVATE_KEY = originalPrivateKey;
  });

  it('continua entregando quando uma inscrição falha e outra funciona', async () => {
    (repo.find as jest.Mock).mockResolvedValue([
      {
        endpoint: 'endpoint-1',
        keys: { p256dh: 'a', auth: 'b' },
      } as PushSubscription,
      {
        endpoint: 'endpoint-2',
        keys: { p256dh: 'c', auth: 'd' },
      } as PushSubscription,
    ]);

    sendNotificationMock
      .mockRejectedValueOnce(new Error('push unavailable'))
      .mockResolvedValueOnce({
        statusCode: 201,
        body: '',
        headers: {},
      });

    const service = new PushService(
      repo as Repository<PushSubscription>,
      integration as IntegrationResilienceService,
      auditService as AuditService,
    );

    await expect(
      service.sendNotificationToUser('user-1', { title: 'Teste' }),
    ).resolves.toMatchObject({
      delivered: 1,
      failed: 1,
      removedSubscriptions: 0,
      skipped: false,
    });
  });

  it('remove inscrição expirada sem derrubar o envio', async () => {
    const expiredError = Object.assign(new Error('expired'), {
      statusCode: 410,
    });
    (repo.find as jest.Mock).mockResolvedValue([
      {
        endpoint: 'endpoint-expired',
        keys: { p256dh: 'a', auth: 'b' },
      } as PushSubscription,
    ]);
    sendNotificationMock.mockRejectedValue(expiredError);

    const service = new PushService(
      repo as Repository<PushSubscription>,
      integration as IntegrationResilienceService,
      auditService as AuditService,
    );

    await expect(
      service.sendNotificationToUser('user-1', { title: 'Teste' }),
    ).resolves.toMatchObject({
      delivered: 0,
      failed: 1,
      removedSubscriptions: 1,
      skipped: false,
    });

    expect(repo.delete).toHaveBeenCalledWith({ endpoint: 'endpoint-expired' });
  });

  it('não remove subscription de outro usuário (IDOR bloqueado)', async () => {
    (repo.findOne as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'sub-foreign',
        endpoint: 'https://push.example/sub-foreign',
        userId: 'user-2',
        tenantId: 'tenant-1',
      } as PushSubscription);

    const service = new PushService(
      repo as Repository<PushSubscription>,
      integration as IntegrationResilienceService,
      auditService as AuditService,
    );

    await expect(
      service.removeSubscription({
        endpoint: 'https://push.example/sub-foreign',
        userId: 'user-1',
        tenantId: 'tenant-1',
        ip: '198.51.100.10',
        userAgent: 'jest',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(repo.delete).not.toHaveBeenCalledWith({ id: 'sub-foreign' });
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('não remove subscription quando tenant diverge (isolamento tenant)', async () => {
    (repo.findOne as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'sub-tenant-mismatch',
        endpoint: 'https://push.example/sub-tenant-mismatch',
        userId: 'user-1',
        tenantId: 'tenant-2',
      } as PushSubscription);

    const service = new PushService(
      repo as Repository<PushSubscription>,
      integration as IntegrationResilienceService,
      auditService as AuditService,
    );

    await expect(
      service.removeSubscription({
        endpoint: 'https://push.example/sub-tenant-mismatch',
        userId: 'user-1',
        tenantId: 'tenant-1',
        ip: '198.51.100.20',
        userAgent: 'jest',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(repo.delete).not.toHaveBeenCalledWith({ id: 'sub-tenant-mismatch' });
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('registra auditoria ao remover subscription própria', async () => {
    (repo.findOne as jest.Mock).mockResolvedValueOnce({
      id: 'sub-owned',
      endpoint: 'https://push.example/sub-owned',
      userId: 'user-1',
      tenantId: 'tenant-1',
      keys: { p256dh: 'a', auth: 'b' },
    } as PushSubscription);
    (repo.delete as jest.Mock).mockResolvedValue({ affected: 1 });

    const service = new PushService(
      repo as Repository<PushSubscription>,
      integration as IntegrationResilienceService,
      auditService as AuditService,
    );

    await service.removeSubscription({
      endpoint: 'https://push.example/sub-owned',
      userId: 'user-1',
      tenantId: 'tenant-1',
      ip: '198.51.100.30',
      userAgent: 'Mozilla/5.0',
    });

    expect(repo.delete).toHaveBeenCalledWith({ id: 'sub-owned' });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        companyId: 'tenant-1',
        action: AuditAction.DELETE,
        entity: 'push_subscription',
        entityId: 'sub-owned',
        ip: '198.51.100.30',
      }),
    );
  });
});
