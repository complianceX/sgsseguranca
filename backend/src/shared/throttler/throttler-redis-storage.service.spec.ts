import type { Redis } from 'ioredis';
import { ThrottlerRedisStorageService } from './throttler-redis-storage.service';

type RedisEvalClient = Pick<Redis, 'eval'>;

describe('ThrottlerRedisStorageService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFailOpen = process.env.THROTTLER_STORAGE_FAIL_OPEN;
  const originalTimeout = process.env.THROTTLER_STORAGE_REDIS_TIMEOUT_MS;

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    if (originalFailOpen === undefined) {
      delete process.env.THROTTLER_STORAGE_FAIL_OPEN;
    } else {
      process.env.THROTTLER_STORAGE_FAIL_OPEN = originalFailOpen;
    }
    if (originalTimeout === undefined) {
      delete process.env.THROTTLER_STORAGE_REDIS_TIMEOUT_MS;
    } else {
      process.env.THROTTLER_STORAGE_REDIS_TIMEOUT_MS = originalTimeout;
    }
  });

  function createRedisMock(): jest.Mocked<RedisEvalClient> {
    return {
      eval: jest.fn(),
    };
  }

  it('retorna estado não bloqueado quando o limite não foi excedido', async () => {
    const redis = createRedisMock();
    redis.eval.mockResolvedValueOnce([3, 45_000, 0, 0] as never);

    const service = new ThrottlerRedisStorageService(redis as unknown as Redis);
    const result = await service.increment('10.0.0.1', 60_000, 5, 0, 'default');

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'throttler:hit:default:10.0.0.1',
      'throttler:block:default:10.0.0.1',
      '60000',
      '5',
      '0',
    );
    expect(result).toEqual({
      totalHits: 3,
      timeToExpire: 45,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('retorna estado bloqueado com TTL de bloqueio quando limite foi excedido', async () => {
    const redis = createRedisMock();
    redis.eval.mockResolvedValueOnce([7, 0, 1, 30_000] as never);

    const service = new ThrottlerRedisStorageService(redis as unknown as Redis);
    const result = await service.increment(
      '10.0.0.2',
      60_000,
      5,
      30_000,
      'auth',
    );

    expect(result).toEqual({
      totalHits: 7,
      timeToExpire: 0,
      isBlocked: true,
      timeToBlockExpire: 30,
    });
  });

  it('faz fail-open quando configurado e Redis falha', async () => {
    process.env.THROTTLER_STORAGE_FAIL_OPEN = 'true';
    const redis = createRedisMock();
    redis.eval.mockRejectedValueOnce(new Error('redis down'));

    const service = new ThrottlerRedisStorageService(redis as unknown as Redis);
    const result = await service.increment(
      '10.0.0.3',
      60_000,
      5,
      30_000,
      'auth',
    );

    expect(result).toEqual({
      totalHits: 0,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('propaga erro quando fail-open está desabilitado', async () => {
    process.env.THROTTLER_STORAGE_FAIL_OPEN = 'false';
    const redis = createRedisMock();
    redis.eval.mockRejectedValueOnce(new Error('redis down'));

    const service = new ThrottlerRedisStorageService(redis as unknown as Redis);

    await expect(
      service.increment('10.0.0.4', 60_000, 5, 30_000, 'auth'),
    ).rejects.toThrow('redis down');
  });
});
