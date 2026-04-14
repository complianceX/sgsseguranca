import { Controller, Get, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/enums/roles.enum';
import { TenantRateLimitService } from '../rate-limit/tenant-rate-limit.service';
import { REDIS_CLIENT_CACHE } from '../redis/redis.constants';
import { Redis } from 'ioredis';
import { TenantOptional } from '../decorators/tenant-optional.decorator';

/**
 * Endpoint administrativo de monitoramento de rate limits.
 *
 * Acesso restrito a ADMIN_GERAL.
 * Retorna snapshot atual dos contadores no Redis.
 */
@Controller('admin/rate-limits')
@TenantOptional()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_GERAL)
export class RateLimitsAdminController {
  constructor(
    private readonly tenantRateLimitService: TenantRateLimitService,
    @Inject(REDIS_CLIENT_CACHE) private readonly redis: Redis,
  ) {}

  /**
   * GET /admin/rate-limits/status
   *
   * Retorna estatísticas agregadas de rate limiting:
   * - Contagem de chaves IP ativas no ThrottlerModule (Redis)
   * - Contagem de chaves de tenant ativos
   * - Top rotas com rate limit por usuário (user_rl:*)
   * - Violações recentes (tenant_rate_limit_exceeded)
   */
  @Get('status')
  async getStatus() {
    const [ipStats, tenantStats, userAiStats] = await Promise.allSettled([
      this.getIpThrottlerStats(),
      this.getTenantStats(),
      this.getUserAiStats(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      ip_throttler: {
        storage: 'redis',
        ...(ipStats.status === 'fulfilled'
          ? ipStats.value
          : { error: 'Indisponível' }),
      },
      tenants: {
        ...(tenantStats.status === 'fulfilled'
          ? tenantStats.value
          : { error: 'Indisponível' }),
      },
      ai_users: {
        ...(userAiStats.status === 'fulfilled'
          ? userAiStats.value
          : { error: 'Indisponível' }),
      },
    };
  }

  private async getIpThrottlerStats() {
    let cursor = '0';
    let hitCount = 0;
    let blockCount = 0;

    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'throttler:hit:*',
        'COUNT',
        200,
      );
      cursor = next;
      hitCount += keys.length;
    } while (cursor !== '0');

    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'throttler:block:*',
        'COUNT',
        200,
      );
      cursor = next;
      blockCount += keys.length;
    } while (cursor !== '0');

    return {
      active_ip_windows: hitCount,
      currently_blocked_ips: blockCount,
    };
  }

  private async getTenantStats() {
    let cursor = '0';
    const tenantMinuteKeys: string[] = [];

    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'ratelimit:*:minute:*',
        'COUNT',
        500,
      );
      cursor = next;
      tenantMinuteKeys.push(...keys);
    } while (cursor !== '0');

    // Extrair tenant IDs únicos
    const tenantIds = new Set(
      tenantMinuteKeys.map((k) => k.split(':')[1]).filter(Boolean),
    );

    return {
      active_tenants_this_minute: tenantIds.size,
      total_active_windows: tenantMinuteKeys.length,
    };
  }

  private async getUserAiStats() {
    let cursor = '0';
    const userKeys: string[] = [];

    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'user_rl:*',
        'COUNT',
        500,
      );
      cursor = next;
      userKeys.push(...keys);
    } while (cursor !== '0');

    // Agregar contadores por rota
    const routeCounts: Record<string, number> = {};
    if (userKeys.length > 0) {
      const values = await Promise.all(
        userKeys.map((key) => this.redis.zcard(key)),
      );
      for (let i = 0; i < userKeys.length; i++) {
        // user_rl:{userId}:{method}:{path}
        const parts = userKeys[i].split(':');
        const route = parts.slice(2).join(':');
        routeCounts[route] = (routeCounts[route] ?? 0) + Number(values[i] ?? 0);
      }
    }

    return {
      active_user_windows: userKeys.length,
      requests_by_route: routeCounts,
    };
  }
}
