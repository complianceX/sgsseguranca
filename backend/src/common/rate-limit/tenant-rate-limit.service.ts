import { Injectable, Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.constants';
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
  constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}

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
          burstSize: planConfig.burstSize,
        }
      : planConfig;
    const now = Date.now();
    const scope = this.resolveScope(routeOverride, routeKey);
    const minuteKey = `ratelimit:${companyId}:${scope}:minute:${Math.floor(now / 60000)}`;
    const hourKey = `ratelimit:${companyId}:${scope}:hour:${Math.floor(now / 3600000)}`;

    // Incrementa minuto + hora em uma única operação atômica:
    // reduz round-trips no Redis e mantém garantia de TTL nas duas chaves.
    const rawCounters = await this.redis.eval(
      INCR_WITH_TTL_PAIR_SCRIPT,
      2,
      minuteKey,
      hourKey,
      '60',
      '3600',
    );

    if (!Array.isArray(rawCounters) || rawCounters.length < 2) {
      // Never silently allow requests when rate-limit storage is unhealthy.
      throw new Error('tenant_rate_limit_invalid_redis_eval_result');
    }

    const [minuteRaw, hourRaw] = rawCounters as Array<number | string>;

    const minuteCount = Number.isFinite(Number(minuteRaw))
      ? Number(minuteRaw)
      : 0;
    const hourCount = Number.isFinite(Number(hourRaw))
      ? Number(hourRaw)
      : 0;

    // Verificar limites
    const minuteExceeded = minuteCount > config.requestsPerMinute;
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
        config.requestsPerMinute - minuteCount,
        config.requestsPerHour - hourCount,
      ),
      resetAt: now + 60000,
    };
  }

  async resetTenant(companyId: string): Promise<void> {
    const pattern = `ratelimit:${companyId}:*`;
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

    const [minuteUsage, hourUsage] = await Promise.all([
      this.redis.get(minuteKey),
      this.redis.get(hourKey),
    ]);

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
}
