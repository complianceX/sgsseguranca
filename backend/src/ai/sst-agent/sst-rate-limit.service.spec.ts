import { SstRateLimitService } from './sst-rate-limit.service';

describe('SstRateLimitService', () => {
  it('aplica limite local em memória quando Redis não está disponível', async () => {
    const service = new SstRateLimitService(null);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(service.checkAndConsume('tenant-1')).resolves.toEqual(
        expect.objectContaining({ allowed: true }),
      );
    }

    await expect(service.checkAndConsume('tenant-1')).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        retryAfterSeconds: 60,
      }),
    );
  });

  it('cai para fallback local quando Redis falha em tempo de execução', async () => {
    const redis = {
      incr: jest.fn().mockRejectedValue(new Error('redis down')),
      expire: jest.fn(),
      incrby: jest.fn(),
    };
    const service = new SstRateLimitService(redis as never);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(service.checkAndConsume('tenant-2')).resolves.toEqual(
        expect.objectContaining({ allowed: true }),
      );
    }

    await expect(service.checkAndConsume('tenant-2')).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        retryAfterSeconds: 60,
      }),
    );
  });
});
