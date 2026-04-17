import { Redis } from 'ioredis';
import { UserRateLimitService } from './user-rate-limit.service';

type ZSetEntry = {
  member: string;
  score: number;
};

class FakeRedis {
  private readonly zsets = new Map<string, ZSetEntry[]>();

  eval(
    _script: string,
    _numKeys: number,
    key: string,
    nowRaw: string,
    windowMsRaw: string,
    member: string,
    _ttlRaw: string,
  ): Promise<[number, number]> {
    const now = Number(nowRaw);
    const windowMs = Number(windowMsRaw);
    const minScore = now - windowMs;
    const active = (this.zsets.get(key) ?? []).filter(
      (entry) => entry.score > minScore,
    );

    active.push({ member, score: now });
    active.sort((left, right) => left.score - right.score);
    this.zsets.set(key, active);

    return Promise.resolve([active.length, active[0]?.score ?? now]);
  }

  zcount(key: string, min: string, _max: string): Promise<number> {
    const threshold = min.startsWith('(') ? Number(min.slice(1)) : Number(min);
    const entries = this.zsets.get(key) ?? [];
    return Promise.resolve(
      entries.filter((entry) => entry.score > threshold).length,
    );
  }

  zcard(key: string): Promise<number> {
    return Promise.resolve((this.zsets.get(key) ?? []).length);
  }
}

class InMemoryFallbackRedis {
  eval(): Promise<never> {
    return Promise.reject(
      new Error('in_memory_redis_eval_not_supported_require_real_redis'),
    );
  }

  zcount(): Promise<never> {
    return Promise.reject(
      new Error('in_memory_redis_eval_not_supported_require_real_redis'),
    );
  }
}

describe('UserRateLimitService', () => {
  let service: UserRateLimitService;
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
    service = new UserRateLimitService(redis as unknown as Redis);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aplica sliding window real por usuário e rota', async () => {
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000);
    await expect(
      service.checkLimit('user-1', 'GET:/users/me/export', 3),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 2,
      resetAt: 61_000,
    });

    nowSpy.mockReturnValue(20_000);
    await expect(
      service.checkLimit('user-1', 'GET:/users/me/export', 3),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
      resetAt: 61_000,
    });

    nowSpy.mockReturnValue(40_000);
    await expect(
      service.checkLimit('user-1', 'GET:/users/me/export', 3),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
      resetAt: 61_000,
    });

    nowSpy.mockReturnValue(50_000);
    await expect(
      service.checkLimit('user-1', 'GET:/users/me/export', 3),
    ).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
      resetAt: 61_000,
      retryAfter: 11,
    });

    nowSpy.mockReturnValue(110_001);
    await expect(
      service.checkLimit('user-1', 'GET:/users/me/export', 3),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 2,
      resetAt: 170_001,
    });
  });

  it('retorna uso atual agregado por rota dentro da janela ativa', async () => {
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000);
    await service.checkLimit('user-1', 'POST:/ai/analyze-apr', 5);

    nowSpy.mockReturnValue(10_000);
    await service.checkLimit('user-1', 'POST:/ai/analyze-apr', 5);

    nowSpy.mockReturnValue(20_000);
    await service.checkLimit('user-1', 'GET:/users/me/export', 3);

    nowSpy.mockReturnValue(30_000);
    await expect(
      service.getUserUsage('user-1', [
        'POST:/ai/analyze-apr',
        'GET:/users/me/export',
      ]),
    ).resolves.toEqual({
      'POST:/ai/analyze-apr': 2,
      'GET:/users/me/export': 1,
    });
  });

  it('usa fallback em memória quando o provedor Redis não suporta eval', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    service = new UserRateLimitService(
      new InMemoryFallbackRedis() as unknown as Redis,
    );

    nowSpy.mockReturnValue(1_000);
    await expect(
      service.checkLimit('user-1', 'GET:/dashboard/summary', 2),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
      resetAt: 61_000,
    });

    nowSpy.mockReturnValue(20_000);
    await expect(
      service.checkLimit('user-1', 'GET:/dashboard/summary', 2),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
      resetAt: 61_000,
    });

    nowSpy.mockReturnValue(30_000);
    await expect(
      service.checkLimit('user-1', 'GET:/dashboard/summary', 2),
    ).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfter: 31,
      resetAt: 61_000,
    });

    nowSpy.mockReturnValue(30_000);
    await expect(
      service.getUserUsage('user-1', ['GET:/dashboard/summary']),
    ).resolves.toEqual({
      'GET:/dashboard/summary': 3,
    });
  });
});
