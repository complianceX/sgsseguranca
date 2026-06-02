import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ResilientThrottlerService } from './resilient-throttler.service';

type RedisClientMock = {
  incr: jest.Mock;
  ttl: jest.Mock;
  expire: jest.Mock;
  eval?: jest.Mock;
};

describe('ResilientThrottlerService', () => {
  const buildService = (redisClient: RedisClientMock) => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const defaults: Record<string, unknown> = {
          THROTTLER_ENABLED: true,
          THROTTLER_FAIL_CLOSED: true,
          THROTTLER_WINDOW_MS: 60_000,
          THROTTLER_AUTH_LIMIT: 5,
          THROTTLER_PUBLIC_LIMIT: 10,
          THROTTLER_API_LIMIT: 100,
          THROTTLER_DASHBOARD_LIMIT: 50,
        };
        return key in defaults ? defaults[key] : defaultValue;
      }),
    } as unknown as ConfigService;

    const redisService = {
      getClient: () => redisClient,
    };

    return new ResilientThrottlerService(configService, redisService as never);
  };

  it('deve classificar /health/public como API_ROUTES, não PUBLIC_VALIDATE', async () => {
    const redisClient: RedisClientMock = {
      incr: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(60),
      expire: jest.fn().mockResolvedValue(1),
    };
    const service = buildService(redisClient);

    await service.checkLimit(
      { path: '/health/public', url: '/health/public' } as Request,
      'ip:127.0.0.1',
    );

    expect(redisClient.incr).toHaveBeenCalledWith(
      'throttle:API_ROUTES:ip:127.0.0.1',
    );
  });

  it('deve permitir auth routes quando o cliente Redis suporta incr/ttl/expire em modo degradado', async () => {
    const redisClient: RedisClientMock = {
      incr: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(-1),
      expire: jest.fn().mockResolvedValue(1),
    };
    const service = buildService(redisClient);

    await expect(
      service.checkLimit(
        { path: '/auth/login', url: '/auth/login' } as Request,
        'ip:127.0.0.1',
      ),
    ).resolves.toEqual({ isBlocked: false });

    expect(redisClient.expire).toHaveBeenCalledWith(
      'throttle:AUTH_ROUTES:ip:127.0.0.1',
      60,
    );
  });

  it('faz fallback do eval para incr/ttl/expire quando o Redis em memória não suporta Lua', async () => {
    const redisClient: RedisClientMock = {
      incr: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(-1),
      expire: jest.fn().mockResolvedValue(1),
      eval: jest
        .fn()
        .mockRejectedValue(
          new Error('in_memory_redis_eval_not_supported_require_real_redis'),
        ),
    };
    const service = buildService(redisClient);

    await expect(
      service.checkLimit(
        { path: '/auth/login', url: '/auth/login' } as Request,
        'ip:127.0.0.1',
      ),
    ).resolves.toEqual({ isBlocked: false });

    expect(redisClient.eval).toHaveBeenCalled();
    expect(redisClient.incr).toHaveBeenCalledWith(
      'throttle:AUTH_ROUTES:ip:127.0.0.1',
    );
  });

  it('deve pular throttle resiliente em API_ROUTES genéricas', () => {
    const redisClient: RedisClientMock = {
      incr: jest.fn(),
      ttl: jest.fn(),
      expire: jest.fn(),
    };
    const service = buildService(redisClient);

    expect(
      service.shouldThrottle({
        path: '/health/public',
        url: '/health/public',
      } as Request),
    ).toBe(false);
    expect(
      service.shouldThrottle({
        path: '/dashboard/summary',
        url: '/dashboard/summary',
      } as Request),
    ).toBe(true);
  });

  it('deve manter fail-closed apenas para validação pública real', async () => {
    const redisClient: RedisClientMock = {
      incr: jest.fn().mockRejectedValue(new Error('redis offline')),
      ttl: jest.fn(),
      expire: jest.fn(),
    };
    const service = buildService(redisClient);

    const blockedPromise = service.checkLimit(
      {
        path: '/public/documents/validate',
        url: '/public/documents/validate',
      } as Request,
      'ip:127.0.0.1',
    );

    await expect(blockedPromise).rejects.toBeInstanceOf(HttpException);

    await expect(
      service.checkLimit(
        { path: '/health/public', url: '/health/public' } as Request,
        'ip:127.0.0.1',
      ),
    ).resolves.toEqual({ isBlocked: false });

    try {
      await blockedPromise;
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  });
});
