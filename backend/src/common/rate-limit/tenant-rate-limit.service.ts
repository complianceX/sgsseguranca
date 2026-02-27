import { Injectable, Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { Redis } from 'ioredis';

interface TenantRateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  burstSize: number; // Permitir burst de N requisições
}

// Planos padrão
const PLAN_LIMITS: Record<string, TenantRateLimitConfig> = {
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
};

@Injectable()
export class TenantRateLimitService {
  constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}

  async checkLimit(
    companyId: string,
    plan: keyof typeof PLAN_LIMITS = 'STARTER',
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
  }> {
    const config = PLAN_LIMITS[plan];
    const now = Date.now();
    const minuteKey = `ratelimit:${companyId}:minute:${Math.floor(now / 60000)}`;
    const hourKey = `ratelimit:${companyId}:hour:${Math.floor(now / 3600000)}`;

    // Incrementar contadores
    const [minuteCount, hourCount] = await Promise.all([
      this.redis.incr(minuteKey),
      this.redis.incr(hourKey),
    ]);

    // Setar expiração (primeira vez)
    if (minuteCount === 1) {
      await this.redis.expire(minuteKey, 60);
    }
    if (hourCount === 1) {
      await this.redis.expire(hourKey, 3600);
    }

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
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async getTenantStats(companyId: string): Promise<{
    minuteUsage: number;
    hourUsage: number;
  }> {
    const now = Date.now();
    const minuteKey = `ratelimit:${companyId}:minute:${Math.floor(now / 60000)}`;
    const hourKey = `ratelimit:${companyId}:hour:${Math.floor(now / 3600000)}`;

    const [minuteUsage, hourUsage] = await Promise.all([
      this.redis.get(minuteKey),
      this.redis.get(hourKey),
    ]);

    return {
      minuteUsage: parseInt(minuteUsage || '0', 10),
      hourUsage: parseInt(hourUsage || '0', 10),
    };
  }
}
