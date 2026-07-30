import { ServiceUnavailableException } from '@nestjs/common';
import { SstRateLimitService } from './sst-rate-limit.service';

describe('SstRateLimitService', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('incrementa limites de minuto e dia em uma única operação Lua', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, 1, 1, 60, 86_400]),
      incrby: jest.fn(),
    };
    const service = new SstRateLimitService(redis as never);
    const secondsUntilMidnight = jest
      .spyOn(
        service as unknown as { secondsUntilMidnight: () => number },
        'secondsUntilMidnight',
      )
      .mockReturnValue(12_345);

    await expect(service.checkAndConsume('tenant-atomic')).resolves.toEqual({
      allowed: true,
      remaining: {
        perMinute: 9,
        perDay: 199,
      },
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR', KEYS[1])"),
      2,
      expect.stringContaining('sst:rl:min:tenant-atomic'),
      expect.stringContaining('sst:rl:day:tenant-atomic'),
      '60',
      '12345',
      '10',
      '200',
    );
    secondsUntilMidnight.mockRestore();
  });

  it('cai para contenção local fora de produção quando Redis falha em runtime', async () => {
    const redis = {
      eval: jest.fn().mockRejectedValue(new Error('redis down')),
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

  it('falha fechado em produção quando Redis falha em tempo de execução', async () => {
    process.env.NODE_ENV = 'production';
    const redis = {
      eval: jest.fn().mockRejectedValue(new Error('redis down')),
      incrby: jest.fn(),
    };
    const service = new SstRateLimitService(redis as never);

    await expect(service.checkAndConsume('tenant-prod')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('usa a maior janela de retry quando minuto e dia estouram juntos', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([0, 10, 200, 60, 1_200]),
      incrby: jest.fn(),
    };
    const service = new SstRateLimitService(redis as never);

    await expect(service.checkAndConsume('tenant-both')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 1_200,
      remaining: {
        perMinute: 0,
        perDay: 0,
      },
    });
  });
});
