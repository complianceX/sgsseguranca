import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { Request } from 'express';

/**
 * Sistema de rate limiting resiliente com fail-closed em rotas críticas
 * Mantém proteção mesmo quando Redis está offline
 */
@Injectable()
export class ResilientThrottlerService {
  // Em-memory fallback para rotas críticas (fail-closed)
  private readonly inMemoryCounters = new Map<
    string,
    { count: number; resetTime: number }
  >();

  // Limites por tipo de rota — carregados de env
  private readonly rateLimits: Record<
    string,
    { limit: number; window: number }
  >;
  private readonly enabled: boolean;
  private readonly failClosed: boolean;
  private readonly windowMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.enabled = this.configService.get<boolean>('THROTTLER_ENABLED', true);
    this.failClosed = this.configService.get<boolean>(
      'THROTTLER_FAIL_CLOSED',
      true,
    );
    this.windowMs = this.configService.get<number>(
      'THROTTLER_WINDOW_MS',
      60 * 1000,
    );

    // Carregar limites de env com fallbacks
    this.rateLimits = {
      AUTH_ROUTES: {
        limit: this.configService.get<number>('THROTTLER_AUTH_LIMIT', 5),
        window: this.windowMs,
      },
      PUBLIC_VALIDATE: {
        limit: this.configService.get<number>('THROTTLER_PUBLIC_LIMIT', 10),
        window: this.windowMs,
      },
      API_ROUTES: {
        limit: this.configService.get<number>('THROTTLER_API_LIMIT', 100),
        window: this.windowMs,
      },
      DASHBOARD: {
        limit: this.configService.get<number>('THROTTLER_DASHBOARD_LIMIT', 50),
        window: this.windowMs,
      },
    };
  }

  /**
   * Determinar tipo de rota (para escolher fail strategy)
   */
  getRouteType(request: Request): string {
    const path = (request.path || request.url || '')
      .toLowerCase()
      .split('?')[0];
    const isHealthProbe =
      path === '/health/public' ||
      path === '/health' ||
      path === '/health/live' ||
      path === '/health/ready';
    const isPublicValidationRoute = /^\/public\/[^/]+\/validate(?:\/|$)/.test(
      path,
    );

    if (path.includes('/auth/login') || path.includes('/auth/register')) {
      return 'AUTH_ROUTES'; // CRÍTICO
    }
    if (isHealthProbe) {
      return 'API_ROUTES'; // não pode entrar em bucket de validação pública
    }
    if (isPublicValidationRoute) {
      return 'PUBLIC_VALIDATE'; // CRÍTICO
    }
    if (path.includes('/dashboard')) {
      return 'DASHBOARD'; // IMPORTANTE
    }

    return 'API_ROUTES'; // NORMAL
  }

  shouldThrottle(request: Request): boolean {
    return this.getRouteType(request) !== 'API_ROUTES';
  }

  /**
   * Verificar se requisição foi rate-limitada
   * Retorna { isBlocked, remainingTime }
   */
  async checkLimit(
    request: Request,
    identifier: string,
  ): Promise<{ isBlocked: boolean; remainingTime?: number }> {
    const routeType = this.getRouteType(request);
    const config = this.rateLimits[routeType];
    const key = `throttle:${routeType}:${identifier}`;

    try {
      // Tentar usar Redis primeiro (ideal)
      return await this.checkRateLimitRedis(key, config);
    } catch (redisError: unknown) {
      // Redis falhou - usar fallback conforme tipo de rota
      const redisErrorMessage =
        redisError instanceof Error ? redisError.message : String(redisError);
      console.warn(`⚠️ Redis error on ${routeType}:`, redisErrorMessage);

      if (routeType === 'AUTH_ROUTES' || routeType === 'PUBLIC_VALIDATE') {
        // ❌ FAIL-CLOSED em rotas críticas
        // Bloquear requisição para evitar brute-force
        throw new HttpException(
          'Service temporarily unavailable. Please try again in a few minutes.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // ✅ FAIL-OPEN em rotas normais (cache em memória)
      return this.checkRateLimitInMemory(key, config);
    }
  }

  /**
   * Verificar rate limit via Redis (online)
   */
  private async checkRateLimitRedis(
    key: string,
    config: { limit: number; window: number },
  ): Promise<{ isBlocked: boolean; remainingTime?: number }> {
    const redis = this.redisService.getClient();
    const ttlSeconds = Math.ceil(config.window / 1000);
    if (typeof (redis as { eval?: unknown }).eval !== 'function') {
      return this.checkRateLimitRedisWithoutEval(redis, key, config, ttlSeconds);
    }

    const script = `
          local count = redis.call('INCR', KEYS[1])
          local ttl = redis.call('TTL', KEYS[1])
          if count == 1 or ttl < 0 then
            redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
            ttl = tonumber(ARGV[1])
          end
          return {count, ttl}
        `;
    let result: [number, number];
    try {
      result = (await redis.eval(script, 1, key, String(ttlSeconds))) as [
        number,
        number,
      ];
    } catch (error) {
      if (this.isInMemoryEvalUnsupported(error)) {
        return this.checkRateLimitRedisWithoutEval(
          redis,
          key,
          config,
          ttlSeconds,
        );
      }
      throw error;
    }
    const count = Number(result?.[0] ?? 0);
    const ttl = Number(result?.[1] ?? ttlSeconds);

    if (count > config.limit) {
      const remainingTime = Math.max(ttl, ttlSeconds) * 1000;
      return { isBlocked: true, remainingTime };
    }

    return { isBlocked: false };
  }

  private async checkRateLimitRedisWithoutEval(
    redis: {
      incr: (key: string) => Promise<number>;
      ttl: (key: string) => Promise<number>;
      expire: (key: string, seconds: number) => Promise<number>;
    },
    key: string,
    config: { limit: number; window: number },
    ttlSeconds: number,
  ): Promise<{ isBlocked: boolean; remainingTime?: number }> {
    const count = await redis.incr(key);
    const ttl = await redis.ttl(key);
    const effectiveTtl = ttl < 0 ? ttlSeconds : ttl;

    if (count === 1 || ttl < 0) {
      await redis.expire(key, ttlSeconds);
    }

    if (count > config.limit) {
      return { isBlocked: true, remainingTime: effectiveTtl * 1000 };
    }

    return { isBlocked: false };
  }

  /**
   * Fallback em memória (quando Redis está offline)
   * Apenas para rotas low-risk
   */
  private checkRateLimitInMemory(
    key: string,
    config: { limit: number; window: number },
  ): { isBlocked: boolean; remainingTime?: number } {
    const now = Date.now();
    const counter = this.inMemoryCounters.get(key);

    // Expirou? Reset
    if (!counter || now > counter.resetTime) {
      this.inMemoryCounters.set(key, {
        count: 1,
        resetTime: now + config.window,
      });
      return { isBlocked: false };
    }

    counter.count++;

    if (counter.count > config.limit) {
      const remainingTime = counter.resetTime - now;
      return { isBlocked: true, remainingTime };
    }

    return { isBlocked: false };
  }

  /**
   * Reset manual (admin cleanup)
   */
  async resetLimit(identifier: string): Promise<void> {
    const redis = this.redisService.getClient();
    await redis.del(`throttle:AUTH_ROUTES:${identifier}`);
    await redis.del(`throttle:PUBLIC_VALIDATE:${identifier}`);
    await redis.del(`throttle:DASHBOARD:${identifier}`);
    await redis.del(`throttle:API_ROUTES:${identifier}`);
  }

  private isInMemoryEvalUnsupported(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('in_memory_redis_eval_not_supported');
  }
}
