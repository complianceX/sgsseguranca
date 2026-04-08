import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PuppeteerPoolService } from '../common/services/puppeteer-pool.service';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly puppeteerPool: PuppeteerPoolService,
    private readonly healthService: HealthService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_view_system_health')
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      async () => {
        try {
          const store = (
            this.cacheManager as unknown as {
              store: {
                client?: { ping: () => Promise<void> };
                getClient?: () => { ping: () => Promise<void> };
              };
            }
          ).store;
          let isHealthy = false;

          if (store.client && typeof store.client.ping === 'function') {
            await store.client.ping();
            isHealthy = true;
          } else if (typeof store.getClient === 'function') {
            const client = store.getClient();
            if (client && typeof client.ping === 'function') {
              await client.ping();
              isHealthy = true;
            }
          } else {
            await this.cacheManager.set('health-check', 'ok', 1000);
            const val = await this.cacheManager.get('health-check');
            isHealthy = val === 'ok';
          }

          return {
            redis: {
              status: isHealthy ? 'up' : 'down',
            },
          };
        } catch (error) {
          return {
            redis: {
              status: 'down',
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      },
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () =>
        this.disk.checkStorage('storage', {
          path: '/',
          thresholdPercent: 0.9,
        }),
    ]);
  }

  @Get('ready')
  @Public()
  ready() {
    return { status: 'ready' };
  }

  @Get('live')
  @Public()
  live() {
    return { status: 'alive' };
  }

  @Get('detailed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_view_system_health')
  async detailed() {
    const dbStatus = await this.healthService.checkDatabase();
    const memoryUsage = this.healthService.getMemoryUsage();

    return {
      status: dbStatus.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: dbStatus,
        memory: memoryUsage,
      },
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  @Get('puppeteer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_view_system_health')
  puppeteer() {
    try {
      const stats = this.puppeteerPool.getPoolStats();
      const ready = stats.total > 0 && stats.available > 0 && stats.inUse >= 0;
      return {
        status: ready ? 'up' : 'degraded',
        pool: stats,
      };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
