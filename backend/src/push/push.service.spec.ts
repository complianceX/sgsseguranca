import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { PushService } from './push.service';
import { PushSubscription } from './entities/push-subscription.entity';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';

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
});
