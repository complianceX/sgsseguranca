import { Injectable, Inject } from '@nestjs/common';
import { REDIS_CLIENT_CACHE } from '../redis/redis.constants';
import { Redis } from 'ioredis';
import type { TenantThrottleOptions } from '../decorators/tenant-throttle.decorator';

export interface TenantRateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  burstSize: number; // Permitir burst de N requisições
}

// Planos padrão
export const PLAN_LIMITS = {
  FREE: {
    requestsPerMinute: 10,
    requestsPerHour: 100,
    burstSize: 5,
  },
  STARTER: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    burstSize: 20,
  },
  PROFESSIONAL: {
    requestsPerMinute: 300,
    requestsPerHour: 10000,
    burstSize: 100,
  },
  ENTERPRISE: {
    requestsPerMinute: 1000,
    requestsPerHour: 100000,
    burstSize: 500,
  },
} as const satisfies Record<string, TenantRateLimitConfig>;

export type TenantRateLimitPlan = keyof typeof PLAN_LIMITS;

const DEFAULT_TENANT_RATE_LIMIT_PLAN: TenantRateLimitPlan = 'STARTER';

const INCR_WITH_TTL_PAIR_SCRIPT = `
  local minuteCount = redis.call('INCR', KEYS[1])
  if minuteCount == 1 then
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  end

  local hourCount = redis.call('INCR', KEYS[2])
  if hourCount == 1 then
    redis.call('EXPIRE', KEYS[2], tonumber(ARGV[2]))
  end

  return { minuteCount, hourCount }
`;

export function resolveDefaultTenantRateLimitPlan(
  env: NodeJS.ProcessEnv = process.env,
): TenantRateLimitPlan {
  const configured = env.TENANT_RATE_LIMIT_DEFAULT_PLAN?.trim().toUpperCase();

  if (configured && configured in PLAN_LIMITS) {
    return configured as TenantRateLimitPlan;
  }

  return DEFAULT_TENANT_RATE_LIMIT_PLAN;
}

export function normalizeTenantRateLimitPlan(
  value: unknown,
  fallback: TenantRateLimitPlan = resolveDefaultTenantRateLimitPlan(),
): TenantRateLimitPlan {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();
  return normalized in PLAN_LIMITS
    ? (normalized as TenantRateLimitPlan)
    : fallback;
}

@Injectable()
export class TenantRateLimitService {
  private readonly inMemoryCounters = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  constructor(@Inject(REDIS_CLIENT_CACHE) private redis: Redis) {}

  async checkLimit(
    companyId: string,
    plan: TenantRateLimitPlan = resolveDefaultTenantRateLimitPlan(),
    routeOverride?: TenantThrottleOptions,
    routeKey?: string,
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
  }> {
    const planConfig = PLAN_LIMITS[plan];
    const config = routeOverride
      ? {
          requestsPerMinute:
            routeOverride.requestsPerMinute ?? planConfig.requestsPerMinute,
          requestsPerHour:
            routeOverride.requestsPerHour ?? planConfig.requestsPerHour,
          // Rotas com override precisam ser determinísticas (ex.: /auth/login).
          // Burst é aplicado apenas ao plano global para absorver picos curtos.
          burstSize: 0,
        }
      : planConfig;
    const now = Date.now();
    const scope = this.resolveScope(routeOverride, routeKey);
    const minuteKey = `ratelimit:${companyId}:${scope}:minute:${Math.floor(now / 60000)}`;
    const hourKey = `ratelimit:${companyId}:${scope}:hour:${Math.floor(now / 3600000)}`;

    // Incrementa minuto + hora em uma única operação atômica:
    // reduz round-trips no Redis e mantém garantia de TTL nas duas chaves.
    let rawCounters: unknown;
    try {
      rawCounters = await this.redis.eval(
        INCR_WITH_TTL_PAIR_SCRIPT,
        2,
        minuteKey,
        hourKey,
        '60',
        '3600',
      );
    } catch (error) {
      if (isInMemoryRedisEvalUnsupported(error)) {
        rawCounters = this.incrementInMemoryCounters(minuteKey, hourKey, now);
      } else {
        throw error;
      }
    }

    if (!Array.isArray(rawCounters) || rawCounters.length < 2) {
      // Never silently allow requests when rate-limit storage is unhealthy.
      throw new Error('tenant_rate_limit_invalid_redis_eval_result');
    }

    const [minuteRaw, hourRaw] = rawCounters as Array<number | string>;

    const minuteCount = Number.isFinite(Number(minuteRaw))
      ? Number(minuteRaw)
      : 0;
    const hourCount = Number.isFinite(Number(hourRaw)) ? Number(hourRaw) : 0;

    // Verificar limites
    // burstSize permite picos curtos acima do limite de minuto (ex.: upload em lote),
    // mantendo o teto por hora como proteção estrutural.
    const minuteLimit = config.requestsPerMinute + (config.burstSize ?? 0);
    const minuteExceeded = minuteCount > minuteLimit;
    const hourExceeded = hourCount > config.requestsPerHour;

    if (minuteExceeded || hourExceeded) {
      const retryAfter = minuteExceeded ? 60 : 3600;
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + retryAfter * 1000,
        retryAfter,
      };
    }

    return {
      allowed: true,
      remaining: Math.min(
        minuteLimit - minuteCount,
        config.requestsPerHour - hourCount,
      ),
      resetAt: now + 60000,
    };
  }

  async resetTenant(companyId: string): Promise<void> {
    const pattern = `ratelimit:${companyId}:*`;
    for (const key of Array.from(this.inMemoryCounters.keys())) {
      this.purgeExpiredCounter(key);
      if (key.startsWith(`ratelimit:${companyId}:`)) {
        this.inMemoryCounters.delete(key);
      }
    }
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        500,
      );
      cursor = nextCursor;
      if (keys.length) {
        await this.redis.unlink(...keys);
      }
    } while (cursor !== '0');
  }

  async getTenantStats(companyId: string): Promise<{
    minuteUsage: number;
    hourUsage: number;
  }> {
    const now = Date.now();
    const minuteKey = `ratelimit:${companyId}:global:minute:${Math.floor(now / 60000)}`;
    const hourKey = `ratelimit:${companyId}:global:hour:${Math.floor(now / 3600000)}`;

    let minuteUsage: string | null;
    let hourUsage: string | null;
    try {
      [minuteUsage, hourUsage] = await Promise.all([
        this.redis.get(minuteKey),
        this.redis.get(hourKey),
      ]);
    } catch (error) {
      if (isInMemoryRedisEvalUnsupported(error)) {
        minuteUsage = String(this.readInMemoryCounter(minuteKey));
        hourUsage = String(this.readInMemoryCounter(hourKey));
      } else {
        throw error;
      }
    }

    return {
      minuteUsage: parseInt(minuteUsage || '0', 10),
      hourUsage: parseInt(hourUsage || '0', 10),
    };
  }

  private resolveScope(
    routeOverride?: TenantThrottleOptions,
    routeKey?: string,
  ): string {
    if (!routeOverride || !routeKey) {
      return 'global';
    }

    const normalized = routeKey.trim().toUpperCase();
    if (!normalized) {
      return 'global';
    }

    const encoded = Buffer.from(normalized).toString('base64url');
    return `route:${encoded}`;
  }

  private incrementInMemoryCounters(
    minuteKey: string,
    hourKey: string,
    now: number,
  ): [number, number] {
    const minuteCount = this.bumpInMemoryCounter(minuteKey, 60_000, now);
    const hourCount = this.bumpInMemoryCounter(hourKey, 3_600_000, now);
    return [minuteCount, hourCount];
  }

  private bumpInMemoryCounter(key: string, ttlMs: number, now: number): number {
    this.purgeExpiredCounter(key, now);
    const current = this.inMemoryCounters.get(key);
    const nextCount = (current?.count ?? 0) + 1;
    this.inMemoryCounters.set(key, {
      count: nextCount,
      expiresAt: now + ttlMs,
    });
    return nextCount;
  }

  private readInMemoryCounter(key: string, now = Date.now()): number {
    this.purgeExpiredCounter(key, now);
    return this.inMemoryCounters.get(key)?.count ?? 0;
  }

  private purgeExpiredCounter(key: string, now = Date.now()): void {
    const current = this.inMemoryCounters.get(key);
    if (current && current.expiresAt <= now) {
      this.inMemoryCounters.delete(key);
    }
  }
}

function isInMemoryRedisEvalUnsupported(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === 'in_memory_redis_eval_not_supported_require_real_redis'
  );
}
