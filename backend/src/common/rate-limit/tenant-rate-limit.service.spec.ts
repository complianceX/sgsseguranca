import { Redis } from 'ioredis';
import { TenantRateLimitService } from './tenant-rate-limit.service';

class FakeRedis {
  public readonly evalCalls: Array<{
    numKeys: number;
    keys: string[];
    args: string[];
  }> = [];
  private readonly counters = new Map<string, number>();

  eval(
    _script: string,
    numKeys: number,
    ...params: string[]
  ): Promise<[number, number]> {
    const keys = params.slice(0, numKeys);
    const args = params.slice(numKeys);

    this.evalCalls.push({
      numKeys,
      keys,
      args,
    });

    const minuteKey = keys[0];
    const hourKey = keys[1];

    const minuteCount = (this.counters.get(minuteKey) ?? 0) + 1;
    const hourCount = (this.counters.get(hourKey) ?? 0) + 1;

    this.counters.set(minuteKey, minuteCount);
    this.counters.set(hourKey, hourCount);

    return Promise.resolve([minuteCount, hourCount]);
  }

  scan(): Promise<[string, string[]]> {
    return Promise.resolve(['0', []]);
  }

  unlink(..._keys: string[]): Promise<number> {
    return Promise.resolve(0);
  }

  get(_key: string): Promise<string | null> {
    return Promise.resolve(null);
  }
}

describe('TenantRateLimitService', () => {
  let service: TenantRateLimitService;
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
    service = new TenantRateLimitService(redis as unknown as Redis);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('incrementa minuto e hora em um único eval por checkLimit', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);

    const result = await service.checkLimit('company-1', 'STARTER');

    expect(result).toMatchObject({
      allowed: true,
      remaining: 59,
      resetAt: 61_000,
    });
    expect(redis.evalCalls).toHaveLength(1);
    expect(redis.evalCalls[0]).toMatchObject({
      numKeys: 2,
      args: ['60', '3600'],
    });
    expect(redis.evalCalls[0].keys[0]).toContain(
      'ratelimit:company-1:global:minute:',
    );
    expect(redis.evalCalls[0].keys[1]).toContain(
      'ratelimit:company-1:global:hour:',
    );
  });

  it('aplica limite customizado por rota quando TenantThrottle está presente', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(10_000);

    const routeOverride = {
      requestsPerMinute: 2,
      requestsPerHour: 10,
    };

    await expect(
      service.checkLimit(
        'company-1',
        'STARTER',
        routeOverride,
        'GET:/auth/me',
      ),
    ).resolves.toMatchObject({ allowed: true, remaining: 1 });

    await expect(
      service.checkLimit(
        'company-1',
        'STARTER',
        routeOverride,
        'GET:/auth/me',
      ),
    ).resolves.toMatchObject({ allowed: true, remaining: 0 });

    await expect(
      service.checkLimit(
        'company-1',
        'STARTER',
        routeOverride,
        'GET:/auth/me',
      ),
    ).resolves.toMatchObject({
      allowed: false,
      retryAfter: 60,
      remaining: 0,
      resetAt: 70_000,
    });
  });
});
